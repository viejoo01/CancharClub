'use client'

import { useState, use, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  ShoppingBag, 
  Plus, 
  Minus, 
  ArrowLeft, 
  CheckCircle2, 
  Coffee, 
  Loader2,
  Copy,
  Check,
  CreditCard,
  Banknote,
  UtensilsCrossed
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatARS } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { getClubBySlug, getClubBankDetails } from '@/config/clubs-catalog'
import { 
  createCourtOrder, 
  getCantinaProducts, 
  type CantinaPaymentMethod, 
} from '@/actions/cantina.actions'
import { INITIAL_CANTINA_PRODUCTS, type CantinaProduct } from '@/config/cantina-data'

export type Product = CantinaProduct

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default function CourtOrderPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const resolvedParams = use(params)
  const searchParams = useSearchParams()

  const rawMesa = searchParams.get('mesa') || searchParams.get('cancha') || ''
  const initialTable = rawMesa ? (rawMesa.toLowerCase().startsWith('cancha') ? 'Mesa' : rawMesa) : 'Mesa'

  const club = useMemo(() => getClubBySlug(resolvedParams.slug), [resolvedParams.slug])
  const bankDetails = useMemo(() => getClubBankDetails(club), [club])

  const [products, setProducts] = useState<CantinaProduct[]>(INITIAL_CANTINA_PRODUCTS)
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([])
  const [customerName, setCustomerName] = useState('')
  const [tableName, setTableName] = useState(initialTable)
  const [paymentMethod, setPaymentMethod] = useState<CantinaPaymentMethod>('TRANSFER')
  const [notes, setNotes] = useState('')
  const [copiedAlias, setCopiedAlias] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [confirmedOrderId, setConfirmedOrderId] = useState<string>('')

  // Cargar catálogo dinámico de productos desde Supabase
  useEffect(() => {
    getCantinaProducts(DEMO_TENANT_ID)
      .then((items) => {
        if (items && items.length > 0) {
          setProducts(items.filter((p) => p.is_active !== false))
        }
      })
      .catch((err) => {
        console.warn('Error al cargar productos de cantina:', err)
      })
  }, [])

  const addToCart = (product: Product) => {
    if (product.stock !== undefined && product.stock <= 0) {
      toast.error('Este producto está momentáneamente agotado')
      return
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const next = item.quantity + delta
            return next > 0 ? { ...item, quantity: next } : null
          }
          return item
        })
        .filter(Boolean) as Array<{ product: Product; quantity: number }>
    )
  }

  const totalArs = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const itemsCount = cart.reduce((acc, item) => acc + item.quantity, 0)

  const handleCopyAlias = () => {
    navigator.clipboard.writeText(bankDetails.alias)
    setCopiedAlias(true)
    toast.success('Alias copiado al portapapeles')
    setTimeout(() => setCopiedAlias(false), 2000)
  }

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cart.length === 0) {
      toast.error('Seleccioná al menos un producto')
      return
    }
    if (!customerName.trim()) {
      toast.error('Ingresá tu nombre para identificarte en el mostrador')
      return
    }

    setIsSubmitting(true)
    try {
      const destination = tableName.trim() || 'Mesa Cantina'
      const orderItems = cart.map(i => ({
        product_id: i.product.id,
        name: i.product.name,
        quantity: i.quantity,
        unit_price: i.product.price,
        subtotal: i.product.price * i.quantity,
      }))

      // Guardar en base de datos vía Server Action
      const result = await createCourtOrder({
        tenant_id: DEMO_TENANT_ID,
        court_name: destination,
        customer_name: customerName.trim(),
        items: orderItems,
        total_ars: totalArs,
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'TRANSFER' ? 'PAID' : 'PENDING',
        notes: notes.trim() || undefined,
      })

      if (!result.success || !result.order) {
        throw new Error(result.error || 'No se pudo registrar la comanda en el sistema')
      }

      const finalId = result.order.id
      setConfirmedOrderId(finalId)

      // Emitir en BroadcastChannel para notificación instantánea en la cantina (0ms)
      try {
        const bc = new BroadcastChannel('canchar_cantina_orders')
        bc.postMessage({
          type: 'NEW_ORDER',
          order: {
            id: finalId,
            tenant_id: DEMO_TENANT_ID,
            court_name: destination,
            customer_name: customerName.trim(),
            items: orderItems,
            total_ars: totalArs,
            status: 'PENDING',
            payment_method: paymentMethod,
            payment_status: paymentMethod === 'TRANSFER' ? 'PAID' : 'PENDING',
            created_at: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            notes: notes.trim() || null,
          }
        })
        bc.close()
      } catch (bcErr) {
        console.warn('BroadcastChannel error:', bcErr)
      }

      // Guardar en localStorage para persistencia y respaldo offline
      try {
        const existingOrders = JSON.parse(localStorage.getItem('canchar_court_orders') || '[]')
        const newLocalOrder = {
          id: finalId,
          court_name: destination,
          customer_name: customerName.trim(),
          total_ars: totalArs,
          status: 'PENDING',
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'TRANSFER' ? 'PAID' : 'PENDING',
          created_at: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          items: orderItems,
          notes: notes.trim() || null,
        }
        localStorage.setItem('canchar_court_orders', JSON.stringify([newLocalOrder, ...existingOrders]))
      } catch (lsErr) {
        console.warn('LocalStorage error:', lsErr)
      }

      setOrderConfirmed(true)
      toast.success('¡Pedido enviado a la cantina!', {
        description: 'Acercate a la barra a retirar cuando desees.'
      })
    } catch (err) {
      console.error('Error al enviar pedido:', err)
      toast.error('Hubo un error al enviar el pedido. Por favor intentá nuevamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (orderConfirmed) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-3xl bg-slate-900/90 border border-emerald-500/30 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            ¡Comanda Recibida en Cantina!
          </Badge>

          <h2 className="text-xl font-bold text-white">
            ¡Tu pedido está en marcha!
          </h2>

          <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
            <span>Retirá tu pedido por el mostrador de la cantina</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Hola <strong className="text-slate-200">{customerName}</strong>, recibimos tu pedido por un total de{' '}
            <strong className="text-emerald-400">{formatARS(totalArs)}</strong>.
          </p>

          {/* Información del Medio de Pago */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-left text-xs space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Medio de Pago:</span>
              <Badge className={paymentMethod === 'TRANSFER' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}>
                {paymentMethod === 'TRANSFER' ? 'Transferencia Bancaria' : 'Efectivo en Mostrador'}
              </Badge>
            </div>

            {paymentMethod === 'TRANSFER' ? (
              <div className="text-[11px] text-slate-300 space-y-1 pt-1 border-t border-slate-800/80">
                <p className="text-purple-300 font-medium">
                  💳 <strong>Transferencia bancaria informada:</strong>
                </p>
                <p className="text-slate-400">
                  Mostrá tu comprobante de transferencia al retirar en la barra.
                </p>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Alias del Club:</span>
                    <span className="font-mono text-emerald-400 font-bold">{bankDetails.alias}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={handleCopyAlias} className="h-7 text-xs text-slate-300">
                    {copiedAlias ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-amber-300 pt-1 border-t border-slate-800/80">
                💵 <strong>Pago en efectivo:</strong> Abonás los <strong className="text-white">{formatARS(totalArs)}</strong> directamente en la barra al retirar.
              </p>
            )}
          </div>

          {/* Detalle de Artículos */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-left text-xs space-y-1.5">
            <div className="text-slate-400 font-bold uppercase text-[10px]">Detalle del Pedido #{confirmedOrderId.slice(-4)}:</div>
            {cart.map((item) => (
              <div key={item.product.id} className="flex justify-between text-slate-300">
                <span>{item.quantity}x {item.product.name}</span>
                <span className="font-semibold text-emerald-400">{formatARS(item.product.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Button
              onClick={() => {
                setCart([])
                setOrderConfirmed(false)
              }}
              variant="outline"
              className="w-full text-xs rounded-xl"
            >
              Hacer otro pedido
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-32">
      {/* Header Mobile Sticky */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link
            href={`/club/${resolvedParams.slug}`}
            className="p-1.5 -ml-1.5 text-slate-400 hover:text-white rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="text-center">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
              Cantina & Kiosco
            </div>
            <h1 className="text-sm font-bold text-white flex items-center gap-1.5 justify-center">
              <span>{club.name}</span>
            </h1>
          </div>

          <div className="w-8 flex justify-end">
            <div className="relative">
              <ShoppingBag className="w-5 h-5 text-slate-300" />
              {itemsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-[10px] font-black text-slate-950 flex items-center justify-center">
                  {itemsCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Banner Pedidos en Mesa */}
      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="p-4 rounded-2xl bg-gradient-to-tr from-emerald-950/60 to-slate-900 border border-emerald-500/20 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white">Pedí desde tu mesa y retirá en cantina</h2>
              <p className="text-[11px] text-slate-400">Elegí tus bebidas o snacks, pagá con transferencia o efectivo y retirás en el mostrador.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Productos */}
      <div className="max-w-md mx-auto px-4 mt-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Carta de la Cantina
        </h3>

        <div className="grid grid-cols-1 gap-2.5">
          {products.map((product) => {
            const inCart = cart.find((i) => i.product.id === product.id)
            const isOutOfStock = product.stock !== undefined && product.stock <= 0
            return (
              <div
                key={product.id}
                className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-lg shrink-0">
                    {product.emoji}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">
                      {product.name}
                    </h4>
                    <div className="text-xs font-extrabold text-emerald-400 mt-0.5">
                      {formatARS(product.price)}
                    </div>
                  </div>
                </div>

                {isOutOfStock ? (
                  <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px] font-bold px-2.5 py-1">
                    Agotado
                  </Badge>
                ) : inCart ? (
                  <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 shrink-0">
                    <button
                      onClick={() => updateQuantity(product.id, -1)}
                      className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-300"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-5 text-center text-xs font-bold text-white">
                      {inCart.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(product.id, 1)}
                      className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => addToCart(product)}
                    className="h-8 px-3 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-xs font-bold shrink-0 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    <span>Agregar</span>
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Barra Flotante de Confirmación de Pedido */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 p-4">
          <div className="max-w-md mx-auto space-y-3">
            {/* Datos del Cliente y Mesa */}
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Tu nombre (Ej: Juan)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-9 text-xs bg-slate-900 border-slate-700"
                required
              />
              <Input
                placeholder="Mesa (Ej: Mesa 1)"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="h-9 text-xs bg-slate-900 border-slate-700"
              />
            </div>

            {/* Selector de Método de Pago */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 block">
                Forma de pago al pedir:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('TRANSFER')}
                  className={`p-2 rounded-xl text-left border text-xs transition-all flex items-center gap-2 ${
                    paymentMethod === 'TRANSFER'
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <div className="text-[11px] leading-tight">Transferencia</div>
                    <div className="text-[9px] opacity-75 font-normal">Alias / CBU</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`p-2 rounded-xl text-left border text-xs transition-all flex items-center gap-2 ${
                    paymentMethod === 'CASH'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Banknote className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-[11px] leading-tight">Efectivo</div>
                    <div className="text-[9px] opacity-75 font-normal">Pagar al retirar</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Ficha de Transferencia si está seleccionado */}
            {paymentMethod === 'TRANSFER' && (
              <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-[11px] space-y-1 text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-purple-300 font-bold">Datos para transferir:</span>
                  <button
                    type="button"
                    onClick={handleCopyAlias}
                    className="text-[10px] font-bold text-purple-300 hover:text-purple-200 flex items-center gap-1"
                  >
                    {copiedAlias ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedAlias ? 'Copiado' : 'Copiar Alias'}</span>
                  </button>
                </div>
                <div className="font-mono text-purple-200 font-bold text-xs">{bankDetails.alias}</div>
                <div className="text-[10px] text-slate-400">Titular: {bankDetails.accountHolder}</div>
              </div>
            )}

            <Input
              placeholder="Aclaración opcional (Ej: bien fría, sin hielo)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 text-xs bg-slate-900 border-slate-700"
            />

            {/* Total y Botón de Envío */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-medium">Total:</div>
                <div className="text-base font-extrabold text-emerald-400">
                  {formatARS(totalArs)}
                </div>
              </div>

              <Button
                onClick={handleSendOrder}
                disabled={isSubmitting}
                className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Pedir y Retirar en Cantina</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
