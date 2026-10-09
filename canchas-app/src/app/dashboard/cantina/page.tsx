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
  Banknote,
  Boxes,
  Package,
  PackagePlus,
  Edit3,
  Layers,
  DollarSign,
  Lock,
  Wallet,
  Users,
  History
} from 'lucide-react'
import { Card, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
  getCantinaProducts,
  saveCantinaProducts,
  updateProductStock,
  saveSingleProduct,
  deleteProduct,
  type CourtOrder,
  type OrderStatus,
  type CantinaPaymentMethod,
} from '@/actions/cantina.actions'
import {
  getCustomerAccounts,
  chargeCustomerAccount,
  payCustomerAccount,
  type CustomerAccount,
} from '@/actions/cuenta-corriente.actions'
import { buildDebtWhatsAppReminder } from '@/lib/cuenta-corriente-utils'
import type { CantinaProduct } from '@/config/cantina-data'
import { useTenantId, useUserRole } from '@/hooks/use-tenant-id'
import { PlanFeatureGuard } from '@/components/dashboard/plan-feature-guard'


export type Product = CantinaProduct

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
  const tenantId = useTenantId()
  const { isOwner } = useUserRole()
  const [activeTab, setActiveTab] = useState<'POS' | 'ORDERS' | 'INVENTORY' | 'CUENTA_CORRIENTE'>('POS')
  const [courtOrders, setCourtOrders] = useState<CourtOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  // Estados para Cuentas Corrientes & Fiados
  const [accounts, setAccounts] = useState<CustomerAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')
  const [payAccountModalOpen, setPayAccountModalOpen] = useState(false)
  const [selectedPayAccount, setSelectedPayAccount] = useState<CustomerAccount | null>(null)
  const [payAccountAmount, setPayAccountAmount] = useState<string>('')
  const [payAccountMethod, setPayAccountMethod] = useState<'CASH' | 'TRANSFER'>('CASH')
  const [submittingAccountPayment, setSubmittingAccountPayment] = useState(false)

  // Venta A Cuenta en Mostrador
  const [cuentaCorrienteName, setCuentaCorrienteName] = useState('')
  const [cuentaCorrientePhone, setCuentaCorrientePhone] = useState('')

  // Nuevo Cargo Manual
  const [newChargeModalOpen, setNewChargeModalOpen] = useState(false)
  const [newChargeName, setNewChargeName] = useState('')
  const [newChargePhone, setNewChargePhone] = useState('')
  const [newChargeAmount, setNewChargeAmount] = useState('')
  const [newChargeReason, setNewChargeReason] = useState('')
  const [submittingNewCharge, setSubmittingNewCharge] = useState(false)

  // Detalle de Movimientos
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [selectedHistoryAccount, setSelectedHistoryAccount] = useState<CustomerAccount | null>(null)

  // Datos del club para recordatorio de WhatsApp
  const [clubName, setClubName] = useState('CancharClub')
  const [bankAlias, setBankAlias] = useState('')

  // Catálogo de Productos y Estado de Inventario
  const [products, setProducts] = useState<CantinaProduct[]>([])
  const [, setProductsLoading] = useState(false)

  // Modales y Control de Inventario
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false)
  const [selectedRestockProduct, setSelectedRestockProduct] = useState<CantinaProduct | null>(null)
  const [restockQty, setRestockQty] = useState<number>(12)
  const [restockSubmitting, setRestockSubmitting] = useState(false)

  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<CantinaProduct | null>(null)
  const [productForm, setProductForm] = useState<{
    name: string
    category: 'BEBIDAS' | 'EQUIPAMIENTO' | 'SNACKS'
    price: number
    stock: number
  }>({
    name: '',
    category: 'BEBIDAS',
    price: 2500,
    stock: 24,
  })
  const [productSaving, setProductSaving] = useState(false)

  // Métricas de Inventario
  const inventoryStats = useMemo(() => {
    const totalProducts = products.length
    const totalUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0)
    const totalValuation = products.reduce((acc, p) => acc + (p.price * (p.stock || 0)), 0)
    const lowStockCount = products.filter(p => (p.stock || 0) < 10).length
    return { totalProducts, totalUnits, totalValuation, lowStockCount }
  }, [products])

  // Carga de Cuentas Corrientes
  const loadAccounts = useCallback(async () => {
    if (!tenantId) return
    setAccountsLoading(true)
    try {
      const data = await getCustomerAccounts(tenantId)
      setAccounts(data || [])
    } catch (err) {
      console.warn('[loadAccounts] Error:', err)
      setAccounts([])
    } finally {
      setAccountsLoading(false)
    }
  }, [tenantId])

  const handleConfirmAccountPayment = async () => {
    if (!selectedPayAccount || !tenantId) return
    const amount = Number(payAccountAmount) || 0
    if (amount <= 0) {
      toast.error('Ingresá un monto válido mayor a 0')
      return
    }
    setSubmittingAccountPayment(true)
    try {
      const res = await payCustomerAccount({
        tenantId,
        accountId: selectedPayAccount.id,
        amount,
        paymentMethod: payAccountMethod,
      })
      if (res.success) {
        toast.success(`¡Cobro de ${formatARS(amount)} registrado! Ingresó a Caja Diaria.`)
        setPayAccountModalOpen(false)
        setSelectedPayAccount(null)
        loadAccounts()
      } else {
        toast.error('Error al registrar cobro: ' + res.error)
      }
    } catch {
      toast.error('Error al registrar cobro')
    } finally {
      setSubmittingAccountPayment(false)
    }
  }

  const handleCreateNewCharge = async () => {
    if (!tenantId || !newChargeName.trim()) {
      toast.error('Ingresá el nombre del cliente')
      return
    }
    const amount = Number(newChargeAmount) || 0
    if (amount <= 0) {
      toast.error('Ingresá un monto válido mayor a 0')
      return
    }
    setSubmittingNewCharge(true)
    try {
      const res = await chargeCustomerAccount({
        tenantId,
        customerName: newChargeName.trim(),
        customerPhone: newChargePhone.trim(),
        amount,
        description: newChargeReason.trim() || 'Cargo manual en cuenta corriente',
      })
      if (res.success) {
        toast.success(`¡Cargo de ${formatARS(amount)} registrado para ${newChargeName}!`)
        setNewChargeModalOpen(false)
        setNewChargeName('')
        setNewChargePhone('')
        setNewChargeAmount('')
        setNewChargeReason('')
        loadAccounts()
      } else {
        toast.error('Error al registrar cargo: ' + res.error)
      }
    } catch {
      toast.error('Error al registrar cargo')
    } finally {
      setSubmittingNewCharge(false)
    }
  }

  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (!accountSearch.trim()) return true
      const q = accountSearch.toLowerCase()
      return acc.customer_name.toLowerCase().includes(q) || acc.customer_phone.includes(q)
    })
  }, [accounts, accountSearch])

  const totalOutstandingDebt = useMemo(() => {
    return accounts.reduce((acc, a) => acc + (a.balance > 0 ? a.balance : 0), 0)
  }, [accounts])

  const debtorsCount = useMemo(() => {
    return accounts.filter(a => a.balance > 0).length
  }, [accounts])

  // Carga de Productos desde Supabase
  const loadProducts = useCallback(async () => {
    if (!tenantId) return
    setProductsLoading(true)
    try {
      const data = await getCantinaProducts(tenantId)
      setProducts(data || [])
    } catch (err) {
      console.warn('[loadProducts] Error:', err)
      setProducts([])
    } finally {
      setProductsLoading(false)
    }
  }, [tenantId])

  // Modificar stock rápido (+1 / -1)
  const handleQuickStock = async (productId: string, delta: number) => {
    const target = products.find(p => p.id === productId)
    if (!target) return
    if (delta < 0 && target.stock <= 0) return

    const newStock = Math.max(0, target.stock + delta)
    const updated = products.map(p => p.id === productId ? { ...p, stock: newStock } : p)
    setProducts(updated)

    try {
      await updateProductStock(tenantId!, productId, delta, true)
    } catch {
      toast.error('Error al sincronizar stock')
      loadProducts()
    }
  }

  // Abrir Modal de Cargar Stock
  const openRestockModal = (product?: CantinaProduct) => {
    setSelectedRestockProduct(product || products[0] || null)
    setRestockQty(12)
    setIsRestockModalOpen(true)
  }

  // Confirmar Carga de Stock (Ingreso de Mercadería)
  const handleConfirmRestock = async () => {
    if (!selectedRestockProduct || restockQty <= 0) {
      toast.error('Ingresá una cantidad válida mayor a 0')
      return
    }
    setRestockSubmitting(true)
    try {
      const updated = products.map(p => 
        p.id === selectedRestockProduct.id 
          ? { ...p, stock: p.stock + restockQty }
          : p
      )
      setProducts(updated)

      const res = await updateProductStock(tenantId!, selectedRestockProduct.id, restockQty, true)
      if (!res.success) throw new Error(res.error)

      toast.success('¡Stock cargado con éxito!', {
        description: `Se sumaron +${restockQty} unidades a "${selectedRestockProduct.name}" (Total: ${selectedRestockProduct.stock + restockQty} u.)`
      })
      setIsRestockModalOpen(false)
    } catch {
      toast.error('Error al registrar ingreso de stock')
      loadProducts()
    } finally {
      setRestockSubmitting(false)
    }
  }

  // Abrir modal de Nuevo Producto
  const openNewProductModal = () => {
    setEditingProduct(null)
    setProductForm({
      name: '',
      category: 'BEBIDAS',
      price: 2500,
      stock: 24,
    })
    setIsProductModalOpen(true)
  }

  // Abrir modal de Editar Producto
  const openEditProductModal = (product: CantinaProduct) => {
    setEditingProduct(product)
    setProductForm({
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
    })
    setIsProductModalOpen(true)
  }

  // Guardar Producto (Crear o Modificar)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productForm.name.trim()) {
      toast.error('Ingresá el nombre del producto')
      return
    }

    // Si el usuario no es dueño del club y está editando, se mantiene el precio original para evitar fraude
    const effectivePrice = (!isOwner && editingProduct) ? editingProduct.price : Number(productForm.price)

    if (effectivePrice <= 0) {
      toast.error('El precio de venta debe ser mayor a 0')
      return
    }

    setProductSaving(true)
    try {
      // Asignar emoji representativo automáticamente por categoría o preservar el existente
      const categoryEmoji = productForm.category === 'BEBIDAS' ? '🥤' : productForm.category === 'EQUIPAMIENTO' ? '🎾' : '🍫'
      const productPayload: CantinaProduct = {
        id: editingProduct ? editingProduct.id : `prod_${Date.now()}`,
        name: productForm.name.trim(),
        category: productForm.category,
        price: effectivePrice,
        stock: Math.max(0, Number(productForm.stock)),
        emoji: editingProduct?.emoji || categoryEmoji,
        is_active: true,
      }

      let updatedProducts: CantinaProduct[]
      if (editingProduct) {
        updatedProducts = products.map(p => p.id === editingProduct.id ? productPayload : p)
      } else {
        updatedProducts = [productPayload, ...products]
      }
      setProducts(updatedProducts)

      const res = await saveSingleProduct(tenantId!, productPayload)
      if (!res.success) throw new Error(res.error)

      toast.success(editingProduct ? '¡Producto actualizado correctamente!' : '¡Nuevo producto agregado al inventario!')
      setIsProductModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el producto'
      toast.error(msg)
      loadProducts()
    } finally {
      setProductSaving(false)
    }
  }

  // Eliminar Producto del Inventario
  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!confirm(`¿Estás seguro de eliminar "${productName}" del inventario de cantina?`)) {
      return
    }

    const updated = products.filter(p => p.id !== productId)
    setProducts(updated)

    try {
      const res = await deleteProduct(tenantId!, productId)
      if (!res.success) throw new Error(res.error)
      toast.success(`Producto "${productName}" eliminado del inventario`)
    } catch {
      toast.error('Error al eliminar el producto')
      loadProducts()
    }
  }

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
  const [courts, setCourts] = useState<Array<{ id: string; name: string; sport: string }>>([])
  const [clubSlug, setClubSlug] = useState<string>('')

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
      const match = products.find(
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
            is_active: true,
          },
          quantity: it.quantity,
        })
      }
    })
    setCart(newItems)
    toast.success(`¡Carrito cargado con el pedido de ${order.customer_name}!`, {
      description: `${order.court_name} • ${order.payment_method === 'TRANSFER' ? 'Pagado con Transferencia' : 'Abona en Efectivo'}`
    })
  }, [products])

  const loadOrders = useCallback(async (isInitial = false) => {
    setOrdersLoading(true)
    try {
      const orders = await getDailyOrders(tenantId!)
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
  }, [loadOrderIntoCart, tenantId])

  useEffect(() => {
    // Carga inicial diferida
    const initTimer = setTimeout(() => {
      loadOrders(true)
      loadProducts()
      loadAccounts()
      if (tenantId) {
        const supabase = createClient()
        supabase
          .from('courts')
          .select('id, name, sport')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .then(({ data }) => {
            if (data) setCourts(data)
          })
        supabase
          .from('tenants')
          .select('name, slug, bank_cbu_alias')
          .eq('id', tenantId)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.name) setClubName(data.name)
            if (data?.slug) setClubSlug(data.slug)
            if (data?.bank_cbu_alias) setBankAlias(data.bank_cbu_alias)
          })
      }
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
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'audit_log',
          },
          () => {
            loadOrders(false)
          }
        )
        .subscribe()
    } catch (realtimeErr) {
      console.warn('Supabase Realtime fallback:', realtimeErr)
    }

    // Polling de respaldo: solo cada 30s (Supabase Realtime ya maneja actualizaciones en vivo)
    let lastLoadTime = Date.now()
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      loadOrders(false)
      lastLoadTime = Date.now()
    }, 30000)

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        // Recargar solo si pasaron mas de 30s desde la ultima carga
        if (Date.now() - lastLoadTime > 30000) {
          loadOrders(false)
          lastLoadTime = Date.now()
        }
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
  }, [loadOrders, loadOrderIntoCart, loadProducts, loadAccounts, tenantId])

  // Datos para Alerta Predictiva de Stock memoizados (calculado sobre productos reales con bajo stock)
  const weekendPredictions = useMemo(() => {
    return products
      .filter(p => p.stock !== undefined && p.stock < 10)
      .map(p => ({
        product: p,
        currentStock: p.stock ?? 0,
        projectedDemand: 20,
        deficit: Math.max(0, 20 - (p.stock ?? 0))
      }))
      .filter(p => p.deficit > 0)
  }, [products])

  const distributorWhatsAppUrl = useMemo(() => {
    if (weekendPredictions.length === 0) return '#'
    return buildWhatsAppLink(
      '5493815009988',
      `¡Hola! Te paso el pedido de reposición preventiva de cantina para el fin de semana:\n\n` +
      weekendPredictions.map(p => `• ${p.deficit}x ${p.product.name} (Stock actual: ${p.currentStock})`).join('\n') +
      `\n\n¿Nos podrán entregar antes del fin de semana? ¡Muchas gracias!`
    )
  }, [weekendPredictions])

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
    return products.filter(p => {
      const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory
      const matchesSearch = !term || p.name.toLowerCase().includes(term)
      return matchesCat && matchesSearch
    })
  }, [products, selectedCategory, searchTerm])

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

    if (paymentMethod === 'CUENTA_CORRIENTE' && assignToCourt === 'NONE' && !cuentaCorrienteName.trim()) {
      toast.error('Por favor ingresá el nombre del cliente para anotar a Cuenta Corriente')
      return
    }

    setCheckoutLoading(true)
    try {
      let completedOrder: CourtOrder | null = activeLinkedOrder
      const effectiveTotal = cartTotal
      const isCuentaCorriente = paymentMethod === 'CUENTA_CORRIENTE'
      const clientName = isCuentaCorriente 
        ? (cuentaCorrienteName.trim() || 'Cliente en Cuenta')
        : 'Cliente Mostrador'

      if (activeLinkedOrder) {
        // 1. Registrar venta interna actualizando estado a DELIVERED
        await handleUpdateOrderStatus(activeLinkedOrder.id, 'DELIVERED')
        completedOrder = { 
          ...activeLinkedOrder, 
          status: 'DELIVERED',
          payment_status: isCuentaCorriente ? 'PENDING' : 'PAID'
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
          tenant_id: tenantId!,
          court_name: assignToCourt !== 'NONE' ? assignToCourt : (isCuentaCorriente ? 'A Cuenta Corriente' : 'Venta Mostrador'),
          customer_name: clientName,
          items,
          total_ars: effectiveTotal,
          payment_method: paymentMethod,
          payment_status: isCuentaCorriente ? 'PENDING' : 'PAID',
          notes: isCuentaCorriente && cuentaCorrientePhone ? `WhatsApp: ${cuentaCorrientePhone}` : undefined,
        })
        if (res.success && res.order) {
          completedOrder = res.order
        } else {
          completedOrder = {
            id: `ord-${Date.now()}`,
            tenant_id: tenantId!,
            court_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            court_name: assignToCourt !== 'NONE' ? assignToCourt : (isCuentaCorriente ? 'A Cuenta Corriente' : 'Venta Mostrador'),
            customer_name: clientName,
            items,
            total_ars: effectiveTotal,
            status: 'DELIVERED',
            payment_method: paymentMethod,
            payment_status: isCuentaCorriente ? 'PENDING' : 'PAID',
            notes: isCuentaCorriente && cuentaCorrientePhone ? `WhatsApp: ${cuentaCorrientePhone}` : null,
          }
        }
      }

      // Si es Cuenta Corriente, impactar en la cuenta del cliente
      if (isCuentaCorriente && tenantId) {
        const desc = `Cantina: ${cart.map(c => `${c.quantity}x ${c.product.name}`).join(', ')}`
        await chargeCustomerAccount({
          tenantId,
          customerName: clientName,
          customerPhone: cuentaCorrientePhone,
          amount: effectiveTotal,
          description: desc,
          orderId: completedOrder?.id,
        })
        loadAccounts()
        setCuentaCorrienteName('')
        setCuentaCorrientePhone('')
      }

      // Descontar automáticamente el stock de los productos vendidos y persistir en Supabase
      setProducts(prev => {
        const updated = prev.map(p => {
          const soldItem = cart.find(c => c.product.id === p.id)
          if (soldItem) {
            return { ...p, stock: Math.max(0, p.stock - soldItem.quantity) }
          }
          return p
        })
        saveCantinaProducts(tenantId!, updated).catch(err => console.warn('Sync stock error:', err))
        return updated
      })

      // 2. Notificar éxito interno
      toast.success(
        isCuentaCorriente 
          ? `¡Venta de ${formatARS(effectiveTotal)} anotada a la cuenta de ${clientName}!`
          : '¡Venta registrada con éxito!', 
        { description: `Total: ${formatARS(effectiveTotal)}` }
      )

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
    <PlanFeatureGuard feature="cantina_kiosco" featureTitle="Módulo de Cantina y Kiosco">
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

      {/* Alerta de Control Predictivo de Stock (solo cuando hay déficit proyectado) */}
      {weekendPredictions.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Alerta Predictiva de Stock (Consumo Fin de Semana)</span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Demanda estimada de fin de semana superará el stock disponible en{' '}
                <strong>{weekendPredictions.length} artículo{weekendPredictions.length > 1 ? 's' : ''}</strong>:{' '}
                {weekendPredictions.map(p => `${p.product.name} (faltan ${p.deficit})`).join(', ')}.
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
      )}

      {/* Tabs Selector */}
      <div className="flex items-center gap-2 sm:gap-3 border-b border-slate-800 pb-3 overflow-x-auto no-scrollbar touch-momentum">
        <button
          onClick={() => setActiveTab('POS')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 min-h-10 ${
            activeTab === 'POS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Coffee className="w-4 h-4" />
          <span>Punto de Venta</span>
          {activeLinkedOrder && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500 text-white font-bold text-[10px]">
              {activeLinkedOrder.customer_name}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ORDERS')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative shrink-0 min-h-10 ${
            activeTab === 'ORDERS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Comandas (QR)</span>
          {ordersLoading && (
            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
          )}
          {pendingOrdersCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] animate-pulse">
              {pendingOrdersCount} Nuevas
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('INVENTORY')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative shrink-0 min-h-10 ${
            activeTab === 'INVENTORY'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Boxes className="w-4 h-4 text-emerald-400" />
          <span>Inventario</span>
          {inventoryStats.lowStockCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-[10px]">
              {inventoryStats.lowStockCount} por reponer
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('CUENTA_CORRIENTE')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative shrink-0 min-h-10 ${
            activeTab === 'CUENTA_CORRIENTE'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Wallet className="w-4 h-4 text-emerald-400" />
          <span>Cuentas Corrientes</span>
          {debtorsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-extrabold text-[10px]">
              {debtorsCount} con saldo
            </span>
          )}
        </button>

        <div className="ml-auto shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsTableQrOpen(true)}
            className="text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-xl gap-1.5 h-10 px-3.5 cursor-pointer font-medium"
            title="Generar e imprimir cartel con código QR de la Cantina"
          >
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>Código QR Cantina</span>
          </Button>
        </div>
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

          {courtOrders.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 max-w-lg mx-auto space-y-3 my-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                <ChefHat className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">No hay comandas activas</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                Los pedidos que tus clientes hagan escaneando el código QR de sus mesas o canchas aparecerán aquí al instante con sonido de campana.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTableQrOpen(true)}
                className="text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ver / Imprimir Cartel QR</span>
              </Button>
            </div>
          ) : (
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
          )}
        </div>
      ) : activeTab === 'INVENTORY' ? (
        /* VISTA 3: INVENTARIO (GESTIÓN, CARGA DE STOCK Y PRODUCTOS) */
        <div className="space-y-6">
          {/* Header de Inventario con KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Card className="p-4 rounded-2xl bg-slate-900/80 border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Productos</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">{inventoryStats.totalProducts}</span>
                <span className="text-xs text-slate-500 font-medium">artículos</span>
              </div>
            </Card>

            <Card className="p-4 rounded-2xl bg-slate-900/80 border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Unidades en Depósito</span>
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">{inventoryStats.totalUnits}</span>
                <span className="text-xs text-slate-500 font-medium">unidades</span>
              </div>
            </Card>

            <Card className="p-4 rounded-2xl bg-slate-900/80 border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Valor de Inventario</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl font-black text-emerald-400 font-mono">{formatARS(inventoryStats.totalValuation)}</span>
              </div>
            </Card>

            <Card className={`p-4 rounded-2xl border backdrop-blur-sm ${
              inventoryStats.lowStockCount > 0 
                ? 'bg-amber-950/30 border-amber-500/40 shadow-lg shadow-amber-950/20' 
                : 'bg-slate-900/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                  inventoryStats.lowStockCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}>
                  Stock Crítico (&lt;10 u.)
                </span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  inventoryStats.lowStockCount > 0 
                    ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400 animate-pulse' 
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-2xl font-black ${
                  inventoryStats.lowStockCount > 0 ? 'text-amber-400' : 'text-slate-300'
                }`}>
                  {inventoryStats.lowStockCount}
                </span>
                <span className="text-xs text-slate-500 font-medium">por reponer</span>
              </div>
            </Card>
          </div>

          {/* Barra de Acciones: Filtros, Buscador y Botones Principales */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-momentum pb-1">
              {['ALL', 'BEBIDAS', 'EQUIPAMIENTO', 'SNACKS'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 min-h-9 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {cat === 'ALL' ? 'Todos' : cat === 'BEBIDAS' ? 'Bebidas' : cat === 'EQUIPAMIENTO' ? 'Equipamiento' : 'Snacks'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input
                  placeholder="Buscar en inventario..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-xs bg-slate-950 border-slate-800 rounded-xl"
                />
              </div>

              <Button
                onClick={() => openRestockModal()}
                variant="outline"
                className="bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200 text-xs font-bold rounded-xl gap-1.5 h-9 shrink-0"
              >
                <PackagePlus className="w-4 h-4 text-emerald-400" />
                <span className="hidden md:inline">Cargar Stock</span>
              </Button>

              <Button
                onClick={openNewProductModal}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-1.5 h-9 shrink-0 shadow-md shadow-emerald-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Producto</span>
              </Button>
            </div>
          </div>

          {/* Tabla / Lista de Productos del Inventario */}
          {filteredProducts.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 max-w-lg mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                <Boxes className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">No se encontraron productos</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                No hay ningún producto que coincida con los filtros actuales. Podés agregar uno nuevo usando el botón superior.
              </p>
              <Button
                onClick={openNewProductModal}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear Primer Producto</span>
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-3.5 pl-4">Producto</th>
                      <th className="p-3.5">Categoría</th>
                      <th className="p-3.5">Precio Venta</th>
                      <th className="p-3.5">Stock Disponible</th>
                      <th className="p-3.5 text-center">Modificar Stock</th>
                      <th className="p-3.5 text-right pr-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredProducts.map((p) => {
                      const isOutOfStock = p.stock <= 0
                      const isLowStock = p.stock > 0 && p.stock < 10
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Producto & Emoji */}
                          <td className="p-3.5 pl-4">
                            <div className="flex items-center gap-3">
                              <span className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-lg shrink-0">
                                {p.emoji}
                              </span>
                              <div>
                                <div className="font-bold text-slate-100 text-xs">{p.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono">ID: {p.id}</div>
                              </div>
                            </div>
                          </td>

                          {/* Categoría */}
                          <td className="p-3.5">
                            <Badge className={`text-[10px] font-semibold ${
                              p.category === 'BEBIDAS'
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                : p.category === 'EQUIPAMIENTO'
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}>
                              {p.category}
                            </Badge>
                          </td>

                          {/* Precio */}
                          <td className="p-3.5 font-extrabold text-emerald-400 font-mono text-sm">
                            {formatARS(p.price)}
                          </td>

                          {/* Stock & Estado */}
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-lg font-black text-xs font-mono ${
                                isOutOfStock
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : isLowStock
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}>
                                {p.stock} u.
                              </span>
                              {isOutOfStock ? (
                                <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Agotado</span>
                              ) : isLowStock ? (
                                <span className="text-[10px] text-amber-400 font-semibold">Reponer</span>
                              ) : null}
                            </div>
                          </td>

                          {/* Modificar Stock Rápido */}
                          <td className="p-3.5">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleQuickStock(p.id, -1)}
                                disabled={p.stock <= 0}
                                title="Restar 1 unidad"
                                className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-950 flex items-center justify-center transition-colors"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-8 text-center font-bold text-slate-200 font-mono text-xs">
                                {p.stock}
                              </span>
                              <button
                                onClick={() => handleQuickStock(p.id, 1)}
                                title="Sumar 1 unidad"
                                className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                              </button>
                            </div>
                          </td>

                          {/* Acciones */}
                          <td className="p-3.5 text-right pr-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => openRestockModal(p)}
                                className="h-8 text-xs bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 font-bold rounded-xl gap-1 px-2.5 transition-all"
                              >
                                <PackagePlus className="w-3.5 h-3.5" />
                                <span>Cargar Stock</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditProductModal(p)}
                                title="Editar producto"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                title="Eliminar producto"
                                className="h-8 w-8 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'CUENTA_CORRIENTE' ? (
        /* VISTA 4: CUENTAS CORRIENTES Y FIADOS */
        <div className="space-y-6">
          {/* Header con Métricas de Cuenta Corriente */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Card className="p-4 rounded-2xl bg-slate-900/80 border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total en la Calle (Adeudado)</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-black text-amber-400 font-mono">
                  {formatARS(totalOutstandingDebt)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Saldo pendiente acumulado de clientes</p>
            </Card>

            <Card className="p-4 rounded-2xl bg-slate-900/80 border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Clientes con Saldo Deudor</span>
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">{debtorsCount}</span>
                <span className="text-xs text-slate-500 font-medium">personas</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">De un total de {accounts.length} cuentas registradas</p>
            </Card>

            <Card className="p-4 rounded-2xl bg-slate-900/80 border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cobro a Caja Diaria</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-sm font-bold text-emerald-300">Integración Automática</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Cada saldo cobrado ingresa en vivo al arqueo de caja</p>
            </Card>
          </div>

          {/* Barra de Filtros y Acciones */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <Input
                placeholder="Buscar por cliente o teléfono..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="pl-8 h-9 text-xs bg-slate-950 border-slate-800 rounded-xl"
              />
            </div>

            <Button
              onClick={() => setNewChargeModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-1.5 h-9 shrink-0 shadow-md shadow-emerald-950/40"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Cargo / Cliente</span>
            </Button>
          </div>

          {/* Tabla de Clientes con Cuenta Corriente */}
          {accountsLoading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Cargando cuentas corrientes...</span>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 max-w-lg mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                <Wallet className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">No hay cuentas corrientes registradas</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Podés anotar ventas fiadas desde el Punto de Venta seleccionando &quot;A Cuenta&quot;, o crear una cuenta manualmente.
              </p>
              <Button
                onClick={() => setNewChargeModalOpen(true)}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear Primer Cargo</span>
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-3.5 pl-4">Cliente</th>
                      <th className="p-3.5">Saldo Adeudado</th>
                      <th className="p-3.5">Límite</th>
                      <th className="p-3.5">Último Movimiento</th>
                      <th className="p-3.5 text-right pr-4">Acciones de Cobro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAccounts.map((acc) => {
                      const hasDebt = acc.balance > 0
                      const lastMov = acc.movements?.[0]
                      const waUrl = buildDebtWhatsAppReminder(acc, clubName || 'CancharClub', bankAlias)
                      return (
                        <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 pl-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-xs shrink-0">
                                {acc.customer_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-100 text-xs">{acc.customer_name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {acc.customer_phone || 'Sin WhatsApp guardado'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-lg font-black text-xs font-mono ${
                                hasDebt 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}>
                                {formatARS(acc.balance)}
                              </span>
                              {hasDebt ? (
                                <span className="text-[10px] text-amber-400 font-bold">Debe</span>
                              ) : (
                                <span className="text-[10px] text-emerald-400 font-semibold">Al día</span>
                              )}
                            </div>
                          </td>

                          <td className="p-3.5 text-slate-400 font-mono text-xs">
                            {formatARS(acc.credit_limit || 50000)}
                          </td>

                          <td className="p-3.5 text-slate-300 text-[11px]">
                            {lastMov ? (
                              <div>
                                <div className="font-medium text-slate-200 truncate max-w-48">
                                  {lastMov.description}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {new Date(lastMov.date).toLocaleDateString('es-AR')} {new Date(lastMov.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500">Sin movimientos</span>
                            )}
                          </td>

                          <td className="p-3.5 text-right pr-4">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Botón Cobrar Saldo */}
                              {hasDebt && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPayAccount(acc)
                                    setPayAccountAmount(acc.balance.toString())
                                    setPayAccountMethod('CASH')
                                    setPayAccountModalOpen(true)
                                  }}
                                  className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-1 shadow-xs"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Cobrar</span>
                                </Button>
                              )}

                              {/* Botón Enviar WhatsApp */}
                              {hasDebt && acc.customer_phone && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="h-8 px-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-400 text-xs font-semibold flex items-center gap-1 transition-colors"
                                  title="Enviar detalle de saldo por WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </a>
                              )}

                              {/* Botón Ver Historial */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedHistoryAccount(acc)
                                  setHistoryModalOpen(true)
                                }}
                                className="h-8 px-2 text-slate-400 hover:text-white rounded-xl"
                                title="Ver historial de cargos y pagos"
                              >
                                <History className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* VISTA 2: PUNTO DE VENTA (MOSTRADOR) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Catálogo de Productos */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filtros y Buscador */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-momentum pb-1">
                {['ALL', 'BEBIDAS', 'EQUIPAMIENTO', 'SNACKS'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 min-h-9 rounded-xl text-xs font-semibold shrink-0 transition-all ${
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
            {filteredProducts.length === 0 ? (
              <div className="py-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 p-8 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                  <Package className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">No hay productos en inventario</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Agregá bebidas, snacks o artículos deportivos desde la pestaña &quot;Inventario&quot; para comenzar a vender en mostrador.
                </p>
                <Button
                  onClick={openNewProductModal}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Primer Producto</span>
                </Button>
              </div>
            ) : (
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
            )}
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
                        {courts.map((court) => (
                          <option key={court.id} value={court.name}>{court.name}</option>
                        ))}
                      </select>
                    </div>

                    {assignToCourt === 'NONE' && (
                      <div className="space-y-2 text-xs">
                        <label className="text-slate-400 font-semibold block">Medio de Cobro:</label>
                        <div className="grid grid-cols-4 gap-1">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('CASH')}
                            className={`p-1.5 sm:p-2 rounded-xl text-center border text-[10px] sm:text-[11px] font-semibold transition-all ${
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
                            className={`p-1.5 sm:p-2 rounded-xl text-center border text-[10px] sm:text-[11px] font-semibold transition-all ${
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
                            className={`p-1.5 sm:p-2 rounded-xl text-center border text-[10px] sm:text-[11px] font-semibold transition-all ${
                              paymentMethod === 'TRANSFER'
                                ? 'bg-purple-600/20 border-purple-500 text-purple-400'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            Transf.
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('CUENTA_CORRIENTE')}
                            className={`p-1.5 sm:p-2 rounded-xl text-center border text-[10px] sm:text-[11px] font-semibold transition-all ${
                              paymentMethod === 'CUENTA_CORRIENTE'
                                ? 'bg-amber-600/25 border-amber-500 text-amber-300 shadow-xs'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            A Cuenta
                          </button>
                        </div>

                        {paymentMethod === 'CUENTA_CORRIENTE' && (
                          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2 mt-2">
                            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                              <Wallet className="w-3.5 h-3.5" />
                              <span>Fiado / A Cuenta Corriente</span>
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-1">Nombre del Cliente *:</label>
                              <Input
                                placeholder="Ej: Lucas Rossi"
                                value={cuentaCorrienteName}
                                onChange={(e) => setCuentaCorrienteName(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-700 rounded-lg text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-1">Teléfono WhatsApp (opcional):</label>
                              <Input
                                placeholder="Ej: 11 5566 7788"
                                value={cuentaCorrientePhone}
                                onChange={(e) => setCuentaCorrientePhone(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-700 rounded-lg text-slate-100"
                              />
                            </div>
                          </div>
                        )}
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
        clubSlug={clubSlug || 'club'}
      />

      {/* Modal: Cargar Stock / Ingreso de Mercadería */}
      <Dialog open={isRestockModalOpen} onOpenChange={setIsRestockModalOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-emerald-400" />
              <span>Cargar Stock / Ingreso de Mercadería</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Registrá el ingreso de nuevas unidades de un producto para sumar al inventario.
            </DialogDescription>
          </DialogHeader>

          {selectedRestockProduct && (
            <div className="space-y-4 py-2">
              {/* Selector o Vista del Producto seleccionado */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedRestockProduct.emoji}</span>
                  <div>
                    <h4 className="text-xs font-bold text-white">{selectedRestockProduct.name}</h4>
                    <span className="text-[10px] text-slate-400">Categoría: {selectedRestockProduct.category}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Stock Actual</span>
                  <span className="font-extrabold text-sm text-emerald-400 font-mono">{selectedRestockProduct.stock} u.</span>
                </div>
              </div>

              {/* Selector de packs rápidos */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Packs rápidos de reposición:</label>
                <div className="grid grid-cols-4 gap-2">
                  {[6, 12, 24, 48].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setRestockQty(qty)}
                      className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all ${
                        restockQty === qty
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      +{qty} u.
                    </button>
                  ))}
                </div>
              </div>

              {/* Cantidad manual */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">O ingresá la cantidad exacta a sumar:</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={restockQty || ''}
                    onChange={(e) => setRestockQty(Math.max(1, parseInt(e.target.value) || 0))}
                    className="bg-slate-950 border-slate-800 text-white text-sm rounded-xl h-10 font-mono"
                    placeholder="Cantidad a sumar..."
                  />
                  <span className="text-xs text-slate-400 font-medium shrink-0">unidades</span>
                </div>
              </div>

              {/* Cálculo en vivo */}
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs flex items-center justify-between text-slate-200">
                <span className="text-slate-300">Nuevo stock resultante:</span>
                <span className="font-extrabold text-base text-emerald-400 font-mono">
                  {selectedRestockProduct.stock} + {restockQty} = {selectedRestockProduct.stock + (restockQty || 0)} unidades
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsRestockModalOpen(false)}
              className="text-xs text-slate-400 hover:text-white rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={restockSubmitting || !restockQty || restockQty <= 0}
              onClick={handleConfirmRestock}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-2 h-10"
            >
              {restockSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Ingreso de Stock</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Nuevo / Editar Producto */}
      <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
        <DialogContent className="max-w-lg bg-slate-900 border-slate-800 text-slate-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              {editingProduct ? <Edit3 className="w-5 h-5 text-emerald-400" /> : <Plus className="w-5 h-5 text-emerald-400" />}
              <span>{editingProduct ? 'Editar Producto del Inventario' : 'Nuevo Producto para la Cantina'}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {editingProduct 
                ? 'Modificá los datos, precio o stock del producto.'
                : 'Completá los datos para agregarlo al catálogo y al mostrador.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProduct} className="space-y-4 py-2">
            {/* Nombre del Producto */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Nombre del Producto *</label>
              <Input
                required
                placeholder=""
                value={productForm.name}
                onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                className="bg-slate-950 border-slate-800 text-white text-xs rounded-xl h-10"
              />
            </div>

            {/* Categoría y Precio */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Categoría *</label>
                <select
                  value={productForm.category}
                  onChange={(e) => setProductForm(prev => ({ ...prev, category: e.target.value as 'BEBIDAS' | 'EQUIPAMIENTO' | 'SNACKS' }))}
                  className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 px-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="BEBIDAS">Bebidas</option>
                  <option value="EQUIPAMIENTO">Equipamiento</option>
                  <option value="SNACKS">Snacks</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 block">Precio de Venta ($ ARS) *</label>
                  {!isOwner && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      <Lock className="w-2.5 h-2.5" />
                      Solo Dueño
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    required
                    min="1"
                    step="50"
                    placeholder=""
                    value={productForm.price || ''}
                    disabled={!isOwner}
                    onChange={(e) => setProductForm(prev => ({ ...prev, price: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className={`bg-slate-950 border-slate-800 text-white text-xs rounded-xl h-10 font-mono ${
                      !isOwner ? 'opacity-70 cursor-not-allowed bg-slate-950/80 pr-8' : ''
                    }`}
                  />
                  {!isOwner && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400/80 pointer-events-none">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
                {!isOwner && (
                  <p className="text-[10px] text-slate-400">
                    El precio de venta solo puede ser modificado por el dueño del club.
                  </p>
                )}
              </div>
            </div>

            {/* Stock */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                {editingProduct ? 'Stock Actual (unidades)' : 'Stock Inicial (unidades)'}
              </label>
              <Input
                type="number"
                min="0"
                placeholder=""
                value={productForm.stock}
                onChange={(e) => setProductForm(prev => ({ ...prev, stock: Math.max(0, parseInt(e.target.value) || 0) }))}
                className="bg-slate-950 border-slate-800 text-white text-xs rounded-xl h-10 font-mono"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsProductModalOpen(false)}
                className="text-xs text-slate-400 hover:text-white rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={productSaving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-2 h-10"
              >
                {productSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{editingProduct ? 'Guardar Cambios' : 'Crear Producto'}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Cobrar Deuda / Pago a Cuenta */}
      <Dialog open={payAccountModalOpen} onOpenChange={setPayAccountModalOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Banknote className="w-5 h-5 text-emerald-400" />
              <span>Cobrar Saldo Fiado / Pago a Cuenta</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Registrá el pago del cliente. Este monto ingresará automáticamente a la Caja Diaria del club.
            </DialogDescription>
          </DialogHeader>

          {selectedPayAccount && (
            <div className="space-y-4 py-2">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{selectedPayAccount.customer_name}</h4>
                  <span className="text-xs text-slate-400">{selectedPayAccount.customer_phone || 'Sin WhatsApp'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Deuda Pendiente</span>
                  <span className="font-extrabold text-base text-rose-400 font-mono">
                    {formatARS(selectedPayAccount.balance)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Monto a Cobrar ($ ARS) *</label>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    value={payAccountAmount}
                    onChange={(e) => setPayAccountAmount(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white text-sm rounded-xl h-10 font-mono"
                    placeholder="Monto a pagar..."
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPayAccountAmount(String(selectedPayAccount.balance))}
                    className="text-[10px] px-2 py-1 rounded-md bg-slate-800 text-slate-300 hover:text-white"
                  >
                    Pagar Total ({formatARS(selectedPayAccount.balance)})
                  </button>
                  {selectedPayAccount.balance > 2000 && (
                    <button
                      type="button"
                      onClick={() => setPayAccountAmount(String(Math.round(selectedPayAccount.balance / 2)))}
                      className="text-[10px] px-2 py-1 rounded-md bg-slate-800 text-slate-300 hover:text-white"
                    >
                      Pagar 50% ({formatARS(Math.round(selectedPayAccount.balance / 2))})
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Medio de Cobro *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'CASH', label: 'Efectivo', icon: Banknote },
                    { id: 'TRANSFER', label: 'Transferencia', icon: Wallet },
                  ].map((m) => {
                    const Icon = m.icon
                    const isSelected = payAccountMethod === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPayAccountMethod(m.id as 'CASH' | 'TRANSFER')}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-950/40'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{m.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs flex items-center justify-between text-slate-200">
                <span className="text-slate-300">Saldo restante estimado:</span>
                <span className="font-extrabold text-sm text-emerald-400 font-mono">
                  {formatARS(Math.max(0, selectedPayAccount.balance - (Number(payAccountAmount) || 0)))}
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPayAccountModalOpen(false)}
              className="text-xs text-slate-400 hover:text-white rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={submittingAccountPayment || !payAccountAmount || Number(payAccountAmount) <= 0}
              onClick={handleConfirmAccountPayment}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-2 h-10 shadow-lg shadow-emerald-600/20"
            >
              {submittingAccountPayment ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Cobro e Ingresar a Caja</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Nuevo Cargo Manual a Cuenta Corriente */}
      <Dialog open={newChargeModalOpen} onOpenChange={setNewChargeModalOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              <span>Registrar Cargo Manual &ldquo;A Cuenta&rdquo;</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Anotá un consumo o saldo fiado a nombre de un cliente frecuente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Nombre del Cliente *</label>
              <Input
                placeholder="Ej: Marcos Alvarez"
                value={newChargeName}
                onChange={(e) => setNewChargeName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white text-xs rounded-xl h-10"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Teléfono / WhatsApp (opcional)</label>
              <Input
                placeholder="Ej: 11 4455 6677"
                value={newChargePhone}
                onChange={(e) => setNewChargePhone(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white text-xs rounded-xl h-10"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Monto a Cargar ($ ARS) *</label>
              <Input
                type="number"
                min="1"
                placeholder="Ej: 3500"
                value={newChargeAmount}
                onChange={(e) => setNewChargeAmount(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white text-xs rounded-xl h-10 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Concepto o Detalle (opcional)</label>
              <Input
                placeholder="Ej: 2 Gatorades y 1 paquete de galletitas"
                value={newChargeReason}
                onChange={(e) => setNewChargeReason(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white text-xs rounded-xl h-10"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setNewChargeModalOpen(false)}
              className="text-xs text-slate-400 hover:text-white rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={submittingNewCharge || !newChargeName.trim() || !newChargeAmount || Number(newChargeAmount) <= 0}
              onClick={handleCreateNewCharge}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl gap-2 h-10 shadow-lg shadow-emerald-600/20"
            >
              {submittingNewCharge ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Anotar Cargo en Cuenta</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Historial de Movimientos de Cuenta Corriente */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="max-w-lg bg-slate-900 border-slate-800 text-slate-100 rounded-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-400" />
                <span>Historial de Movimientos</span>
              </div>
              {selectedHistoryAccount && (
                <Badge className={selectedHistoryAccount.balance > 0 ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}>
                  Saldo: {formatARS(selectedHistoryAccount.balance)}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {selectedHistoryAccount ? `Detalle de compras y pagos de ${selectedHistoryAccount.customer_name}` : 'Movimientos registrados'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 space-y-2 pr-1">
            {selectedHistoryAccount?.movements && selectedHistoryAccount.movements.length > 0 ? (
              selectedHistoryAccount.movements.map((mov) => {
                const isCharge = mov.type === 'CHARGE'
                return (
                  <div
                    key={mov.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={isCharge ? "text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/30" : "text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}
                        >
                          {isCharge ? 'Fiado / Cargo' : 'Pago / Cobro'}
                        </Badge>
                        <span className="text-[10px] text-slate-400">
                          {new Date(mov.date).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 font-medium">
                        {mov.description || (isCharge ? 'Consumo en Cantina' : 'Cobro de saldo')}
                      </p>
                      {mov.payment_method && (
                        <span className="text-[10px] text-slate-500">
                          Medio: {mov.payment_method === 'CASH' ? 'Efectivo' : mov.payment_method === 'TRANSFER' ? 'Transferencia' : mov.payment_method}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-extrabold font-mono ${isCharge ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isCharge ? `+${formatARS(mov.amount)}` : `-${formatARS(mov.amount)}`}
                      </span>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8 text-xs text-slate-500">
                No hay movimientos registrados en esta cuenta.
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setHistoryModalOpen(false)}
              className="text-xs text-slate-300 border-slate-800 hover:bg-slate-800 rounded-xl"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PlanFeatureGuard>
  )
}
