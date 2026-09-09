'use client'

import { useState, useEffect } from 'react'
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
  SendHorizontal,
  Printer,
  AlertTriangle,
  TrendingUp,
  MessageSquare
} from 'lucide-react'
import { Card, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ThermalReceiptModal } from '@/components/shared/thermal-receipt'
import { formatARS, buildWhatsAppLink } from '@/lib/utils'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  category: 'BEBIDAS' | 'EQUIPAMIENTO' | 'SNACKS'
  price: number
  stock: number
  emoji: string
}

interface CourtOrderData {
  id: string
  court_name: string
  customer_name: string
  total_ars: number
  status: 'PENDING' | 'PREPARING' | 'DELIVERED'
  created_at: string
  items: Array<{ name: string; quantity: number; unit_price: number; subtotal: number }>
  notes?: string
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

export default function CantinaPage() {
  const [activeTab, setActiveTab] = useState<'POS' | 'ORDERS'>('POS')
  const [courtOrders, setCourtOrders] = useState<CourtOrderData[]>([
    {
      id: 'ord-101',
      court_name: 'Cancha 1 (Panorámica)',
      customer_name: 'Martín Palermo',
      total_ars: 5000,
      status: 'PENDING',
      created_at: '20:15 hs',
      items: [
        { name: 'Gatorade / Powerade 500ml', quantity: 2, unit_price: 2500, subtotal: 5000 }
      ],
      notes: 'Bien frías por favor',
    },
    {
      id: 'ord-102',
      court_name: 'Cancha 2 (Techada)',
      customer_name: 'Gonzalo Higuaín',
      total_ars: 16200,
      status: 'PREPARING',
      created_at: '20:05 hs',
      items: [
        { name: 'Tubo Pelotas Pádel x3 (Bullpadel)', quantity: 1, unit_price: 14000, subtotal: 14000 },
        { name: 'Overgrip Wilson / Bullpadel', quantity: 1, unit_price: 2200, subtotal: 2200 }
      ],
    }
  ])

  useEffect(() => {
    // Sincronizar comandas creadas por jugadores desde sus celulares de forma asíncrona
    if (typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        const stored = localStorage.getItem('canchar_court_orders')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCourtOrders(prev => {
                const combined = [...parsed, ...prev.filter(p => !parsed.some((x: { id: string }) => x.id === p.id))]
                return combined
              })
            }
          } catch {
            // ignore
          }
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [])

  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [assignToCourt, setAssignToCourt] = useState<string>('NONE')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QR_MP' | 'TRANSFER'>('CASH')

  // Estados para Impresión Térmica (Mejora 1C)
  const [selectedPrintOrder, setSelectedPrintOrder] = useState<CourtOrderData | null>(null)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)

  // Datos para Alerta Predictiva de Stock (Mejora 3C)
  const weekendPredictions = [
    { product: CANTINA_PRODUCTS[0], currentStock: 48, projectedDemand: 95, deficit: 47 },
    { product: CANTINA_PRODUCTS[1], currentStock: 60, projectedDemand: 80, deficit: 20 },
    { product: CANTINA_PRODUCTS[3], currentStock: 15, projectedDemand: 24, deficit: 9 },
  ]

  const distributorWhatsAppUrl = buildWhatsAppLink(
    '5493815009988',
    `¡Hola Distribuidora Bebidas y Deportes! Te paso el pedido de reposición preventiva de CancharClub para el fin de semana:\n\n` +
    weekendPredictions.map(p => `• ${p.deficit}x ${p.product.name} (Faltante p/ fin de semana)`).join('\n') +
    `\n\n¿Nos podrán entregar antes del viernes a las 18 hs? ¡Muchas gracias!`
  )

  const handleUpdateOrderStatus = (orderId: string, nextStatus: 'PENDING' | 'PREPARING' | 'DELIVERED') => {
    setCourtOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o))
    if (nextStatus === 'DELIVERED') {
      toast.success('¡Comanda despachada a la cancha!')
    } else {
      toast.info('Comanda marcada en preparación')
    }
  }

  const filteredProducts = CANTINA_PRODUCTS.filter(p => {
    const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCat && matchesSearch
  })

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

  const clearCart = () => setCart([])

  const cartTotal = cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

  const handleCheckout = () => {
    if (cart.length === 0) return

    if (assignToCourt !== 'NONE') {
      toast.success('Consumo cargado a la cancha', {
        description: `Se agregaron ${formatARS(cartTotal)} a la cuenta de la Cancha ${assignToCourt}. Se abonará al finalizar el turno.`
      })
    } else {
      const methodLabel = paymentMethod === 'CASH' ? 'Efectivo' : paymentMethod === 'QR_MP' ? 'Mercado Pago QR' : 'Transferencia'
      toast.success(`Venta de cantina cobrada (${methodLabel})`, {
        description: `Se registraron ${formatARS(cartTotal)} en la caja del club exitosamente.`
      })
    }

    clearCart()
    setAssignToCourt('NONE')
  }

  const pendingOrdersCount = courtOrders.filter(o => o.status === 'PENDING').length

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs tracking-wider uppercase mb-1">
          <Coffee className="w-4 h-4" />
          Punto de Venta & Kiosco del Club
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Cantina y Pedidos de Cancha
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Venta en mostrador, despacho de pedidos QR en cancha y cobro directo al turno.
        </p>
      </div>

      {/* Alerta de Control Predictivo de Stock (Mejora 3C) */}
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

      {/* Tabs Selector (Mejora 2D) */}
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
          <span>Comandas en Cancha (QR)</span>
          {pendingOrdersCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] animate-pulse">
              {pendingOrdersCount} Nuevas
            </span>
          )}
        </button>
      </div>

      {/* VISTA 1: COMANDAS EN CANCHA (QR) */}
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
                      <Badge 
                        className={`text-[10px] font-bold ${
                          order.status === 'PENDING'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : order.status === 'PREPARING'
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {order.status === 'PENDING' ? '⏳ PENDIENTE' : order.status === 'PREPARING' ? '🔥 EN PREPARACIÓN' : '✅ DESPACHADO'}
                      </Badge>
                      <h3 className="font-bold text-sm text-white mt-1.5">{order.court_name}</h3>
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
                        <strong>Nota del jugador:</strong> {order.notes}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPrintOrder(order)
                          setIsPrintModalOpen(true)
                        }}
                        className="h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl gap-1"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ticket</span>
                      </Button>

                      {order.status === 'PENDING' && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')}
                          className="h-8 text-xs bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl gap-1.5"
                        >
                          <ChefHat className="w-3.5 h-3.5" />
                          <span>Marchar / Preparar</span>
                        </Button>
                      )}

                      {order.status === 'PREPARING' && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateOrderStatus(order.id, 'DELIVERED')}
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl gap-1.5"
                        >
                          <SendHorizontal className="w-3.5 h-3.5" />
                          <span>Despachar a Cancha</span>
                        </Button>
                      )}

                      {order.status === 'DELIVERED' && (
                        <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Entregado en Cancha
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

          {/* Carrito de Venta */}
          <Card className="bg-slate-900/80 border-slate-800 p-5 rounded-3xl sticky top-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
                <CardTitle className="text-base text-white">Comprobante de Venta</CardTitle>
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
                El carrito está vacío. Hacé click en un producto para agregarlo.
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
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-4 text-center font-bold text-white text-xs">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center text-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Destino de la Venta */}
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

                {/* Medio de Pago */}
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

                {/* Total y Botón */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 font-semibold text-xs">Total a Cobrar:</span>
                    <span className="text-xl font-extrabold text-emerald-400 font-mono">
                      {formatARS(cartTotal)}
                    </span>
                  </div>

                  <Button
                    onClick={handleCheckout}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/20"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {assignToCourt !== 'NONE' ? 'Cargar a Cuenta del Turno' : 'Registrar Venta en Caja'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modal de Impresión Térmica para Comandas (Mejora 1C) */}
      {isPrintModalOpen && selectedPrintOrder && (
        <ThermalReceiptModal
          isOpen={isPrintModalOpen}
          onClose={() => {
            setIsPrintModalOpen(false)
            setSelectedPrintOrder(null)
          }}
          type="CANTINA_ORDER"
          cantinaData={{
            clubName: 'CancharClub Cantina',
            orderNumber: selectedPrintOrder.id,
            courtOrTable: selectedPrintOrder.court_name,
            customerName: selectedPrintOrder.customer_name,
            dateTime: selectedPrintOrder.created_at,
            items: selectedPrintOrder.items.map(it => ({
              name: it.name,
              quantity: it.quantity,
              unitPrice: it.unit_price,
              subtotal: it.subtotal,
            })),
            totalAmount: selectedPrintOrder.total_ars,
            notes: selectedPrintOrder.notes,
          }}
        />
      )}
    </div>
  )
}
