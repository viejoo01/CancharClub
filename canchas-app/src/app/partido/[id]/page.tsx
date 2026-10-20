'use client'

import { useState, useEffect, use, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Users,
  CheckCircle2,
  Clock,
  Calendar,
  Copy,
  Check,
  CreditCard,
  Building2,
  MessageCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
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
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'
import { formatARS, buildWhatsAppLink } from '@/lib/utils'
import {
  getMatchSplitDetails,
  recordPlayerSplitPayment,
  type MatchSplitDetails,
} from '@/actions/booking.actions'
import { toast } from 'sonner'

export default function MatchSplitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [matchData, setMatchData] = useState<MatchSplitDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedAlias, setCopiedAlias] = useState(false)

  // Selector de número de jugadores (default según deporte)
  const [playersCount, setPlayersCount] = useState<number>(4)

  // Modal para abonar cuota de amigo
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [payerName, setPayerName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('canchar_player_name') || ''
    }
    return ''
  })
  const [payerPhone, setPayerPhone] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('canchar_player_phone') || ''
    }
    return ''
  })
  const [paymentMethod, setPaymentMethod] = useState<'TRANSFER' | 'MERCADOPAGO'>('TRANSFER')
  const [transferRef, setTransferRef] = useState('')

  const fetchMatch = useCallback(async (showToast = false) => {
    if (!id) return
    setRefreshing(true)
    try {
      const res = await getMatchSplitDetails(id)
      if (res.success && res.data) {
        setMatchData(res.data)
        if (res.data.recommendedShares) {
          setPlayersCount(res.data.recommendedShares)
        }
        if (showToast) toast.success('Estado del partido actualizado')
      } else {
        toast.error(res.error || 'No se pudo cargar la información del partido')
      }
    } catch {
      toast.error('Error al consultar el partido')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchMatch(false)
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchMatch])

  // Cálculo de cuota por jugador
  const totalAmount = matchData?.totalAmount || 0
  const quotaPerPlayer = useMemo(() => {
    if (playersCount <= 0 || totalAmount <= 0) return 0
    return Math.round(totalAmount / playersCount)
  }, [totalAmount, playersCount])

  // Total recaudado y porcentaje de progreso
  const totalCollected = matchData?.totalCollected || 0
  const percentCollected = totalAmount > 0 ? Math.min(100, Math.round((totalCollected / totalAmount) * 100)) : 0
  const balanceRemaining = Math.max(0, totalAmount - totalCollected)

  const handleShareWhatsApp = () => {
    if (!matchData) return
    const currentUrl = typeof window !== 'undefined' ? window.location.href : `https://www.cancharclub.com.ar/partido/${id}`
    const msg =
      `¡Hola! Ya reservamos la cancha en *${matchData.clubName}* (*${matchData.courtName}*) para el *${matchData.dateFormatted}* a las *${matchData.time} hs*.\n\n` +
      `Somos ${playersCount} jugadores y nos toca *$${quotaPerPlayer.toLocaleString('es-AR')}* a cada uno.\n\n` +
      `Entrá al link para pagar tu parte o ver los datos de transferencia:\n${currentUrl}\n\n` +
      `_Organizado con CancharClub_`

    window.open(buildWhatsAppLink(null, msg), '_blank')
  }

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
      setCopiedLink(true)
      toast.success('¡Enlace del partido copiado!')
      setTimeout(() => setCopiedLink(false), 2500)
    }
  }

  const handleCopyAlias = () => {
    if (!matchData?.bankAlias) return
    navigator.clipboard.writeText(matchData.bankAlias)
    setCopiedAlias(true)
    toast.success(`Alias copiado: ${matchData.bankAlias}`)
    setTimeout(() => setCopiedAlias(false), 2500)
  }

  const handleConfirmMyShare = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payerName.trim()) {
      toast.error('Ingresá tu nombre y apellido')
      return
    }

    setSubmittingPayment(true)
    try {
      const res = await recordPlayerSplitPayment({
        bookingId: id,
        playerName: payerName.trim(),
        playerPhone: payerPhone.trim() || undefined,
        amountArs: quotaPerPlayer,
        paymentMethod,
        referenceNumber: transferRef.trim() || undefined,
      })

      if (res.success) {
        toast.success(res.message || '¡Tu parte fue registrada con éxito!')
        setIsPayModalOpen(false)
        setTransferRef('')

        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('canchar_player_name', payerName.trim())
            if (payerPhone.trim()) localStorage.setItem('canchar_player_phone', payerPhone.trim())
          }
        } catch {}

        await fetchMatch(false)
      } else {
        toast.error(res.error || 'Error al registrar tu pago')
      }
    } catch {
      toast.error('Ocurrió un error al procesar el pago')
    } finally {
      setSubmittingPayment(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-mono">Cargando detalles del partido...</p>
      </div>
    )
  }

  if (!matchData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
        <h2 className="text-xl font-bold text-white">Partido no encontrado</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          No pudimos localizar la reserva o el enlace ha caducado.
        </p>
        <Link href="/" className="mt-5">
          <Button variant="outline" size="sm" className="border-slate-800 text-xs">
            Ir al inicio
          </Button>
        </Link>
      </div>
    )
  }

  // Generamos la lista de cupos (slots) según playersCount
  const paidShares = matchData.shares || []
  const slotsList = Array.from({ length: playersCount }).map((_, idx) => {
    const existing = paidShares[idx]
    if (existing) {
      return existing
    }
    return {
      id: `slot_${idx + 1}`,
      playerName: `Jugador #${idx + 1}`,
      amountArs: quotaPerPlayer,
      status: 'PENDING' as const,
      isOrganizer: false,
    }
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pb-24 relative selection:bg-emerald-500 selection:text-white">
      {/* Luz de fondo sutil */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-80 bg-linear-to-b from-emerald-500/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* ─── BARRA SUPERIOR ─── */}
      <header className="w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={`/club/${matchData.clubSlug}`} className="flex items-center gap-2 group">
            <CancharClubIcon className="w-7 h-7" />
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-white">
              Canchar<span className="text-emerald-400">Club</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchMatch(true)}
              disabled={refreshing}
              className="text-xs text-slate-400 hover:text-white gap-1.5 h-8 px-2.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── CONTENIDO PRINCIPAL ─── */}
      <main className="w-full max-w-2xl px-4 pt-6 space-y-6 relative z-10">
        {/* Encabezado del Partido */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dividir el Pago del Turno</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Partido en {matchData.clubName}
          </h1>

          <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs text-slate-300">
            <span className="font-bold text-emerald-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
              {matchData.courtName}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {matchData.dateFormatted}
            </span>
            <span className="flex items-center gap-1 font-mono font-bold text-white">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {matchData.time} hs
            </span>
          </div>
        </div>

        {/* Tarjeta de Resumen Financiero y Progreso de Recaudación */}
        <Card className="bg-slate-900/90 border-slate-800 rounded-3xl p-5 shadow-xl backdrop-blur-md">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center pb-4 border-b border-slate-800/80">
            <div>
              <span className="text-[10px] sm:text-xs text-slate-400 font-semibold uppercase">Total Turno</span>
              <div className="text-base sm:text-xl font-black text-white font-mono mt-0.5">
                {formatARS(totalAmount)}
              </div>
            </div>
            <div>
              <span className="text-[10px] sm:text-xs text-emerald-400 font-semibold uppercase">Ya Cubierto</span>
              <div className="text-base sm:text-xl font-black text-emerald-400 font-mono mt-0.5">
                {formatARS(totalCollected)}
              </div>
            </div>
            <div>
              <span className="text-[10px] sm:text-xs text-amber-400 font-semibold uppercase">Resta Pagar</span>
              <div className="text-base sm:text-xl font-black text-amber-400 font-mono mt-0.5">
                {formatARS(balanceRemaining)}
              </div>
            </div>
          </div>

          {/* Barra de Progreso */}
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400 font-medium">
              <span>Recaudado para este turno</span>
              <span className="font-bold text-emerald-400">{percentCollected}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-linear-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                style={{ width: `${percentCollected}%` }}
              />
            </div>
          </div>

          {/* Selector de Jugadores para la División */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-200 block">
                ¿Entre cuántos dividen el turno?
              </span>
              <span className="text-[11px] text-slate-400">
                Cada uno abona exactamente su porción.
              </span>
            </div>

            <div className="inline-flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
              {[2, 4, 8, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setPlayersCount(num)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    playersCount === num
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {num} j.
                </button>
              ))}
            </div>
          </div>

          {/* Destacado de Cuota Individual */}
          <div className="mt-4 p-3.5 rounded-2xl bg-linear-to-r from-emerald-950/40 via-slate-950 to-indigo-950/40 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
                {playersCount}
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                  Cuota individual calculada
                </span>
                <span className="text-xs text-slate-200">
                  Total dividido en {playersCount} partes iguales
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-black text-emerald-400 font-mono">
                {formatARS(quotaPerPlayer)}
              </div>
              <span className="text-[10px] text-slate-400">por persona</span>
            </div>
          </div>
        </Card>

        {/* ─── LISTADO DE CUPOS Y ESTADO DE JUGADORES ─── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Estado de los {playersCount} Jugadores
            </h3>
            <span className="text-xs text-slate-400">
              {slotsList.filter((s) => s.status === 'PAID').length} de {playersCount} abonados
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {slotsList.map((slot, index) => {
              const isPaid = slot.status === 'PAID'
              return (
                <div
                  key={slot.id || index}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    isPaid
                      ? 'bg-slate-900/90 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          isPaid
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <span className="text-xs font-extrabold text-white block">
                          {slot.playerName}
                        </span>
                        {slot.isOrganizer && (
                          <span className="text-[10px] text-emerald-400 font-semibold block">
                            Organizador (Seña)
                          </span>
                        )}
                        {slot.playerPhone && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {slot.playerPhone}
                          </span>
                        )}
                      </div>
                    </div>

                    {isPaid ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0.5 gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Abonado</span>
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-800 text-slate-400 border-slate-700 text-[10px] px-2 py-0.5 shrink-0">
                        Pendiente
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Cuota</span>
                      <span className="text-xs font-mono font-bold text-white">
                        {formatARS(slot.amountArs || quotaPerPlayer)}
                      </span>
                    </div>

                    {!isPaid && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setIsPayModalOpen(true)
                        }}
                        className="h-8 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xs cursor-pointer"
                      >
                        Pagar mi parte
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── DATOS DE TRANSFERENCIA DEL CLUB (SI HAY SALDO) ─── */}
        {matchData.bankAlias && (
          <Card className="bg-slate-900/60 border-slate-800 rounded-2xl p-4 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-400" />
                Cuenta Oficial del Club para Transferencias
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">Acreditación Directa</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">Alias para transferir:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm select-all">
                  {matchData.bankAlias}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyAlias}
                className="h-8 px-2.5 text-xs rounded-xl border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/50 gap-1.5"
              >
                {copiedAlias ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAlias ? 'Copiado' : 'Copiar'}</span>
              </Button>
            </div>
          </Card>
        )}
      </main>

      {/* ─── BARRA DE ACCIÓN INFERIOR FIJA (VIRAL SHARE & PAGAR) ─── */}
      <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-slate-950/95 border-t border-slate-800/80 backdrop-blur-md z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-2 sm:gap-3">
          <Button
            onClick={handleShareWhatsApp}
            className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-950/50 gap-2 cursor-pointer transition-all active:scale-[0.99]"
          >
            <MessageCircle className="w-5 h-5 text-white shrink-0" />
            <span>Enviar al Grupo de WhatsApp</span>
          </Button>

          <Button
            onClick={handleCopyLink}
            variant="outline"
            className="h-12 px-3 sm:px-4 rounded-xl border-slate-700 bg-slate-900 text-slate-200 hover:text-white hover:bg-slate-800 gap-1.5 cursor-pointer text-xs shrink-0"
            title="Copiar enlace"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">{copiedLink ? 'Copiado' : 'Copiar Link'}</span>
          </Button>
        </div>
      </div>

      {/* ─── MODAL DE PAGO DE CUOTA INDIVIDUAL ─── */}
      <Dialog open={isPayModalOpen} onOpenChange={setIsPayModalOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100 rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-400" />
              Pagar mi Cuota: {formatARS(quotaPerPlayer)}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Registrá tu parte para {matchData.courtName} en {matchData.clubName}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmMyShare} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-300">Tu Nombre y Apellido *</Label>
              <Input
                type="text"
                placeholder="Ej: Marcos Gómez"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                required
                className="h-11 bg-slate-950 border-slate-800 text-white text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-300">Teléfono Celular de WhatsApp</Label>
              <Input
                type="tel"
                placeholder="Ej: 3814123456"
                value={payerPhone}
                onChange={(e) => setPayerPhone(e.target.value)}
                className="h-11 bg-slate-950 border-slate-800 text-white text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-300">Medio de Pago</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('TRANSFER')}
                  className={`p-3 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                    paymentMethod === 'TRANSFER'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  Transferencia
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('MERCADOPAGO')}
                  className={`p-3 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                    paymentMethod === 'MERCADOPAGO'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  Mercado Pago
                </button>
              </div>
            </div>

            {paymentMethod === 'TRANSFER' && matchData.bankAlias && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Transferir a:</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-emerald-400 font-bold">{matchData.bankAlias}</span>
                  <button
                    type="button"
                    onClick={handleCopyAlias}
                    className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-300">N° de Comprobante / Referencia (Opcional)</Label>
              <Input
                type="text"
                placeholder="Ej: 12345678"
                value={transferRef}
                onChange={(e) => setTransferRef(e.target.value)}
                className="h-11 bg-slate-950 border-slate-800 text-white text-xs font-mono"
              />
            </div>

            <DialogFooter className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsPayModalOpen(false)}
                disabled={submittingPayment}
                className="text-xs text-slate-400"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submittingPayment}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-11 px-5 rounded-xl gap-2 cursor-pointer"
              >
                {submittingPayment ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar Pago de {formatARS(quotaPerPlayer)}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
