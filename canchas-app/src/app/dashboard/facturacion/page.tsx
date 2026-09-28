'use client'

import { useState, useEffect } from 'react'
import { 
  Receipt, 
  Plus, 
  CheckCircle2, 
  QrCode, 
  Printer, 
  ShieldCheck, 
  ExternalLink, 
  Settings2,
  FileText,
  Loader2,
  DollarSign,
  Building2,
  AlertTriangle,
  Pencil
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatARS } from '@/lib/utils'
import { 
  getAfipConfig, 
  saveAfipConfig, 
  getIssuedInvoices, 
  emitInvoiceAction,
  type IssuedInvoice 
} from '@/actions/afip.actions'
import { toast } from 'sonner'
import type { AfipConfig, TipoComprobante } from '@/lib/afip'
import { useTenantId } from '@/hooks/use-tenant-id'
import { PlanFeatureGuard } from '@/components/dashboard/plan-feature-guard'

export default function FacturacionPage() {
  const tenantId = useTenantId()
  const [invoices, setInvoices] = useState<IssuedInvoice[]>([])
  const [config, setConfig] = useState<AfipConfig>({
    cuit: '',
    puntoVenta: 1,
    razonSocial: '',
    condicionIva: 'MONOTRIBUTO',
    domicilioComercial: '',
    inicioActividades: new Date().toISOString().split('T')[0],
    ingresosBrutos: '',
    environment: 'TESTING'
  })
  const [loading, setLoading] = useState(true)

  // Modales
  const [isEmitOpen, setIsEmitOpen] = useState(false)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<IssuedInvoice | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form Emitir
  const [tipoCmp, setTipoCmp] = useState<TipoComprobante>(11) // Factura C
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteDoc, setClienteDoc] = useState('')
  const [conceptoDesc, setConceptoDesc] = useState('Alquiler de Cancha (Turno 90 min)')
  const [montoTotal, setMontoTotal] = useState('14000')

  useEffect(() => {
    if (!tenantId) return
    let isMounted = true
    Promise.all([
      getIssuedInvoices(),
      getAfipConfig(tenantId)
    ])
      .then(([invs, cfg]) => {
        if (isMounted) {
          setInvoices(invs)
          if (cfg) setConfig(cfg)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [tenantId])

  const handleEmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config.cuit || !config.cuit.trim()) {
      toast.error('Antes de emitir facturas, debés configurar tu CUIT emisor')
      setIsEmitOpen(false)
      setIsConfigOpen(true)
      return
    }

    if (!clienteNombre.trim() || Number(montoTotal) <= 0) {
      toast.error('Completá los datos del comprobante')
      return
    }

    setSubmitting(true)
    try {
      const res = await emitInvoiceAction({
        tipoComprobante: tipoCmp,
        tipoDocRec: clienteDoc.length > 8 ? 80 : clienteDoc.length > 6 ? 96 : 99,
        nroDocRec: clienteDoc,
        nombreCliente: clienteNombre,
        items: [
          {
            description: conceptoDesc,
            quantity: 1,
            unitPrice: Number(montoTotal),
            total: Number(montoTotal)
          }
        ]
      })

      if (res.success && res.cae) {
        toast.success(`¡Comprobante autorizado por AFIP! CAE: ${res.cae}`)
        setIsEmitOpen(false)
        setClienteNombre('')
        setClienteDoc('')
        const updated = await getIssuedInvoices()
        setInvoices(updated)
      } else {
        toast.error(res.error || 'Error al autorizar con AFIP')
      }
    } catch {
      toast.error('Error de conexión con servicio AFIP')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      toast.error('No se pudo identificar el club')
      return
    }
    if (!config.cuit?.trim()) {
      toast.error('Por favor ingresá un CUIT emisor válido')
      return
    }
    setSubmitting(true)
    try {
      const res = await saveAfipConfig(tenantId, config)
      if (res.success) {
        toast.success('Configuración fiscal y CUIT de AFIP guardados con éxito')
        setIsConfigOpen(false)
      } else {
        toast.error(res.error || 'Error al guardar configuración')
      }
    } catch {
      toast.error('Error de red al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  const totalFacturadoMes = invoices.reduce((acc, inv) => acc + inv.montoTotal, 0)

  return (
    <PlanFeatureGuard feature="facturacion_afip" featureTitle="Facturación Electrónica AFIP">
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Receipt className="w-6 h-6 text-emerald-400" />
              Facturación Electrónica AFIP (WSFEv1)
            </h1>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 font-semibold text-xs">
              CAE Oficial RG 4291
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Emití Factura B, Factura C y tickets a consumidor final con CAE automático y código QR reglamentario.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => setIsConfigOpen(true)}
            className="border-slate-700 bg-slate-900/80 text-slate-200 hover:text-white text-xs gap-1.5 min-h-10 hover:border-slate-600"
          >
            <Settings2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Configurar Facturación &amp; CUIT</span>
          </Button>

          <Button
            onClick={() => {
              if (!config.cuit) {
                toast.error('Primero debés configurar el CUIT de tu club para emitir comprobantes')
                setIsConfigOpen(true)
              } else {
                setIsEmitOpen(true)
              }
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-lg shadow-emerald-950/40 min-h-10"
          >
            <Plus className="w-4 h-4" />
            <span>Emitir Comprobante</span>
          </Button>
        </div>
      </div>

      {/* Alerta de CUIT pendiente si no está configurado */}
      {!config.cuit && !loading && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-200">Facturación AFIP pendiente de configuración</h3>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Aún no registraste el CUIT ni los datos fiscales de tu club. Hacé clic para configurarlos y habilitar la emisión de facturas electrónicas oficiales con CAE.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setIsConfigOpen(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 shrink-0 shadow-md"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Configurar CUIT Ahora</span>
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/70 border-slate-800 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Facturación del Mes</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {formatARS(totalFacturadoMes)}
          </div>
          <p className="text-[11px] text-slate-400">
            {invoices.length} comprobantes autorizados
          </p>
        </Card>

        <Card className="bg-slate-900/70 border-slate-800 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Estado de Conexión AFIP</span>
            <ShieldCheck className={`w-4 h-4 ${config.cuit ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          {config.cuit ? (
            <div className="text-lg font-black text-emerald-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Servicio Online</span>
            </div>
          ) : (
            <div className="text-lg font-black text-amber-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Requiere CUIT</span>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            {config.cuit ? 'Homologación WSFEv1 Activo' : 'Configuración fiscal pendiente'}
          </p>
        </Card>

        <Card 
          onClick={() => setIsConfigOpen(true)}
          className="bg-slate-900/70 border-slate-800 p-4 space-y-1 cursor-pointer hover:border-slate-700 transition-colors group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span className="group-hover:text-purple-300 transition-colors">Punto de Venta</span>
            <Building2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono flex items-center justify-between">
            <span>
              {config.cuit
                ? `Pto. ${(config.puntoVenta || 1).toString().padStart(4, '0')}`
                : 'Sin asignar'}
            </span>
            <Pencil className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300 transition-colors" />
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {config.razonSocial ? config.razonSocial : (config.cuit ? 'Punto de venta fiscal' : 'Hacé clic para configurar')}
          </p>
        </Card>

        <Card 
          onClick={() => setIsConfigOpen(true)}
          className="bg-slate-900/70 border-slate-800 p-4 space-y-1 cursor-pointer hover:border-slate-700 transition-colors group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span className="group-hover:text-blue-300 transition-colors">CUIT Registrado</span>
            <div className="flex items-center gap-1.5">
              <Pencil className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition-colors" />
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          {config.cuit ? (
            <>
              <div className="text-xl font-black text-slate-200 font-mono tracking-tight">
                {config.cuit}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{config.condicionIva === 'MONOTRIBUTO' ? 'Monotributista' : 'Resp. Inscripto'}</span>
                <span className="text-xs text-blue-400 font-medium group-hover:underline">Editar</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-base font-bold text-amber-400">
                Sin configurar
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="text-amber-300/80">Pendiente de registro</span>
                <span className="text-xs text-amber-400 font-bold group-hover:underline">Configurar &rarr;</span>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Listado de Comprobantes Emitidos */}
      <Card className="bg-slate-900/70 border-slate-800">
        <CardHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              Comprobantes Emitidos con CAE
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Historial de facturas autorizadas para auditoría y comprobantes fiscales de clientes.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
              <span className="text-xs">Cargando libro de IVA / comprobantes...</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Aún no se emitieron facturas electrónicas. Hacé click en &quot;Emitir Comprobante&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px] bg-slate-950/50">
                    <th className="p-3.5">Comprobante</th>
                    <th className="p-3.5">Fecha</th>
                    <th className="p-3.5">Cliente / DNI</th>
                    <th className="p-3.5">Concepto</th>
                    <th className="p-3.5 text-right">Monto Total</th>
                    <th className="p-3.5">CAE / Vencimiento</th>
                    <th className="p-3.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-bold text-white">
                        <Badge variant="outline" className="mr-2 text-[10px] border-emerald-500/30 text-emerald-300">
                          {inv.comprobanteTipo}
                        </Badge>
                        <span className="font-mono">{inv.numeroCompleto}</span>
                      </td>
                      <td className="p-3.5 text-slate-300">{inv.fechaEmision}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-100">{inv.cliente}</div>
                        <div className="text-[11px] text-slate-500">{inv.cuitDni}</div>
                      </td>
                      <td className="p-3.5 text-slate-300 max-w-50 truncate">{inv.concepto}</td>
                      <td className="p-3.5 text-right font-black text-emerald-400 font-mono text-sm">
                        {formatARS(inv.montoTotal)}
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono font-bold text-slate-200 text-[11px]">{inv.cae}</div>
                        <div className="text-[10px] text-slate-500">Vto: {inv.caeVto}</div>
                      </td>
                      <td className="p-3.5 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedInvoice(inv)}
                          className="h-7 px-2 text-[11px] text-slate-300 hover:text-white hover:bg-slate-800 gap-1"
                        >
                          <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Ver / Imprimir</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Emitir Comprobante */}
      <Dialog open={isEmitOpen} onOpenChange={setIsEmitOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-400" />
              Emitir Comprobante AFIP
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Generá una factura oficial electrónica con CAE para un cliente del club.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEmitInvoice} className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-300 font-bold">Tipo de Factura</Label>
                <select
                  value={tipoCmp}
                  onChange={(e) => setTipoCmp(Number(e.target.value) as TipoComprobante)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                >
                  <option value={11}>Factura C (Monotributo)</option>
                  <option value={6}>Factura B (Resp. Inscripto)</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-300 font-bold">Monto Total (ARS)</Label>
                <Input
                  type="number"
                  value={montoTotal}
                  onChange={(e) => setMontoTotal(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-300 font-bold">Nombre o Razón Social del Cliente *</Label>
              <Input
                placeholder="Ej. Rodrigo Morales"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                required
                className="bg-slate-900 border-slate-800 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-300">DNI o CUIT (Dejar vacío para Consumidor Final)</Label>
              <Input
                placeholder="Ej. 38123456"
                value={clienteDoc}
                onChange={(e) => setClienteDoc(e.target.value)}
                className="bg-slate-900 border-slate-800 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-300 font-bold">Descripción del Concepto</Label>
              <Input
                value={conceptoDesc}
                onChange={(e) => setConceptoDesc(e.target.value)}
                required
                className="bg-slate-900 border-slate-800 text-xs"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Autorización directa con AFIP
              </span>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                CAE 14 dígitos
              </Badge>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsEmitOpen(false)} className="text-xs">
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Autorizar Factura</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Ver / Imprimir Comprobante Oficial AFIP */}
      {selectedInvoice && (
        <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
          <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-white text-slate-900 p-4 sm:p-6 border-slate-200">
            <DialogHeader className="border-b border-slate-200 pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase">ORIGINAL</div>
                  <h3 className="text-xl font-black tracking-tight text-slate-900">{selectedInvoice.comprobanteTipo}</h3>
                  <p className="font-mono font-bold text-sm text-slate-700">N° {selectedInvoice.numeroCompleto}</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Fecha: <strong>{selectedInvoice.fechaEmision}</strong></div>
                  <div>CUIT: <strong>{config?.cuit}</strong></div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Emisor:</span>
                  <strong className="text-slate-800">{config?.razonSocial}</strong>
                  <div className="text-[10px] text-slate-500">{config?.domicilioComercial}</div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Receptor:</span>
                  <strong className="text-slate-800">{selectedInvoice.cliente}</strong>
                  <div className="text-[10px] text-slate-500">{selectedInvoice.cuitDni}</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="p-2 text-left">Detalle</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2 text-slate-800">{selectedInvoice.concepto}</td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        {formatARS(selectedInvoice.montoTotal)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50 font-black">
                    <tr>
                      <td className="p-2 text-right">Total:</td>
                      <td className="p-2 text-right font-mono text-emerald-700">
                        {formatARS(selectedInvoice.montoTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pie con CAE y QR Reglamentario */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-600">
                    CAE N°: <strong className="font-mono text-slate-900">{selectedInvoice.cae}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Fecha de Vto. CAE: <strong>{selectedInvoice.caeVto}</strong>
                  </div>
                  <div className="text-[9px] text-slate-400">
                    Comprobante autorizado por AFIP bajo régimen RG 4291
                  </div>
                </div>

                <div className="w-16 h-16 bg-slate-200 rounded border border-slate-300 flex flex-col items-center justify-center text-center p-1">
                  <QrCode className="w-8 h-8 text-slate-800" />
                  <span className="text-[8px] font-bold text-slate-600 mt-0.5">AFIP QR</span>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-200 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(selectedInvoice.qrUrl, '_blank')}
                className="text-xs gap-1 border-slate-300 text-slate-700"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Validar en AFIP</span>
              </Button>
              <Button
                size="sm"
                onClick={() => window.print()}
                className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold gap-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Comprobante</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal Configuración AFIP */}
      {config && (
        <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-slate-950 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-purple-400" />
                Configuración de Facturación AFIP
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Configurá el CUIT y los datos fiscales oficiales del club para emitir comprobantes electrónicos con CAE.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveConfig} className="space-y-4 py-2">
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Estos datos se registrarán para la generación de comprobantes con validez fiscal nacional según la RG 4291 de AFIP.
                </span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-bold">Razón Social o Nombre del Titular</Label>
                <Input
                  value={config.razonSocial}
                  onChange={(e) => setConfig({ ...config, razonSocial: e.target.value })}
                  placeholder="Ej: Club Deportivo Palermo S.R.L. o Juan Pérez"
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-bold">CUIT Emisor</Label>
                  <Input
                    value={config.cuit}
                    onChange={(e) => setConfig({ ...config, cuit: e.target.value })}
                    placeholder="Ej: 20-30123456-7"
                    required
                    className="bg-slate-900 border-slate-800 text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-500">
                    CUIT fiscal del titular (11 dígitos).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-bold">Punto de Venta</Label>
                  <Input
                    type="number"
                    min="1"
                    max="9999"
                    value={config.puntoVenta || 1}
                    onChange={(e) => setConfig({ ...config, puntoVenta: Number(e.target.value) })}
                    required
                    className="bg-slate-900 border-slate-800 text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-500">
                    Pto. habilitado en AFIP para WSFEv1.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-bold">Condición frente al IVA</Label>
                <select
                  value={config.condicionIva}
                  onChange={(e) => setConfig({ ...config, condicionIva: e.target.value as 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO' })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="MONOTRIBUTO">Monotributo (Emite Factura C)</option>
                  <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto (Emite Factura B y A)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-bold">Domicilio Comercial</Label>
                <Input
                  value={config.domicilioComercial}
                  onChange={(e) => setConfig({ ...config, domicilioComercial: e.target.value })}
                  placeholder="Ej: Av. Santa Fe 1234, CABA"
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-bold">Ingresos Brutos (IIBB)</Label>
                  <Input
                    value={config.ingresosBrutos || ''}
                    onChange={(e) => setConfig({ ...config, ingresosBrutos: e.target.value })}
                    placeholder="Ej: Mismo CUIT o Exento"
                    className="bg-slate-900 border-slate-800 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 font-bold">Inicio de Actividades</Label>
                  <Input
                    type="date"
                    value={config.inicioActividades || ''}
                    onChange={(e) => setConfig({ ...config, inicioActividades: e.target.value })}
                    className="bg-slate-900 border-slate-800 text-xs text-slate-300"
                  />
                </div>
              </div>

              <DialogFooter className="pt-3 gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsConfigOpen(false)} className="text-xs">
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs">
                  {submitting ? 'Guardando...' : 'Guardar Configuración'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      </div>
    </PlanFeatureGuard>
  )
}
