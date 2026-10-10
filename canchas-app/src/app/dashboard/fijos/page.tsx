'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Repeat, 
  Plus, 
  Calendar, 
  Clock, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  MessageCircle, 
  Loader2, 
  CalendarDays, 
  ShieldAlert,
  Pencil,
  Trash2
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
import { formatARS, buildWhatsAppLink } from '@/lib/utils'
import { 
  getRecurringSlots, 
  createRecurringSlot, 
  generateMonthlyBookingsForSlot, 
  checkAndReleaseOverdueRecurringSlots, 
  updateRecurringSlotStatus,
  updateRecurringSlot,
  deleteRecurringSlot
} from '@/actions/recurring-slots.actions'
import { downloadIcs } from '@/lib/calendar'
import { toast } from 'sonner'
import type { RecurringSlot } from '@/types/database'
import { useTenantId } from '@/hooks/use-tenant-id'
import { PlanFeatureGuard } from '@/components/dashboard/plan-feature-guard'
import { createClient } from '@/lib/supabase/client'


const DAYS_NAME = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
]



export default function TurnosFijosPage() {
  const tenantId = useTenantId()
  const [slots, setSlots] = useState<RecurringSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionSlotId, setActionSlotId] = useState<string | null>(null)
  const [dbCourts, setDbCourts] = useState<{ id: string; name: string; sport: string }[]>([])

  // Form states (Alta)
  const [courtId, setCourtId] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState(1) // Lunes
  const [startTime, setStartTime] = useState('20:00')
  const [endTime, setEndTime] = useState('21:30')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [monthlyPrice, setMonthlyPrice] = useState('56000')
  const [paymentDueDay, setPaymentDueDay] = useState(10)

  // Estados para Modal de Edición de Abono
  const [editingSlot, setEditingSlot] = useState<RecurringSlot | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editCourtId, setEditCourtId] = useState('')
  const [editDayOfWeek, setEditDayOfWeek] = useState(1)
  const [editStartTime, setEditStartTime] = useState('20:00')
  const [editEndTime, setEditEndTime] = useState('21:30')
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerPhone, setEditCustomerPhone] = useState('')
  const [editMonthlyPrice, setEditMonthlyPrice] = useState('')
  const [editPaymentDueDay, setEditPaymentDueDay] = useState(10)
  const [submittingEdit, setSubmittingEdit] = useState(false)

  // Estados para Modal de Eliminación de Abono
  const [deletingSlot, setDeletingSlot] = useState<RecurringSlot | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [cancelFutureBookings, setCancelFutureBookings] = useState(true)
  const [submittingDelete, setSubmittingDelete] = useState(false)

  const openEditModal = (slot: RecurringSlot) => {
    setEditingSlot(slot)
    setEditCourtId(slot.court_id)
    setEditDayOfWeek(slot.day_of_week)
    setEditStartTime(slot.start_time.slice(0, 5))
    setEditEndTime(slot.end_time.slice(0, 5))
    setEditCustomerName(slot.customer_name)
    setEditCustomerPhone(slot.customer_phone)
    setEditMonthlyPrice(String(slot.monthly_price))
    setEditPaymentDueDay(slot.payment_due_day)
    setIsEditModalOpen(true)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSlot) return
    if (!editCustomerName.trim() || !editCustomerPhone.trim()) {
      toast.error('Completá nombre y teléfono del abonado')
      return
    }
    const priceNum = Number(editMonthlyPrice)
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Ingresá un precio mensual válido')
      return
    }
    setSubmittingEdit(true)
    try {
      const res = await updateRecurringSlot(editingSlot.id, {
        court_id: editCourtId,
        day_of_week: Number(editDayOfWeek),
        start_time: editStartTime,
        end_time: editEndTime,
        customer_name: editCustomerName.trim(),
        customer_phone: editCustomerPhone.trim(),
        monthly_price: priceNum,
        payment_due_day: Number(editPaymentDueDay),
      })
      if (res.success) {
        toast.success('¡Abono mensual actualizado correctamente!')
        setIsEditModalOpen(false)
        setEditingSlot(null)
        await loadData()
      } else {
        toast.error(res.error || 'Error al actualizar abono')
      }
    } catch {
      toast.error('Error al actualizar abono')
    } finally {
      setSubmittingEdit(false)
    }
  }

  const openDeleteModal = (slot: RecurringSlot) => {
    setDeletingSlot(slot)
    setCancelFutureBookings(true)
    setIsDeleteModalOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingSlot) return
    setSubmittingDelete(true)
    try {
      const res = await deleteRecurringSlot(deletingSlot.id, {
        cancelFutureBookings,
      })
      if (res.success) {
        toast.success('Abonado fijo eliminado correctamente')
        setSlots((prev) => prev.filter((s) => s.id !== deletingSlot.id))
        setIsDeleteModalOpen(false)
        setDeletingSlot(null)
        await loadData()
      } else {
        toast.error(res.error || 'Error al eliminar abono')
      }
    } catch {
      toast.error('Error al eliminar abono fijo')
    } finally {
      setSubmittingDelete(false)
    }
  }

  const loadData = useCallback(async () => {
    if (!tenantId) return
    try {
      const data = await getRecurringSlots(tenantId)
      setSlots(data)
    } catch {
      toast.error('Error al actualizar turnos fijos')
    }
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) return
    let isMounted = true
    // Load courts from DB
    const supabase = createClient()
    supabase.from('courts').select('id, name, sport').eq('tenant_id', tenantId).then(({ data }) => {
      if (data && data.length > 0) {
        setDbCourts(data)
        setCourtId(data[0].id)
      }
    })
    // Load recurring slots
    getRecurringSlots(tenantId)
      .then((data) => {
        if (isMounted) {
          setSlots(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          toast.error('Error al cargar turnos fijos')
          setLoading(false)
        }
      })

    // Auto-sincronización periódica cada 60s y al enfocar la ventana
    const syncFijos = () => {
      if (document.hidden) return
      getRecurringSlots(tenantId).then((data) => {
        if (isMounted && data) {
          setSlots(data)
        }
      }).catch(() => {})
    }

    const intervalId = setInterval(syncFijos, 60000)
    window.addEventListener('focus', syncFijos)
    document.addEventListener('visibilitychange', syncFijos)

    return () => {
      isMounted = false
      clearInterval(intervalId)
      window.removeEventListener('focus', syncFijos)
      document.removeEventListener('visibilitychange', syncFijos)
    }
  }, [tenantId])

  const handleToggleStatus = async (slotId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, status: nextStatus as 'ACTIVE' | 'PAUSED' } : s))
    try {
      const res = await updateRecurringSlotStatus(slotId, nextStatus as 'ACTIVE' | 'PAUSED')
      if (res.success) {
        toast.success(nextStatus === 'ACTIVE' ? 'Abonado reactivado' : 'Abonado pausado')
      } else {
        toast.error(res.error || 'Error al cambiar estado')
      }
    } catch {
      toast.error('Error inesperado')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName || !customerPhone) {
      toast.error('Completá nombre y teléfono del abonado')
      return
    }

    setSubmitting(true)
    try {
      const res = await createRecurringSlot({
        tenant_id: tenantId!,
        court_id: courtId,
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        customer_name: customerName,
        customer_phone: customerPhone,
        monthly_price: Number(monthlyPrice),
        payment_due_day: Number(paymentDueDay),
      })

      if (res.success && res.slot) {
        toast.success('¡Abonado recurrente registrado y turnos del mes generados!')
        setSlots((prev) => [res.slot!, ...prev.filter((s) => s.id !== res.slot!.id)])
        setIsModalOpen(false)
        setCustomerName('')
        setCustomerPhone('')
        await loadData()
      } else {
        toast.error(res.error || 'Error al registrar turno fijo')
      }
    } catch {
      toast.error('Error al crear turno fijo')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateMonthBookings = async (slotId: string) => {
    setActionSlotId(slotId)
    try {
      const res = await generateMonthlyBookingsForSlot(slotId)
      if (res.success) {
        if (res.generatedCount > 0) {
          toast.success(res.message || `¡Se generaron ${res.generatedCount} reservas para este mes!`)
        } else {
          toast.info(res.message || 'Los turnos para este mes ya estaban generados en la grilla.')
        }
      } else {
        toast.error(res.error || 'Error al generar reservas')
      }
    } catch {
      toast.error('Error al generar turnos')
    } finally {
      setActionSlotId(null)
    }
  }

  const handleCheckOverdueAndRelease = async () => {
    setSubmitting(true)
    try {
      const res = await checkAndReleaseOverdueRecurringSlots(tenantId!)
      if (res.success) {
        if (res.releasedCount && res.releasedCount > 0) {
          toast.warning(`Se liberaron ${res.releasedCount} turnos fijos impagos a la grilla pública.`)
        } else {
          toast.success('Todos los abonados están al día o dentro del período de gracia.')
        }
      }
    } catch {
      toast.error('Error al auditar vencimientos')
    } finally {
      setSubmitting(false)
    }
  }

  const activeSlots = slots.filter(s => s.status === 'ACTIVE')
  const totalMonthlyRevenue = activeSlots.reduce((sum, s) => sum + Number(s.monthly_price), 0)

  return (
    <PlanFeatureGuard feature="turnos_fijos" featureTitle="Turnos Fijos y Abonados">
      <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs tracking-wider uppercase mb-1">
            <Repeat className="w-4 h-4" />
            Abonados Recurrentes del Club
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Gestión de Turnos Fijos (Abonados)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Generación mensual anticipada de reservas, corte de pago y liberación automática de turnos impagos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleCheckOverdueAndRelease}
            disabled={submitting}
            className="flex-1 sm:flex-none border-slate-800 bg-slate-900 text-slate-300 hover:text-amber-400 text-xs gap-1.5 min-h-10 rounded-xl"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Auditar Vencimientos</span>
          </Button>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-500 text-white font-bold gap-2 shadow-lg shadow-purple-950/40 rounded-xl text-xs min-h-10"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Abonado Fijo</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
          <div className="text-slate-400 text-xs font-medium">Abonados Activos</div>
          <div className="text-2xl font-extrabold text-white mt-1 flex items-baseline gap-2">
            <span>{activeSlots.length}</span>
            <span className="text-xs text-purple-400 font-medium">turnos semanales fijos</span>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
          <div className="text-slate-400 text-xs font-medium">Ingresos Asegurados Mensuales</div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {formatARS(totalMonthlyRevenue)}
            <span className="text-xs text-slate-400 font-normal ml-1.5">/mes</span>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
          <div className="text-slate-400 text-xs font-medium">Corte Automático por Falta de Pago</div>
          <div className="text-xs text-slate-300 mt-1.5 leading-relaxed">
            Si el abonado no registra su pago antes del día límite configurado, el turno se libera a la grilla pública.
          </div>
        </Card>
      </div>

      {/* Listado de Turnos Fijos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400 text-sm">
            No hay turnos fijos registrados. Hacé click en &quot;Nuevo Abonado Fijo&quot; para dar de alta turnos recurrentes.
          </div>
        ) : (
          slots.map((slot) => {
            const courtName = slot.court?.name || dbCourts.find(c => c.id === slot.court_id)?.name || 'Cancha'
            const isPaused = slot.status !== 'ACTIVE'
            const waMsg = `Hola ${slot.customer_name}, te escribimos desde el club sobre tu abono semanal de los ${DAYS_NAME[slot.day_of_week]} a las ${slot.start_time} hs en ${courtName}. Recordá que el día de corte de pago mensual es el ${slot.payment_due_day}.`
            const waLink = buildWhatsAppLink(slot.customer_phone, waMsg)

            return (
              <Card 
                key={slot.id} 
                className={`border-slate-800 bg-slate-900/70 rounded-2xl overflow-hidden transition-all ${
                  isPaused ? 'opacity-60 grayscale' : 'hover:border-purple-500/40 shadow-lg'
                }`}
              >
                <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-950/40">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs font-bold">
                      {slot.day_of_week === 0 ? 'Domingos' : slot.day_of_week === 6 ? 'Sábados' : DAYS_NAME[slot.day_of_week]}
                    </Badge>
                    <button
                      onClick={() => handleToggleStatus(slot.id, slot.status)}
                      className="text-xs font-semibold focus:outline-none"
                    >
                      {slot.status === 'ACTIVE' ? (
                        <Badge variant="default" className="gap-1 cursor-pointer bg-emerald-600 hover:bg-emerald-500">
                          <CheckCircle2 className="w-3 h-3 text-white" />
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 cursor-pointer">
                          <XCircle className="w-3 h-3" />
                          Pausado
                        </Badge>
                      )}
                    </button>
                  </div>
                  <CardTitle className="text-base text-white mt-2 flex items-center justify-between">
                    <span>{slot.customer_name}</span>
                    <button
                      type="button"
                      onClick={() => openEditModal(slot)}
                      className="text-emerald-400 hover:text-emerald-300 font-extrabold text-sm flex items-center gap-1.5 transition-colors group cursor-pointer"
                      title="Hacé click para modificar el precio del abono mensual"
                    >
                      <span>{formatARS(slot.monthly_price)}/mes</span>
                      <Pencil className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-300 transition-colors" />
                    </button>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{slot.start_time.slice(0, 5)} a {slot.end_time.slice(0, 5)} hs • {courtName}</span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-3 pb-3 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-500" /> Teléfono:
                    </span>
                    <span className="font-mono text-slate-200">{slot.customer_phone}</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Vencimiento mensual:</span>
                    <Badge variant="outline" className="border-amber-500/30 text-amber-300 font-bold">
                      Día {slot.payment_due_day} de cada mes
                    </Badge>
                  </div>

                  {/* Acciones del turno: Generar mes, Calendar y WhatsApp */}
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGenerateMonthBookings(slot.id)}
                      disabled={actionSlotId === slot.id}
                      className="h-8 text-[11px] border-slate-700 bg-slate-900 text-slate-300 hover:text-purple-300 flex-1"
                    >
                      <CalendarDays className="w-3.5 h-3.5 mr-1 text-purple-400" />
                      {actionSlotId === slot.id ? 'Generando...' : 'Generar Mes'}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const d = new Date()
                        const diff = (slot.day_of_week - d.getDay() + 7) % 7
                        d.setDate(d.getDate() + diff)
                        const nextDate = d.toISOString().split('T')[0]
                        const rruleDays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

                        downloadIcs({
                          title: `Abono: ${slot.customer_name} - ${courtName}`,
                          description: `Turno semanal fijo.\nCliente: ${slot.customer_name}\nHorario: ${slot.start_time.slice(0, 5)} a ${slot.end_time.slice(0, 5)} hs`,
                          location: courtName,
                          date: nextDate,
                          startTime: slot.start_time.slice(0, 5),
                          endTime: slot.end_time.slice(0, 5),
                          rrule: `FREQ=WEEKLY;BYDAY=${rruleDays[slot.day_of_week]}`,
                        }, `abono-${slot.customer_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`)
                        toast.success('Archivo .ics de abono recurrente descargado')
                      }}
                      className="h-8 px-2 text-[11px] border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                      title="Exportar calendario recurrente (.ics)"
                    >
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    </Button>

                    <a
                      href={waLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1 h-8 px-3 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 text-[11px] font-semibold transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>

                  {/* Botones de Gestión: Editar y Borrar */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditModal(slot)}
                      className="h-8 text-[11px] border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/50 hover:text-sky-200 flex-1 gap-1.5 font-medium transition-colors"
                      title="Editar todos los datos del abono fijo"
                    >
                      <Pencil className="w-3.5 h-3.5 text-sky-400" />
                      <span>Editar Abono</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDeleteModal(slot)}
                      className="h-8 px-3 text-[11px] border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/50 hover:text-rose-200 gap-1.5 font-medium transition-colors"
                      title="Eliminar abono fijo"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Borrar</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Modal Alta Turno Fijo */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100 max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Repeat className="w-5 h-5 text-purple-400" />
              Alta de Abonado Semanal Fijo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Registrá el abonado y se generarán automáticamente las reservas del mes bloqueando la grilla.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Cancha</Label>
                <select
                  value={courtId}
                  onChange={(e) => setCourtId(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200"
                >
                  {dbCourts.length > 0 ? dbCourts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.sport})
                    </option>
                  )) : (
                    <option value="" disabled>No hay canchas registradas</option>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Día de la Semana</Label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200"
                >
                  <option value={1}>Lunes</option>
                  <option value={2}>Martes</option>
                  <option value={3}>Miércoles</option>
                  <option value={4}>Jueves</option>
                  <option value={5}>Viernes</option>
                  <option value={6}>Sábado</option>
                  <option value={0}>Domingo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Hora Inicio</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Hora Fin</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Nombre del Abonado</Label>
                <Input
                  placeholder="Ej. Juan Pérez"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">WhatsApp / Teléfono</Label>
                <Input
                  placeholder="+54 9 381 ..."
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Precio Mensual ($ARS)</Label>
                <Input
                  type="number"
                  value={monthlyPrice}
                  onChange={(e) => setMonthlyPrice(e.target.value)}
                  required
                  placeholder="Ej: 56000"
                  className="bg-slate-900 border-slate-800 text-xs font-mono font-bold text-white focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Día Límite de Pago (1-31)</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={paymentDueDay}
                  onChange={(e) => setPaymentDueDay(Number(e.target.value))}
                  required
                  className="bg-slate-900 border-slate-800 text-xs font-mono text-white"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="border-slate-800 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold"
              >
                {submitting ? 'Guardando...' : 'Crear Abonado Fijo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Abonado Fijo Completo */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100 max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Pencil className="w-5 h-5 text-sky-400" />
              Editar Abonado Semanal Fijo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Modificá la cancha, día, horario, precio mensual o datos del titular del abono.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdate} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Cancha</Label>
                <select
                  value={editCourtId}
                  onChange={(e) => setEditCourtId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-md p-2.5 focus:border-sky-500 focus:outline-none"
                >
                  {dbCourts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.sport})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Día de la Semana</Label>
                <select
                  value={editDayOfWeek}
                  onChange={(e) => setEditDayOfWeek(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-md p-2.5 focus:border-sky-500 focus:outline-none"
                >
                  <option value={1}>Lunes</option>
                  <option value={2}>Martes</option>
                  <option value={3}>Miércoles</option>
                  <option value={4}>Jueves</option>
                  <option value={5}>Viernes</option>
                  <option value={6}>Sábado</option>
                  <option value={0}>Domingo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Hora Inicio</Label>
                <Input
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs text-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Hora Fin</Label>
                <Input
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-300">Nombre del Abonado</Label>
              <Input
                value={editCustomerName}
                onChange={(e) => setEditCustomerName(e.target.value)}
                required
                className="bg-slate-900 border-slate-800 text-xs text-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-300">WhatsApp / Teléfono</Label>
              <Input
                value={editCustomerPhone}
                onChange={(e) => setEditCustomerPhone(e.target.value)}
                required
                className="bg-slate-900 border-slate-800 text-xs text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-emerald-400">Precio Mensual ($ARS)</Label>
                <Input
                  type="number"
                  value={editMonthlyPrice}
                  onChange={(e) => setEditMonthlyPrice(e.target.value)}
                  required
                  className="bg-slate-900 border-emerald-500/40 text-xs font-mono font-bold text-emerald-300 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Día Límite de Pago (1-31)</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={editPaymentDueDay}
                  onChange={(e) => setEditPaymentDueDay(Number(e.target.value))}
                  required
                  className="bg-slate-900 border-slate-800 text-xs font-mono text-white"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                className="border-slate-800 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submittingEdit}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold"
              >
                {submittingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminación de Abono Fijo */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100 w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <Trash2 className="w-5 h-5 text-rose-500" />
              Eliminar Abonado Semanal Fijo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              ¿Estás seguro de que deseás eliminar este abono recurrente? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          {deletingSlot && (
            <div className="space-y-4 py-2">
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-white text-sm">
                  <span>{deletingSlot.customer_name}</span>
                  <span className="text-emerald-400">{formatARS(deletingSlot.monthly_price)}/mes</span>
                </div>
                <div className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {DAYS_NAME[deletingSlot.day_of_week]} • {deletingSlot.start_time.slice(0, 5)} a {deletingSlot.end_time.slice(0, 5)} hs
                  </span>
                </div>
                <div className="text-slate-400">
                  Teléfono: <span className="text-slate-200 font-mono">{deletingSlot.customer_phone}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                <input
                  type="checkbox"
                  id="cancelFuture"
                  checked={cancelFutureBookings}
                  onChange={(e) => setCancelFutureBookings(e.target.checked)}
                  className="mt-0.5 rounded border-rose-500/40 text-rose-600 focus:ring-rose-500 cursor-pointer h-4 w-4 bg-slate-900"
                />
                <label htmlFor="cancelFuture" className="cursor-pointer select-none">
                  <span className="font-semibold block text-rose-200">Cancelar reservas futuras en la grilla</span>
                  <span className="text-slate-400 text-[11px] block mt-0.5">
                    Libera automáticamente los turnos agendados de este mes para que queden disponibles al público.
                  </span>
                </label>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={submittingDelete}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleDelete}
                  disabled={submittingDelete}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold gap-1.5"
                >
                  {submittingDelete ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Eliminar Abono</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </PlanFeatureGuard>
  )
}
