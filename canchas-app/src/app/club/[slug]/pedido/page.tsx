'use client'

import { useState, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  ShoppingBag, 
  Plus, 
  Minus, 
  ArrowLeft, 
  CheckCircle2, 
  Coffee, 
  Sparkles,
  DollarSign,
  QrCode,
  Loader2
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatARS } from '@/lib/utils'
import { siteConfig } from '@/config/site'
import { toast } from 'sonner'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  category: 'BEBIDAS' | 'EQUIPAMIENTO' | 'SNACKS'
  price: number
  emoji: string
}

const CANTINA_ITEMS: Product[] = [
  { id: 'p1', name: 'Gatorade / Powerade 500ml', category: 'BEBIDAS', price: 2500, emoji: '⚡' },
  { id: 'p2', name: 'Agua Mineral Glaciar 500ml', category: 'BEBIDAS', price: 1500, emoji: '💧' },
  { id: 'p3', name: 'Cerveza Corona / Stella 330ml', category: 'BEBIDAS', price: 3500, emoji: '🍺' },
  { id: 'p4', name: 'Tubo Pelotas Pádel x3 (Bullpadel)', category: 'EQUIPAMIENTO', price: 14000, emoji: '🎾' },
  { id: 'p5', name: 'Alquiler de Paleta de Pádel', category: 'EQUIPAMIENTO', price: 3500, emoji: '🏓' },
  { id: 'p6', name: 'Overgrip Wilson / Bullpadel Pro', category: 'EQUIPAMIENTO', price: 2200, emoji: '🏸' },
  { id: 'p7', name: 'Barra de Cereal / Proteica', category: 'SNACKS', price: 1200, emoji: '🍫' },
  { id: 'p8', name: 'Papas Fritas Lays / Maní', category: 'SNACKS', price: 1800, emoji: '🥜' },
]

export default function CourtOrderPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const resolvedParams = use(params)
  const searchParams = useSearchParams()
  const courtName = searchParams.get('cancha') || 'Cancha Principal'

  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([])
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)

  const addToCart = (product: Product) => {
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

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cart.length === 0) {
      toast.error('Seleccioná al menos un producto')
      return
    }
    if (!customerName.trim()) {
      toast.error('Ingresá tu nombre para identificarte en la cancha')
      return
    }

    setIsSubmitting(true)
    // Simular creación del pedido y broadcast a cantina
    setTimeout(() => {
      // Guardar pedido en localStorage para sincronizar con la cantina del club
      const existingOrders = JSON.parse(localStorage.getItem('canchar_court_orders') || '[]')
      const newOrder = {
        id: `ord-${Date.now()}`,
        court_name: courtName,
        customer_name: customerName,
        total_ars: totalArs,
        status: 'PENDING',
        created_at: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        items: cart.map(i => ({
          name: i.product.name,
          quantity: i.quantity,
          unit_price: i.product.price,
          subtotal: i.product.price * i.quantity,
        })),
        notes,
      }
      localStorage.setItem('canchar_court_orders', JSON.stringify([newOrder, ...existingOrders]))

      setIsSubmitting(false)
      setOrderConfirmed(true)
      toast.success('¡Pedido enviado a la cantina!', {
        description: 'Enseguida te lo alcanzamos a la cancha.'
      })
    }, 600)
  }

  if (orderConfirmed) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-3xl bg-slate-900/90 border border-emerald-500/30 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            ¡Comanda Recibida en Kiosco!
          </Badge>
          <h2 className="text-xl font-bold text-white">
            ¡Marchando a {courtName}!
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Hola <strong className="text-slate-200">{customerName}</strong>, recibimos tu pedido de{' '}
            <strong className="text-emerald-400">{formatARS(totalArs)}</strong>. El personal del club te lo llevará a la cancha en breve.
          </p>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-left text-xs space-y-1.5">
            <div className="text-slate-400 font-bold uppercase text-[10px]">Detalle del Pedido:</div>
            {cart.map((item) => (
              <div key={item.product.id} className="flex justify-between text-slate-300">
                <span>{item.quantity}x {item.product.name}</span>
                <span className="font-semibold text-emerald-400">{formatARS(item.product.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-500">
            Podés abonar el consumo en efectivo, Mercado Pago o sumarlo a la cuenta del turno al finalizar.
          </p>

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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
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
              <span>{courtName}</span>
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

      {/* Hero Banner */}
      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="p-4 rounded-2xl bg-gradient-to-tr from-emerald-950/60 to-slate-900 border border-emerald-500/20 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white">Pedí directo desde tu cancha</h2>
              <p className="text-[11px] text-slate-400">Bebidas frías, pelotas y overgrips sin cortar el partido.</p>
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
          {CANTINA_ITEMS.map((product) => {
            const inCart = cart.find((i) => i.product.id === product.id)
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

                {inCart ? (
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
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Tu nombre (Ej: Juan)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-9 text-xs bg-slate-900 border-slate-700"
                required
              />
              <Input
                placeholder="Aclaración (Ej: fría)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs bg-slate-900 border-slate-700"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-medium">Total Pedido:</div>
                <div className="text-base font-extrabold text-emerald-400">
                  {formatARS(totalArs)}
                </div>
              </div>

              <Button
                onClick={handleSendOrder}
                disabled={isSubmitting}
                className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Pedir a {courtName}</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
