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
  Share2,
  ExternalLink,
  Loader2,
  Sparkles,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react'
import {
  InstagramIcon,
  FacebookIcon,
  TikTokIcon,
} from '@/components/icons/social-icons'
import {
  getClubSocialLinks,
  updateClubSocialLinks,
} from '@/actions/club.actions'
import {
  normalizeSocialUrl,
  extractSocialHandle,
  type ClubSocialLinks,
} from '@/config/clubs-catalog'
import { toast } from 'sonner'
import Link from 'next/link'

interface ClubSocialLinksModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  clubSlug?: string
  initialLinks?: ClubSocialLinks
  onSuccess?: (links: ClubSocialLinks) => void
}

export function ClubSocialLinksModal({
  isOpen,
  onClose,
  tenantId,
  clubSlug,
  initialLinks,
  onSuccess,
}: ClubSocialLinksModalProps) {
  const [instagram, setInstagram] = useState(initialLinks?.instagram || '')
  const [facebook, setFacebook] = useState(initialLinks?.facebook || '')
  const [tiktok, setTiktok] = useState(initialLinks?.tiktok || '')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)

  // Cargar datos actuales si no se pasaron como prop
  useEffect(() => {
    if (!isOpen || !tenantId) return

    // Si ya fueron provistos los links iniciales, no necesitamos consultar al servidor
    if (
      initialLinks &&
      (initialLinks.instagram !== undefined ||
        initialLinks.facebook !== undefined ||
        initialLinks.tiktok !== undefined)
    ) {
      return
    }

    let isMounted = true
    getClubSocialLinks(tenantId)
      .then((data) => {
        if (!isMounted) return
        setInstagram(data.instagram || '')
        setFacebook(data.facebook || '')
        setTiktok(data.tiktok || '')
      })
      .catch((err) => {
        console.error('[ClubSocialLinksModal] Error fetching social links:', err)
      })
      .finally(() => {
        if (isMounted) setFetching(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, tenantId, initialLinks])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      toast.error('Error: no se detectó el identificador del club')
      return
    }

    setLoading(true)
    try {
      const res = await updateClubSocialLinks(tenantId, {
        instagram,
        facebook,
        tiktok,
      })

      if (!res.success || !res.data) {
        toast.error(res.error || 'Error al guardar los enlaces de redes sociales')
        return
      }

      toast.success('¡Redes sociales actualizadas!', {
        description: 'Los enlaces ya están disponibles para los jugadores en tu página pública de reservas.',
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

  const normalizedIg = normalizeSocialUrl('instagram', instagram)
  const normalizedFb = normalizeSocialUrl('facebook', facebook)
  const normalizedTt = normalizeSocialUrl('tiktok', tiktok)

  const hasAnyLink = Boolean(normalizedIg || normalizedFb || normalizedTt)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto bg-slate-950 border border-slate-800 text-slate-100 p-0 shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-slate-800/80 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-indigo-500 p-0.5 shadow-lg shadow-pink-950/40 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Share2 className="w-5 h-5 text-pink-400" />
              </div>
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                Redes Sociales del Club
                <Badge className="bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-semibold">
                  Jugadores
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                Vinculá tu Instagram, Facebook y TikTok para que los jugadores sigan tus novedades, torneos y fotos de partidos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {fetching ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-8 h-8 text-pink-400 animate-spin mb-3" />
            <p className="text-xs text-slate-400">Cargando enlaces configurados...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Input 1: Instagram */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 focus-within:border-pink-500/50 transition-colors">
              <div className="flex items-center justify-between">
                <Label htmlFor="instagram" className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-xs">
                    <InstagramIcon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span>Instagram</span>
                </Label>
                {normalizedIg && (
                  <a
                    href={normalizedIg}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-pink-400 hover:text-pink-300 transition-colors"
                  >
                    <span>Probar link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <Input
                id="instagram"
                placeholder="@tuclubpadel o instagram.com/tuclubpadel"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                className="bg-slate-950 border-slate-800 focus:border-pink-500 text-xs text-slate-100 placeholder:text-slate-600 h-9"
              />
              <p className="text-[11px] text-slate-500">
                Podés escribir tu usuario con arroba (ej: <code className="text-pink-400/90 font-mono">@clubpadel</code>) o la URL completa.
              </p>
            </div>

            {/* Input 2: Facebook */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 focus-within:border-blue-500/50 transition-colors">
              <div className="flex items-center justify-between">
                <Label htmlFor="facebook" className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                  <div className="w-6 h-6 rounded-lg bg-[#1877F2] flex items-center justify-center shadow-xs">
                    <FacebookIcon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span>Facebook</span>
                </Label>
                {normalizedFb && (
                  <a
                    href={normalizedFb}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <span>Probar link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <Input
                id="facebook"
                placeholder="facebook.com/tuclubpadel o nombre-pagina"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                className="bg-slate-950 border-slate-800 focus:border-blue-500 text-xs text-slate-100 placeholder:text-slate-600 h-9"
              />
              <p className="text-[11px] text-slate-500">
                Enlace a tu Fanpage o perfil de Facebook del complejo deportivo.
              </p>
            </div>

            {/* Input 3: TikTok */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 focus-within:border-cyan-500/50 transition-colors">
              <div className="flex items-center justify-between">
                <Label htmlFor="tiktok" className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                  <div className="w-6 h-6 rounded-lg bg-black border border-slate-700 flex items-center justify-center shadow-xs">
                    <TikTokIcon className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <span>TikTok</span>
                </Label>
                {normalizedTt && (
                  <a
                    href={normalizedTt}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>Probar link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <Input
                id="tiktok"
                placeholder="@tuclubpadel o tiktok.com/@tuclubpadel"
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                className="bg-slate-950 border-slate-800 focus:border-cyan-500 text-xs text-slate-100 placeholder:text-slate-600 h-9"
              />
              <p className="text-[11px] text-slate-500">
                Videos destacados de jugadas, torneos relámpago y ambiente de tu club.
              </p>
            </div>

            {/* Vista previa en tiempo real */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                  Vista previa para tus jugadores:
                </span>
                {clubSlug && (
                  <Link
                    href={`/club/${clubSlug}`}
                    target="_blank"
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1"
                  >
                    <span>Ver página pública</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>

              {hasAnyLink ? (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[11px] font-semibold text-slate-400">Seguinos:</span>
                  {normalizedIg && (
                    <a
                      href={normalizedIg}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-xs font-semibold text-pink-300 hover:text-pink-200 transition-colors cursor-pointer shadow-xs"
                    >
                      <InstagramIcon className="w-3.5 h-3.5 text-pink-400" />
                      <span>{extractSocialHandle('instagram', instagram) || 'Instagram'}</span>
                    </a>
                  )}
                  {normalizedFb && (
                    <a
                      href={normalizedFb}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors cursor-pointer shadow-xs"
                    >
                      <FacebookIcon className="w-3.5 h-3.5 text-blue-400" />
                      <span>{extractSocialHandle('facebook', facebook) || 'Facebook'}</span>
                    </a>
                  )}
                  {normalizedTt && (
                    <a
                      href={normalizedTt}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shadow-xs"
                    >
                      <TikTokIcon className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{extractSocialHandle('tiktok', tiktok) || 'TikTok'}</span>
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic py-1">
                  Ingresá al menos una red social para que los botones sean visibles para tus jugadores.
                </p>
              )}
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={loading}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-pink-600 hover:bg-pink-500 text-white font-semibold text-xs h-9 px-4 gap-2 shadow-lg shadow-pink-950/40 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Guardar Redes Sociales</span>
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
