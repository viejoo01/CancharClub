'use client'

import { useState } from 'react'
import { 
  Banknote, 
  ArrowRightLeft, 
  CreditCard, 
  Calendar as CalendarIcon, 
  Printer, 
  TrendingUp,
  Download
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS, formatTime } from '@/lib/utils'
import { toast } from 'sonner'

export default function CajaPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  // Pagos del día de muestra para visualización premium
  const [payments] = useState([
    {
      id: 'p1',
      customer_name: 'Gonzalo Morales',
      court_name: 'Cancha 1 (Panorámica)',
      amount_ars: 14000,
      payment_method: 'CASH',
      created_at: `${new Date().toISOString().split('T')[0]}T19:35:00Z`,
      notes: 'Pago total en mostrador',
    },
    {
      id: 'p2',
      customer_name: 'Matías Fernández',
      court_name: 'Cancha 2 (Techada)',
      amount_ars: 7000,
      payment_method: 'MERCADOPAGO',
      created_at: `${new Date().toISOString().split('T')[0]}T18:10:00Z`,
      notes: 'Seña online Checkout Pro',
    },
    {
      id: 'p3',
      customer_name: 'Lucas Benítez',
      court_name: 'Fútbol 5 (Sintético)',
      amount_ars: 15000,
      payment_method: 'TRANSFER',
      created_at: `${new Date().toISOString().split('T')[0]}T17:45:00Z`,
      notes: 'Transferencia Alias: club.padel.tuc',
    },
    {
      id: 'p4',
      customer_name: 'Esteban Alderete',
      court_name: 'Cancha 3 (Blindex)',
      amount_ars: 5000,
      payment_method: 'CASH',
      created_at: `${new Date().toISOString().split('T')[0]}T16:20:00Z`,
      notes: 'Saldo pendiente abonado',
    },
  ])

  const totalCash = payments.filter(p => p.payment_method === 'CASH').reduce((a, b) => a + b.amount_ars, 0)
  const totalTransfer = payments.filter(p => p.payment_method === 'TRANSFER').reduce((a, b) => a + b.amount_ars, 0)
  const totalMP = payments.filter(p => p.payment_method === 'MERCADOPAGO').reduce((a, b) => a + b.amount_ars, 0)
  const totalGeneral = totalCash + totalTransfer + totalMP

  const handlePrint = () => {
    toast.success('Generando reporte de arqueo para impresión...')
    window.print()
  }

  const handleExportCSV = () => {
    const headers = ['ID', 'Cliente', 'Cancha/Concepto', 'Metodo', 'Monto_ARS', 'Fecha_Hora', 'Notas']
    const rows = payments.map(p => [
      p.id,
      `"${p.customer_name}"`,
      `"${p.court_name}"`,
      p.payment_method,
      p.amount_ars,
      p.created_at,
      `"${p.notes || ''}"`
    ])

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `arqueo-caja-${selectedDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Reporte CSV descargado con éxito')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Caja Diaria & Arqueo
          </h2>
          <p className="text-xs text-slate-400">
            Control de ingresos, cobros en mostrador, transferencias y pagos online de Mercado Pago.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 gap-2">
            <CalendarIcon className="w-4 h-4 text-emerald-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none"
            />
          </div>

          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            className="gap-2 border-slate-700 bg-slate-900 text-slate-200 hover:text-white"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar CSV</span>
          </Button>

          <Button
            onClick={handlePrint}
            variant="outline"
            size="sm"
            className="gap-2 border-slate-700 bg-slate-900 text-slate-200 hover:text-white"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Cierre</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-emerald-500/30 bg-emerald-950/20 shadow-emerald-950/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold uppercase">
              <span>Total Recaudado</span>
              <TrendingUp className="w-4 h-4" />
            </div>
            <CardTitle className="text-2xl font-black text-white mt-1">
              {formatARS(totalGeneral)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-emerald-300/80">
            {payments.length} transacciones registradas hoy
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
              <span>Efectivo en Caja</span>
              <Banknote className="w-4 h-4 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl font-extrabold text-slate-100 mt-1">
              {formatARS(totalCash)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-400">
            Dinero físico en cajón de mostrador
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
              <span>Transferencias</span>
              <ArrowRightLeft className="w-4 h-4 text-sky-400" />
            </div>
            <CardTitle className="text-2xl font-extrabold text-slate-100 mt-1">
              {formatARS(totalTransfer)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-400">
            Acreditado en cuenta bancaria del club
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
              <span>Mercado Pago</span>
              <CreditCard className="w-4 h-4 text-cyan-400" />
            </div>
            <CardTitle className="text-2xl font-extrabold text-slate-100 mt-1">
              {formatARS(totalMP)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-400">
            Señas y pagos online de jugadores
          </CardContent>
        </Card>
      </div>

      {/* Lista de Transacciones */}
      <Card className="border-slate-800 bg-slate-900/60 overflow-hidden">
        <CardHeader className="border-b border-slate-800/80 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Detalle de Cobros del Día</CardTitle>
            <Badge variant="outline" className="text-xs">
              Fecha: {selectedDate}
            </Badge>
          </div>
        </CardHeader>

        <div className="divide-y divide-slate-800/60">
          {payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                  {p.payment_method === 'CASH' && <Banknote className="w-4 h-4 text-emerald-400" />}
                  {p.payment_method === 'TRANSFER' && <ArrowRightLeft className="w-4 h-4 text-sky-400" />}
                  {p.payment_method === 'MERCADOPAGO' && <CreditCard className="w-4 h-4 text-cyan-400" />}
                </div>

                <div>
                  <div className="font-semibold text-sm text-slate-100">
                    {p.customer_name}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{p.court_name}</span>
                    <span>•</span>
                    <span>{formatTime(p.created_at)} hs</span>
                    {p.notes && (
                      <>
                        <span>•</span>
                        <span className="italic text-slate-500">{p.notes}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-base font-bold text-emerald-400">
                  +{formatARS(p.amount_ars)}
                </div>
                <Badge
                  variant={
                    p.payment_method === 'CASH'
                      ? 'default'
                      : p.payment_method === 'TRANSFER'
                      ? 'info'
                      : 'secondary'
                  }
                  className="text-[10px] mt-1"
                >
                  {p.payment_method === 'CASH' ? 'Efectivo' : p.payment_method === 'TRANSFER' ? 'Transferencia' : 'Mercado Pago'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
