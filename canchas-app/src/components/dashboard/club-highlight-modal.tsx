'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Flame,
  Megaphone,
  CheckCircle2,
  Loader2,
  Eye,
  Lightbulb,
  ExternalLink,
} from 'lucide-react'
import { updateClubHighlightInfo, getClubHighlightInfo, type ClubHighlightInfo } from '@/actions/club.actions'
import { toast } from 'sonner'
import Link from 'next/link'

interface ClubHighlightModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  clubSlug?: string
  initialInfo?: {
    highlightText?: string
    highlightBadge?: string
    isHighlightActive?: boolean
  }
  onSuccess?: (info: ClubHighlightInfo) => void
}

const BADGE_PRESETS = [
  '🔥 Promoción Especial',
  '⭐ Novedad del Club',
  '🎾 Canchas Panorámicas',
  '🏆 Torneo Abierto',
  '🍻 Tercer Tiempo & Cantina',
  '⚡ Últimos Turnos',
  '🎁 2x1 en Turnos',
]

const INSPIRATION_TEMPLATES = [
  {
    title: 'Promoción Noche',
    badge: '🔥 Promoción Especial',
    text: '¡Aprovechá 20% OFF en todos los turnos después de las 22:00 hs! Reservá tu cancha online y disfrutá la noche.',
  },
  {
    title: 'Nuevas Canchas',
    badge: '🎾 Canchas Panorámicas',
    text: '¡Estrenamos césped sintético texturado e iluminación LED profesional! Canchas panorámicas listas para tu mejor partido.',
  },
  {
    title: 'Tercer Tiempo',
    badge: '🍻 Tercer Tiempo & Cantina',
    text: 'Vení a jugar y disfrutá nuestro tercer tiempo: cantina completa con pizzas caseras, bebidas frías y promos post-partido.',
  },
  {
    title: 'Torneo del Club',
    badge: '🏆 Torneo Abierto',
    text: 'Inscripciones abiertas para el próximo Torneo Relámpago. Premios para campeones y sorteos. ¡Anotate por WhatsApp!',
  },
]

export function ClubHighlightModal({
  isOpen,
  onClose,
  tenantId,
  clubSlug,
  initialInfo,
  onSuccess,
}: ClubHighlightModalProps) {
  const [highlightText, setHighlightText] = useState(initialInfo?.highlightText || '')
  const [highlightBadge, setHighlightBadge] = useState(initialInfo?.highlightBadge || '🔥 Promoción Especial')
  const [isActive, setIsActive] = useState(initialInfo?.isHighlightActive ?? true)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)

  // Al abrir, cargar los datos actuales si no se pasaron completos
  useEffect(() => {
    if (!isOpen || !tenantId) return

    if (initialInfo && initialInfo.highlightText !== undefined) {
      setHighlightText(initialInfo.highlightText)
      setHighlightBadge(initialInfo.highlightBadge || '🔥 Promoción Especial')
      setIsActive(initialInfo.isHighlightActive ?? true)
      return
    }

    setFetching(true)
    getClubHighlightInfo(tenantId)
      .then((data) => {
        setHighlightText(data.highlightText)
        setHighlightBadge(data.highlightBadge || '🔥 Promoción Especial')
        setIsActive(data.isHighlightActive)
      })
      .catch((err) => {
        console.error('[ClubHighlightModal] Error fetching highlight:', err)
      })
      .finally(() => setFetching(false))
  }, [isOpen, tenantId, initialInfo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      toast.error('Error: no se detectó el identificador del club')
      return
    }

    setLoading(true)
    try {
      const res = await updateClubHighlightInfo(tenantId, {
        highlightText,
        highlightBadge,
        isHighlightActive: isActive,
      })

      if (!res.success || !res.data) {
        toast.error(res.error || 'Error al guardar la información')
        return
      }

      toast.success('¡Información para jugadores actualizada!', {
        description: isActive
          ? 'El anuncio ahora es visible para los jugadores en tu página pública.'
          : 'El anuncio ha sido guardado pero está oculto.',
      })

      onSuccess?.(res.data)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const applyTemplate = (badge: string, text: string) => {
    setHighlightBadge(badge)
    setHighlightText(text)
    setIsActive(true)
    toast.info('Plantilla aplicada. Podés editarla libremente.')
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-slate-950 border-slate-800 text-slate-100 p-6">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-orange-500/10 to-emerald-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <Megaphone className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                Información para Jugadores
                <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] px-2 py-0">
                  Llamar la atención
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Mostrá un anuncio destacado en tu página de reservas: promociones, tercer tiempo, novedades o beneficios.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {fetching ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-xs">Cargando información del club...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 py-2">
            {/* Toggle de Visibilidad */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">
                    Mostrar anuncio a los jugadores
                  </span>
                  {isActive && highlightText.trim() ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-slate-600" />
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Podés desactivarlo temporalmente sin borrar el texto que escribiste.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Insignia / Título del Anuncio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  Insignia destacada (Badge)
                </Label>
                <span className="text-[10px] text-slate-500">Etiqueta llamativa</span>
              </div>

              <Input
                value={highlightBadge}
                onChange={(e) => setHighlightBadge(e.target.value)}
                placeholder="Ej: 🔥 Promoción Especial, ⭐ Novedad, 🎾 Canchas Panorámicas"
                maxLength={40}
                className="h-10 text-xs"
              />

              {/* Botones de sugerencias rápidas para el badge */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {BADGE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setHighlightBadge(preset)}
                    className={`px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer border ${
                      highlightBadge === preset
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs'
                        : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Mensaje Principal */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Mensaje para el jugador
                </Label>
                <span className="text-[10px] text-slate-500">{highlightText.length} / 250 caracteres</span>
              </div>

              <textarea
                value={highlightText}
                onChange={(e) => setHighlightText(e.target.value)}
                placeholder="Escribí aquí lo que querés comunicar a los jugadores. Ej: ¡20% de descuento en turnos nocturnos! Cantina abierta con tercer tiempo, pizzas y bebidas frías..."
                rows={4}
                maxLength={250}
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900/70 p-3 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 resize-none transition-colors"
              />
            </div>

            {/* Plantillas de Inspiración */}
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Ideas para inspirarte (un clic para aplicar):</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {INSPIRATION_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.title}
                    type="button"
                    onClick={() => applyTemplate(tmpl.badge, tmpl.text)}
                    className="p-2 text-left rounded-lg bg-slate-950/60 border border-slate-800 hover:border-amber-500/40 hover:bg-slate-900 transition-colors text-[11px] group cursor-pointer"
                  >
                    <div className="font-semibold text-slate-300 group-hover:text-amber-300 flex items-center justify-between">
                      <span>{tmpl.title}</span>
                      <span className="text-[9px] text-slate-500 group-hover:text-amber-400">Usar</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">
                      {tmpl.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Vista Previa en Vivo */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  Vista previa de cómo lo verán los jugadores:
                </span>
                {clubSlug && (
                  <Link
                    href={`/club/${clubSlug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                  >
                    <span>Ver página pública</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>

              {isActive && highlightText.trim() ? (
                <div className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900/90 to-emerald-950/40 p-4 shadow-lg shadow-amber-950/20 backdrop-blur-sm">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5">
                          {highlightBadge || '🔥 Promoción Especial'}
                        </Badge>
                        <span className="text-[10px] text-emerald-400 font-semibold">
                          • Anuncio Oficial del Club
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-medium whitespace-pre-line">
                        {highlightText}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center">
                  <p className="text-xs text-slate-500">
                    {highlightText.trim()
                      ? 'El anuncio está desactivado (oculto para los jugadores).'
                      : 'Escribí un mensaje arriba para ver la vista previa en vivo.'}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
                className="border-slate-800 text-slate-400 hover:text-white text-xs h-9 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 gap-1.5 shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Guardar Información</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
