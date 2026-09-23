'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Banknote,
  ArrowRightLeft,
  CreditCard,
  Calendar as CalendarIcon,
  Printer,
  TrendingUp,
  Download,
  Landmark,
  Loader2,
  Receipt,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS, cleanNoteForDisplay, paymentMethodLabel } from '@/lib/utils'
import { getDailyCashReport, type DailyCashReport, type DailyCashEntry } from '@/actions/analytics.actions'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'

function methodLabel(method: string): string {
  return paymentMethodLabel(method)
}

function methodIcon(method: string) {
  if (method === 'CASH') return <Banknote className="w-4 h-4 text-emerald-400" />
  if (method === 'TRANSFER') return <ArrowRightLeft className="w-4 h-4 text-sky-400" />
  if (method === 'MERCADOPAGO') return <CreditCard className="w-4 h-4 text-cyan-400" />
  return <CreditCard className="w-4 h-4 text-slate-400" />
}

function methodBadgeVariant(method: string): 'default' | 'info' | 'secondary' {
  if (method === 'CASH') return 'default'
  if (method === 'TRANSFER') return 'info'
  return 'secondary'
}

function formatTime(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

export default function CajaPage() {
  const tenantId = useTenantId()
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)
  const [report, setReport] = useState<DailyCashReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenantId) return
    let isMounted = true

    getDailyCashReport(tenantId, selectedDate).then((data) => {
      if (isMounted) {
        setReport(data)
        setLoading(false)
      }
    }).catch(() => {
      if (isMounted) {
        toast.error('Error al cargar el reporte de caja')
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [tenantId, selectedDate])

  // Sincronización continua en segundo plano cada 5s y al enfocar la ventana (sin recargar ni parpadear)
  useEffect(() => {
    if (!tenantId) return
    let isMounted = true

    const silentSync = () => {
      if (document.hidden) return
      getDailyCashReport(tenantId, selectedDate).then((data) => {
        if (isMounted && data) {
          setReport(data)
        }
      }).catch(() => {})
    }

    const intervalId = setInterval(silentSync, 5000)
    window.addEventListener('focus', silentSync)
    document.addEventListener('visibilitychange', silentSync)

    return () => {
      isMounted = false
      clearInterval(intervalId)
      window.removeEventListener('focus', silentSync)
      document.removeEventListener('visibilitychange', silentSync)
    }
  }, [tenantId, selectedDate])

  const entries: DailyCashEntry[] = report?.entries ?? []

  const handlePrint = () => {
    toast.success('Generando reporte de arqueo para impresion...')
    window.print()
  }

  const handleExportCSV = () => {
    if (!entries.length) {
      toast.error('No hay movimientos para exportar')
      return
    }
    const headers = ['ID', 'Cliente', 'Cancha', 'Tipo', 'Metodo', 'Monto_ARS', 'Hora', 'Notas']
    const rows = entries.map(e => [
      e.id,
      '"' + e.customer_name + '"',
      '"' + e.court_name + '"',
      e.payment_type === 'DEPOSIT' ? 'Seña' : 'Saldo',
      methodLabel(e.payment_method),
      e.amount_ars,
      formatTime(e.paid_at),
      '"' + cleanNoteForDisplay(e.notes) + '"',
    ])
    const csv = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'arqueo-caja-' + selectedDate + '.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('CSV descargado')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Caja Diaria &amp; Arqueo</h2>
            <p className="text-xs text-slate-400">
              Control de ingresos, cobros en mostrador, transferencias y pagos online de Mercado Pago.
            </p>
          </div>
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 gap-2 h-10 shrink-0">
            <CalendarIcon className="w-4 h-4 text-emerald-400 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <Button asChild variant="outline" size="sm" className="gap-1.5 border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-950/60 text-xs h-10">
            <Link href="/dashboard/cobros">
              <Landmark className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Configurar Cuentas de Cobro</span>
              <span className="sm:hidden">Cuentas</span>
            </Link>
          </Button>
          <Button onClick={handleExportCSV} variant="outline" size="sm" className="gap-2 border-slate-700 bg-slate-900 text-slate-200 hover:text-white text-xs h-10">
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar CSV</span>
          </Button>
          <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2 border-slate-700 bg-slate-900 text-slate-200 hover:text-white text-xs h-10">
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-emerald-500/30 bg-emerald-950/20 shadow-emerald-950/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold uppercase">
              <span>Total Recaudado</span>
              <TrendingUp className="w-4 h-4" />
            </div>
            <CardTitle className="text-2xl font-black text-white mt-1">
              {loading ? 'Cargando...' : formatARS(report?.totalGeneral ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-emerald-300/80">
            {loading ? 'Cargando...' : entries.length + ' transacciones registradas'}
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
              <span>Efectivo en Caja</span>
              <Banknote className="w-4 h-4 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl font-extrabold text-slate-100 mt-1">
              {loading ? 'Cargando...' : formatARS(report?.totalCash ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-400">Dinero físico en cajón de mostrador</CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
              <span>Transferencias</span>
              <ArrowRightLeft className="w-4 h-4 text-sky-400" />
            </div>
            <CardTitle className="text-2xl font-extrabold text-slate-100 mt-1">
              {loading ? 'Cargando...' : formatARS(report?.totalTransfer ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-400">Acreditado en cuenta bancaria del club</CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
              <span>Mercado Pago</span>
              <CreditCard className="w-4 h-4 text-cyan-400" />
            </div>
            <CardTitle className="text-2xl font-extrabold text-slate-100 mt-1">
              {loading ? 'Cargando...' : formatARS(report?.totalMP ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-400">Señas y pagos online de jugadores</CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-900/60 overflow-hidden">
        <CardHeader className="border-b border-slate-800/80 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Detalle de Cobros del Día</CardTitle>
            <Badge variant="outline" className="text-xs">Fecha: {selectedDate}</Badge>
          </div>
        </CardHeader>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando movimientos...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <Receipt className="w-10 h-10 opacity-30" />
            <p className="text-sm">No se registraron cobros el {selectedDate}</p>
            <p className="text-xs text-slate-600">Los pagos aparecen aquí cuando se confirma una seña o saldo de una reserva.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {entries.map(e => (
              <div key={e.id} className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    {methodIcon(e.payment_method)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-100 truncate">{e.customer_name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="truncate max-w-[100px] sm:max-w-none">{e.court_name}</span>
                      <span>•</span>
                      <span>{formatTime(e.paid_at)} hs</span>
                      {e.payment_type === 'BALANCE' && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400/80">Saldo restante</span>
                        </>
                      )}
                      {e.notes && cleanNoteForDisplay(e.notes) && (
                        <>
                          <span>•</span>
                          <span className="italic text-slate-400 hidden sm:inline">{cleanNoteForDisplay(e.notes)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="flex items-center gap-1.5 justify-end">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-base font-bold text-emerald-400">+{formatARS(e.amount_ars)}</span>
                  </div>
                  <Badge variant={methodBadgeVariant(e.payment_method)} className="text-[10px] mt-1">
                    {methodLabel(e.payment_method)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
