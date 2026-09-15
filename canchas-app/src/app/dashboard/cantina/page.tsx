'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { 
  Coffee, 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingBag, 
  QrCode, 
  CheckCircle2, 
  Search, 
  Clock,
  ChefHat,
  Printer,
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  Loader2,
  X,
  Banknote
} from 'lucide-react'
import { Card, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ThermalReceiptModal } from '@/components/shared/thermal-receipt'
import { CourtQrModal } from '@/components/dashboard/court-qr-modal'
import { formatARS, buildWhatsAppLink } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { toast } from 'sonner'
import {
  createCourtOrder,
  updateOrderStatus as dbUpdateOrderStatus,
  getDailyOrders,
  type CourtOrder,
  type OrderStatus,
  type CantinaPaymentMethod,
} from '@/actions/cantina.actions'

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001'

interface Product {
  id: string
  name: string
  category: 'BEBIDAS' | 'EQUIPAMIENTO' | 'SNACKS'
  price: number
  stock: number
  emoji: string
}

const CANTINA_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Gatorade / Powerade 500ml', category: 'BEBIDAS', price: 2500, stock: 48, emoji: '⚡' },
  { id: 'p2', name: 'Agua Mineral 500ml', category: 'BEBIDAS', price: 1500, stock: 60, emoji: '💧' },
  { id: 'p3', name: 'Cerveza Corona / Stella 330ml', category: 'BEBIDAS', price: 3500, stock: 36, emoji: '🍺' },
  { id: 'p4', name: 'Tubo Pelotas Pádel x3 (Bullpadel)', category: 'EQUIPAMIENTO', price: 14000, stock: 15, emoji: '🎾' },
  { id: 'p5', name: 'Alquiler de Paleta de Pádel', category: 'EQUIPAMIENTO', price: 3500, stock: 8, emoji: '🏓' },
  { id: 'p6', name: 'Overgrip Wilson / Bullpadel', category: 'EQUIPAMIENTO', price: 2200, stock: 25, emoji: '🏸' },
  { id: 'p7', name: 'Barra de Cereal / Proteica', category: 'SNACKS', price: 1200, stock: 30, emoji: '🍫' },
  { id: 'p8', name: 'Papas Fritas / Maní Snack', category: 'SNACKS', price: 1800, stock: 20, emoji: '🥜' },
]

// Singleton reutilizable para el contexto de audio (previene memory leaks y bloqueos del navegador)
let sharedAudioCtx: AudioContext | null = null
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass()
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {})
    }
    return sharedAudioCtx
  } catch {
    return null
  }
}

// Campanilla sonora nítida sintetizada con Web Audio API de alto rendimiento
function playOrderChime() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(659.25, now) // E5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15) // A5

    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(880, now + 0.15)
    osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.35) // E6

    gain.gain.setValueAtTime(0.35, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now + 0.15)
    osc1.stop(now + 0.45)
    osc2.stop(now + 0.9)
  } catch (e) {
    console.warn('Audio chime warning:', e)
  }
}

export default function CantinaPage() {
  const [activeTab, setActiveTab] = useState<'POS' | 'ORDERS'>('POS')
  const [courtOrders, setCourtOrders] = useState<CourtOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  // Cola de pedidos entrantes concurrentes (soporta 1 o más pedidos simultáneos)
  const [incomingAlerts, setIncomingAlerts] = useState<CourtOrder[]>([])
  const activeIncomingAlert = incomingAlerts[0] || null

  const [activeLinkedOrder, setActiveLinkedOrder] = useState<CourtOrder | null>(null)
  const [isTableQrOpen, setIsTableQrOpen] = useState(false)
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false)
  const knownOrderIdsRef = useRef<Set<string>>(new Set())

  // Carrito de ventas POS
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [assignToCourt, setAssignToCourt] = useState<string>('NONE')
  const [paymentMethod, setPaymentMethod] = useState<CantinaPaymentMethod>('CASH')

  // Estados para Impresión Térmica
  const [selectedPrintOrder, setSelectedPrintOrder] = useState<CourtOrder | null>(null)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)

  // Armar automáticamente el carrito con los productos del pedido
  const loadOrderIntoCart = useCallback((order: CourtOrder) => {
    setActiveTab('POS')
    setActiveLinkedOrder(order)
    setAssignToCourt(order.court_name)
    setPaymentMethod(order.payment_method === 'TRANSFER' ? 'TRANSFER' : 'CASH')

    const newItems: Array<{ product: Product; quantity: number }> = []
    order.items.forEach((it, idx) => {
      const match = CANTINA_PRODUCTS.find(
        (p) => p.name.toLowerCase() === it.name.toLowerCase() || p.id === it.product_id
      )
      if (match) {
        newItems.push({ product: match, quantity: it.quantity })
      } else {
        newItems.push({
          product: {
            id: it.product_id || `prod-custom-${idx}`,
            name: it.name,
            category: 'SNACKS',
            price: it.unit_price,
            stock: 99,
            emoji: '🍽️',
          },
          quantity: it.quantity,
        })
      }
    })
    setCart(newItems)
    toast.success(`¡Carrito cargado con el pedido de ${order.customer_name}!`, {
      description: `${order.court_name} • ${order.payment_method === 'TRANSFER' ? 'Pagado con Transferencia' : 'Abona en Efectivo'}`
    })
  }, [])

  const loadOrders = useCallback(async (isInitial = false) => {
    setOrdersLoading(true)
    try {
      const orders = await getDailyOrders(DEMO_TENANT_ID)
      setCourtOrders(orders)

      // Detectar nuevos pedidos para reproducir sonido y encolar alerta
      orders.forEach((order) => {
        if (!knownOrderIdsRef.current.has(order.id)) {
          knownOrderIdsRef.current.add(order.id)
          if (!isInitial && order.status === 'PENDING') {
            playOrderChime()
            setIncomingAlerts((prev) => {
              if (prev.some((o) => o.id === order.id)) return prev
              return [order, ...prev]
            })
            toast.success('🔔 ¡Nuevo pedido de mesa!', {
              description: `${order.customer_name} • ${order.court_name} (${formatARS(order.total_ars)})`,
              action: {
                label: 'Cargar al carrito',
                onClick: () => loadOrderIntoCart(order),
              },
            })
          }
        }
      })
    } catch {
      // silently ignore
    } finally {
      setOrdersLoading(false)
    }
  }, [loadOrderIntoCart])

  useEffect(() => {
    // Carga inicial diferida
    const initTimer = setTimeout(() => {
      loadOrders(true)
    }, 0)

    // Listener BroadcastChannel para sincronización instantánea entre pestañas / pantallas
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('canchar_cantina_orders')
      bc.onmessage = (event) => {
        if (event.data?.type === 'NEW_ORDER' && event.data.order) {
          const newOrder: CourtOrder = event.data.order
          setCourtOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev
            return [newOrder, ...prev]
          })
          knownOrderIdsRef.current.add(newOrder.id)
          playOrderChime()
          setIncomingAlerts((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev
            return [newOrder, ...prev]
          })
          toast.success('🔔 ¡Nuevo pedido de mesa!', {
            description: `${newOrder.customer_name} • ${newOrder.court_name} (${formatARS(newOrder.total_ars)})`,
            action: {
              label: 'Ver y armar carrito',
              onClick: () => loadOrderIntoCart(newOrder),
            },
          })
        }
      }
    } catch (bcErr) {
      console.warn('BroadcastChannel error:', bcErr)
    }

    // Suscripción Supabase Realtime para notificaciones push sin recargar
    let supabaseChannel: RealtimeChannel | null = null
    try {
      const supabase = createClient()
      supabaseChannel = supabase
        .channel('court_orders_live_feed')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'court_orders',
          },
          () => {
            loadOrders(false)
          }
        )
        .subscribe()
    } catch (realtimeErr) {
      console.warn('Supabase Realtime fallback:', realtimeErr)
    }

    // Polling inteligente de bajo consumo: sólo cuando la pestaña está visible
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      loadOrders(false)
    }, 6000)

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        loadOrders(false)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearTimeout(initTimer)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      bc?.close()
      if (supabaseChannel) {
        createClient().removeChannel(supabaseChannel)
      }
    }
  }, [loadOrders, loadOrderIntoCart])

  // Datos para Alerta Predictiva de Stock memoizados
  const weekendPredictions = useMemo(() => [
    { product: CANTINA_PRODUCTS[0], currentStock: 48, projectedDemand: 95, deficit: 47 },
    { product: CANTINA_PRODUCTS[1], currentStock: 60, projectedDemand: 80, deficit: 20 },
    { product: CANTINA_PRODUCTS[3], currentStock: 15, projectedDemand: 24, deficit: 9 },
  ], [])

  const distributorWhatsAppUrl = useMemo(() => buildWhatsAppLink(
    '5493815009988',
    `¡Hola Distribuidora Bebidas y Deportes! Te paso el pedido de reposición preventiva de CancharClub para el fin de semana:\n\n` +
    weekendPredictions.map(p => `• ${p.deficit}x ${p.product.name} (Faltante p/ fin de semana)`).join('\n') +
    `\n\n¿Nos podrán entregar antes del viernes a las 18 hs? ¡Muchas gracias!`
  ), [weekendPredictions])

  const handleUpdateOrderStatus = async (orderId: string, nextStatus: OrderStatus) => {
    // Optimistic update
    setCourtOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o))
    const result = await dbUpdateOrderStatus(orderId, nextStatus)
    if (!result.success) {
      toast.error('Error al actualizar el estado del pedido')
      loadOrders() // revertir con datos reales
    } else if (nextStatus === 'DELIVERED') {
      toast.success('¡Pedido entregado y registrado!')
    } else {
      toast.info('Comanda marcada en preparación')
    }
  }

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    return CANTINA_PRODUCTS.filter(p => {
      const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory
      const matchesSearch = !term || p.name.toLowerCase().includes(term)
      return matchesCat && matchesSearch
    })
  }, [selectedCategory, searchTerm])

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta
            return newQty > 0 ? { ...item, quantity: newQty } : null
          }
          return item
        })
        .filter(Boolean) as Array<{ product: Product; quantity: number }>
    })
  }

  const clearCart = () => {
    setCart([])
    setActiveLinkedOrder(null)
  }

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)
  }, [cart])

  // Registro de venta fluida con impresión térmica automática
  const handleRegisterSale = async () => {
    if (cart.length === 0) return
    setCheckoutLoading(true)
    try {
      let completedOrder: CourtOrder | null = activeLinkedOrder
      const effectiveTotal = cartTotal

      if (activeLinkedOrder) {
        // 1. Registrar venta interna actualizando estado a DELIVERED
        await handleUpdateOrderStatus(activeLinkedOrder.id, 'DELIVERED')
        completedOrder = { 
          ...activeLinkedOrder, 
          status: 'DELIVERED',
          payment_status: 'PAID'
        }
      } else {
        // Registrar venta de mostrador
        const items = cart.map(c => ({
          product_id: c.product.id,
          name: c.product.name,
          unit_price: c.product.price,
          quantity: c.quantity,
          subtotal: c.product.price * c.quantity,
        }))
        const res = await createCourtOrder({
          tenant_id: DEMO_TENANT_ID,
          court_name: assignToCourt !== 'NONE' ? `Cancha ${assignToCourt}` : 'Venta Mostrador',
          customer_name: 'Cliente Mostrador',
          items,
          total_ars: effectiveTotal,
          payment_method: paymentMethod,
          payment_status: 'PAID',
        })
        if (res.success && res.order) {
          completedOrder = res.order
        } else {
          completedOrder = {
            id: `ord-${Date.now()}`,
            tenant_id: DEMO_TENANT_ID,
            court_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            court_name: assignToCourt !== 'NONE' ? `Cancha ${assignToCourt}` : 'Venta Mostrador',
            customer_name: 'Cliente Mostrador',
            items,
            total_ars: effectiveTotal,
            status: 'DELIVERED',
            payment_method: paymentMethod,
            payment_status: 'PAID',
            notes: null,
          }
        }
      }

      // 2. Notificar éxito interno
      toast.success('¡Venta registrada con éxito!', {
        description: `Total: ${formatARS(effectiveTotal)}`
      })

      // 3. Abrir automáticamente modal con impresión térmica instantánea
      if (completedOrder) {
        setSelectedPrintOrder(completedOrder)
        setAutoPrintReceipt(true)
        setIsPrintModalOpen(true)
      }

      // 4. Dejar el carrito limpio para la siguiente venta
      clearCart()
      loadOrders()
    } catch {
      toast.error('Error al procesar venta')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const pendingOrdersCount = courtOrders.filter(o => o.status === 'PENDING').length

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header con botón para generar QR de Mesas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs tracking-wider uppercase mb-1">
            <Coffee className="w-4 h-4" />
            Punto de Venta & Kiosco del Club
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Cantina y Pedidos de Mesa
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Venta en mostrador, recepción de pedidos QR de mesas, armado ágil del carrito y ticket térmico.
          </p>
        </div>

        <Button
          onClick={() => setIsTableQrOpen(true)}
          className="bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-xl gap-2 h-9 self-start sm:self-auto shadow-sm"
        >
          <QrCode className="w-4 h-4 text-emerald-400" />
          <span>Imprimir QR para Mesas</span>
        </Button>
      </div>

      {/* Alerta flotante animada al recibir nuevo pedido de mesa (con soporte multisesión / cola) */}
      {activeIncomingAlert && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full bg-slate-900/95 border-2 border-emerald-500 rounded-3xl p-4 shadow-2xl shadow-emerald-950/60 backdrop-blur-xl animate-in slide-in-from-bottom-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xl shrink-0 animate-bounce">
                🔔
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                    ¡NUEVO PEDIDO DE MESA!
                  </Badge>
                  {incomingAlerts.length > 1 && (
                    <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px] font-extrabold animate-pulse">
                      +{incomingAlerts.length - 1} en espera
                    </Badge>
                  )}
                </div>
                <h4 className="text-white font-bold text-sm mt-0.5">
                  {activeIncomingAlert.customer_name} • {activeIncomingAlert.court_name}
                </h4>
                <p className="text-xs text-slate-300">
                  Total: <strong className="text-emerald-400 font-extrabold">{formatARS(activeIncomingAlert.total_ars)}</strong>
                  {' • '}
                  Pago: <strong className={activeIncomingAlert.payment_method === 'TRANSFER' ? 'text-purple-300' : 'text-emerald-300'}>
                    {activeIncomingAlert.payment_method === 'TRANSFER' ? 'Transferencia' : 'Efectivo'}
                  </strong>
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIncomingAlerts(prev => prev.filter(o => o.id !== activeIncomingAlert.id))} 
              className="text-slate-400 hover:text-white p-1"
              aria-label="Cerrar alerta"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                loadOrderIntoCart(activeIncomingAlert)
                setIncomingAlerts(prev => prev.filter(o => o.id !== activeIncomingAlert.id))
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md h-9 gap-1.5"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Ver pedido y armar carrito</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIncomingAlerts(prev => prev.filter(o => o.id !== activeIncomingAlert.id))}
              className="text-xs text-slate-400 hover:text-white h-9 rounded-xl"
            >
              {incomingAlerts.length > 1 ? 'Siguiente' : 'Descartar'}
            </Button>
          </div>
        </div>
      )}

      {/* Alerta de Control Predictivo de Stock */}
      <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Alerta Predictiva de Stock (Consumo Viernes a Domingo)</span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Demanda estimada de fin de semana superará el stock disponible en depósito en <strong>3 artículos clave</strong> ({weekendPredictions[0].deficit} Gatorade y {weekendPredictions[2].deficit} tubos de pelotas).
            </p>
          </div>
        </div>

        <a
          href={distributorWhatsAppUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shrink-0 transition-colors shadow-xs"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Pedir Reposición (WhatsApp)</span>
        </a>
      </div>

      {/* Tabs Selector */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('POS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'POS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Coffee className="w-4 h-4" />
          <span>Punto de Venta (Mostrador)</span>
          {activeLinkedOrder && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500 text-white font-bold text-[10px]">
              Pedido activo: {activeLinkedOrder.customer_name}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ORDERS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative ${
            activeTab === 'ORDERS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Comandas de Mesa y Cancha (QR)</span>
          {ordersLoading && (
            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
          )}
          {pendingOrdersCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] animate-pulse">
              {pendingOrdersCount} Nuevas
            </span>
          )}
        </button>
      </div>

      {/* VISTA 1: COMANDAS EN VIVO */}
      {activeTab === 'ORDERS' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-emerald-400" />
              <span>Tablero de Comandas en Vivo</span>
            </h2>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
              Pedidos recibidos vía código QR
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courtOrders.map((order) => {
              return (
                <Card 
                  key={order.id} 
                  className={`border-slate-800 bg-slate-900/80 rounded-2xl overflow-hidden transition-all ${
                    order.status === 'PENDING' ? 'border-amber-500/50 shadow-lg shadow-amber-950/20' : ''
                  }`}
                >
                  <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <Badge 
                          className={`text-[10px] font-bold ${
                            order.status === 'PENDING'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : order.status === 'PREPARING'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {order.status === 'PENDING' ? '⏳ PENDIENTE' : order.status === 'PREPARING' ? '🔥 EN PREPARACIÓN' : '✅ ENTREGADO'}
                        </Badge>
                        <Badge 
                          className={`text-[10px] font-semibold ${
                            order.payment_method === 'TRANSFER'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {order.payment_method === 'TRANSFER' ? '💳 Transferencia' : '💵 Efectivo'}
                        </Badge>
                      </div>
                      <h3 className="font-bold text-sm text-white mt-1">{order.court_name}</h3>
                      <p className="text-xs text-slate-400">Cliente: <strong className="text-slate-200">{order.customer_name}</strong></p>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black text-emerald-400">{formatARS(order.total_ars)}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 justify-end mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{order.created_at}</span>
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Items solicitados:</div>
                      {order.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-slate-300 bg-slate-950/40 p-1.5 rounded-lg border border-slate-800/60">
                          <span><strong>{it.quantity}x</strong> {it.name}</span>
                          <span className="font-semibold text-emerald-400">{formatARS(it.subtotal)}</span>
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                        <strong>Nota del cliente:</strong> {order.notes}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPrintOrder(order)
                          setAutoPrintReceipt(false)
                          setIsPrintModalOpen(true)
                        }}
                        className="h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl gap-1"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ticket</span>
                      </Button>

                      {order.status !== 'DELIVERED' ? (
                        <Button
                          size="sm"
                          onClick={() => loadOrderIntoCart(order)}
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl gap-1.5"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Armar Carrito POS</span>
                        </Button>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Venta Registrada
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ) : (
        /* VISTA 2: PUNTO DE VENTA (MOSTRADOR) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Catálogo de Productos */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filtros y Buscador */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                {['ALL', 'BEBIDAS', 'EQUIPAMIENTO', 'SNACKS'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedCategory === cat
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {cat === 'ALL' ? 'Todos' : cat === 'BEBIDAS' ? 'Bebidas' : cat === 'EQUIPAMIENTO' ? 'Equipamiento' : 'Snacks'}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input
                  placeholder="Buscar producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-950 border-slate-800 rounded-xl"
                />
              </div>
            </div>

            {/* Grid de Productos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/40 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">
                      {p.emoji}
                    </div>
                    <div className="font-semibold text-slate-200 text-xs line-clamp-2">
                      {p.name}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-extrabold text-emerald-400 text-sm">
                      {formatARS(p.price)}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg group-hover:bg-emerald-600 group-hover:text-white">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Carrito de Venta y Cobro */}
          <Card className="bg-slate-900/80 border-slate-800 p-5 rounded-3xl sticky top-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
                <CardTitle className="text-base text-white">
                  {activeLinkedOrder ? `Comanda de ${activeLinkedOrder.customer_name}` : 'Comprobante de Venta'}
                </CardTitle>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Vaciar
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                El carrito está vacío. Hacé click en un producto para agregarlo o cargá un pedido de mesa desde las comandas.
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs"
                    >
                      <div className="flex-1 pr-2 truncate">
                        <div className="font-semibold text-slate-200 truncate">{item.product.name}</div>
                        <div className="text-[11px] text-emerald-400">{formatARS(item.product.price)}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="w-6 h-6 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-4 text-center font-bold text-white text-xs">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center text-white"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Si el pedido proviene de una mesa cargada */}
                {activeLinkedOrder ? (
                  <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
                    {activeLinkedOrder.payment_method === 'TRANSFER' ? (
                      <div className="p-3 rounded-2xl bg-purple-950/40 border border-purple-500/30 text-purple-200 space-y-1">
                        <div className="flex items-center gap-2 font-bold text-purple-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Pagado con Transferencia Bancaria</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Cliente: <strong className="text-white">{activeLinkedOrder.customer_name}</strong> • Destino: <strong className="text-white">{activeLinkedOrder.court_name}</strong>
                        </p>
                        <div className="text-[10px] text-purple-400">
                          Retira por el mostrador • Comprobante digital verificado
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 space-y-1">
                        <div className="flex items-center gap-2 font-bold text-amber-300">
                          <Banknote className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Cobro en Efectivo al Retirar: {formatARS(cartTotal)}</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Cliente: <strong className="text-white">{activeLinkedOrder.customer_name}</strong> • Destino: <strong className="text-white">{activeLinkedOrder.court_name}</strong>
                        </p>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                      <span>Pedido #{activeLinkedOrder.id.slice(-4)}</span>
                      <button
                        onClick={() => {
                          setActiveLinkedOrder(null)
                          clearCart()
                        }}
                        className="text-rose-400 hover:text-rose-300 font-semibold text-[11px]"
                      >
                        Desvincular Pedido
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Venta Mostrador Regular */
                  <>
                    <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
                      <label className="text-slate-400 font-semibold block">Asignar a Cancha / Turno:</label>
                      <select
                        value={assignToCourt}
                        onChange={(e) => setAssignToCourt(e.target.value)}
                        className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="NONE">Venta Inmediata de Mostrador</option>
                        <option value="1">Cancha 1 (Panorámica)</option>
                        <option value="2">Cancha 2 (Techada)</option>
                        <option value="3">Cancha 3 (Blindex)</option>
                        <option value="4">Fútbol 5 (Sintético)</option>
                      </select>
                    </div>

                    {assignToCourt === 'NONE' && (
                      <div className="space-y-2 text-xs">
                        <label className="text-slate-400 font-semibold block">Medio de Cobro:</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('CASH')}
                            className={`p-2 rounded-xl text-center border text-[11px] font-semibold transition-all ${
                              paymentMethod === 'CASH'
                                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            Efectivo
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('QR_MP')}
                            className={`p-2 rounded-xl text-center border text-[11px] font-semibold transition-all ${
                              paymentMethod === 'QR_MP'
                                ? 'bg-sky-600/20 border-sky-500 text-sky-400'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            QR MP
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('TRANSFER')}
                            className={`p-2 rounded-xl text-center border text-[11px] font-semibold transition-all ${
                              paymentMethod === 'TRANSFER'
                                ? 'bg-purple-600/20 border-purple-500 text-purple-400'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            Transf.
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Total y Botón de Venta */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 font-semibold text-xs">Total a Registrar:</span>
                    <span className="text-xl font-extrabold text-emerald-400 font-mono">
                      {formatARS(cartTotal)}
                    </span>
                  </div>

                  {activeLinkedOrder?.payment_method === 'TRANSFER' ? (
                    <Button
                      onClick={handleRegisterSale}
                      disabled={checkoutLoading}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-extrabold text-sm shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 transition-all"
                    >
                      {checkoutLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Printer className="w-5 h-5 text-emerald-200" />
                          <div className="text-left leading-tight">
                            <div>Registrar Venta</div>
                            <div className="text-[10px] font-normal text-emerald-100 opacity-90">Asienta en sistema e imprime ticket térmico</div>
                          </div>
                        </>
                      )}
                    </Button>
                  ) : activeLinkedOrder?.payment_method === 'CASH' ? (
                    <Button
                      onClick={handleRegisterSale}
                      disabled={checkoutLoading}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-extrabold text-sm shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 transition-all"
                    >
                      {checkoutLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          <div className="text-left leading-tight">
                            <div>Cobrar y Registrar Venta</div>
                            <div className="text-[10px] font-normal text-emerald-100 opacity-90">Efectivo • Imprime ticket térmico</div>
                          </div>
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleRegisterSale}
                      disabled={checkoutLoading}
                      className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/20 gap-2"
                    >
                      {checkoutLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{assignToCourt !== 'NONE' ? 'Cargar a Cuenta del Turno' : 'Registrar Venta e Imprimir Ticket'}</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modal de Impresión Térmica para Comandas */}
      {isPrintModalOpen && selectedPrintOrder && (
        <ThermalReceiptModal
          isOpen={isPrintModalOpen}
          onClose={() => {
            setIsPrintModalOpen(false)
            setSelectedPrintOrder(null)
            setAutoPrintReceipt(false)
          }}
          autoPrint={autoPrintReceipt}
          type="CANTINA_ORDER"
          cantinaData={{
            clubName: 'CancharClub Cantina',
            orderNumber: selectedPrintOrder.id,
            courtOrTable: selectedPrintOrder.court_name,
            customerName: selectedPrintOrder.customer_name,
            dateTime: selectedPrintOrder.created_at,
            paymentMethod: selectedPrintOrder.payment_method === 'TRANSFER' ? 'Transferencia Bancaria' : selectedPrintOrder.payment_method === 'CASH' ? 'Efectivo' : 'Mercado Pago',
            items: selectedPrintOrder.items.map(it => ({
              name: it.name,
              quantity: it.quantity,
              unitPrice: it.unit_price,
              subtotal: it.subtotal,
            })),
            totalAmount: selectedPrintOrder.total_ars,
            notes: selectedPrintOrder.notes ?? undefined,
          }}
        />
      )}

      {/* Modal para generar e imprimir código QR de Mesas */}
      <CourtQrModal
        isOpen={isTableQrOpen}
        onClose={() => setIsTableQrOpen(false)}
        tableName=""
        clubSlug="padel-central"
      />
    </div>
  )
}
