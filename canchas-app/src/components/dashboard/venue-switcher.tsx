'use client'

import { useState, useMemo, useSyncExternalStore, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTenantId } from '@/hooks/use-tenant-id'
import { 
  Building2, 
  MapPin, 
  Check, 
  ChevronDown, 
  Plus, 
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { DEFAULT_VENUES, type VenueItem } from '@/config/venues-data'

export type { VenueItem }

function setClientCookie(name: string, value: string, days = 30) {
  if (typeof document !== 'undefined') {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`
  }
}

function subscribeStorage(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', callback)
  window.addEventListener('canchar:venue-changed', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('canchar:venue-changed', callback)
  }
}

function cleanLegacyVenueStorage() {
  try {
    const val = localStorage.getItem('canchar_active_venue_id')
    const nameVal = localStorage.getItem('canchar_active_venue_name')
    if (val === 'venue-yb' || nameVal?.toLowerCase().includes('yerba buena')) {
      localStorage.removeItem('canchar_active_venue_id')
      localStorage.removeItem('canchar_active_venue_name')
      localStorage.removeItem('canchar_custom_venues')
    }
  } catch {}
}

function getStoredVenueId(): string {
  try {
    cleanLegacyVenueStorage()
    const val = localStorage.getItem('canchar_active_venue_id')
    return val || DEFAULT_VENUES[0].id
  } catch {
    return DEFAULT_VENUES[0].id
  }
}

function getStoredCustomVenuesJson(): string {
  try {
    cleanLegacyVenueStorage()
    const raw = localStorage.getItem('canchar_custom_venues')
    if (raw && raw.toLowerCase().includes('yerba buena')) {
      localStorage.removeItem('canchar_custom_venues')
      return '[]'
    }
    return raw || '[]'
  } catch {
    return '[]'
  }
}

const getServerVenueId = () => DEFAULT_VENUES[0].id
const getServerCustomVenues = () => '[]'

export function VenueSwitcher({ 
  className, 
  tenantName,
  tenantId: propTenantId,
  initialCourtsCount,
  initialSports,
}: { 
  className?: string
  tenantName?: string
  tenantId?: string | null
  initialCourtsCount?: number
  initialSports?: string[]
}) {
  const router = useRouter()
  const hookTenantId = useTenantId()
  const effectiveTenantId = propTenantId || hookTenantId

  const [fetchedCourts, setFetchedCourts] = useState<{ count: number; sports: string[] } | null>(null)

  const effectiveCourtsCount = fetchedCourts?.count ?? (typeof initialCourtsCount === 'number' ? initialCourtsCount : DEFAULT_VENUES[0].courtsCount)
  const effectiveSports = fetchedCourts?.sports && fetchedCourts.sports.length > 0 
    ? fetchedCourts.sports 
    : (initialSports && initialSports.length > 0 ? initialSports : DEFAULT_VENUES[0].sports)

  const fetchCourts = useCallback(async () => {
    try {
      const supabase = createClient()
      let targetTenantId = effectiveTenantId

      if (!targetTenantId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .maybeSingle()
          if (profile?.tenant_id) {
            targetTenantId = profile.tenant_id
          }
        }
      }

      let query = supabase.from('courts').select('id, sport, is_active')
      if (targetTenantId) {
        query = query.eq('tenant_id', targetTenantId)
      }

      const { data, error } = await query
      if (data && !error) {
        const uniqueSports = Array.from(new Set(data.map(c => c.sport).filter(Boolean)))
        const formatted = uniqueSports.map(s => {
          if (s === 'FUTBOL5' || s === 'FUTBOL_5') return 'Fútbol 5'
          if (s === 'FUTBOL7' || s === 'FUTBOL_7') return 'Fútbol 7'
          if (s === 'PADEL') return 'Pádel'
          if (s === 'TENIS') return 'Tenis'
          if (s === 'BASQUET' || s === 'BASKET') return 'Básquet'
          return s
        })
        setFetchedCourts({
          count: data.length,
          sports: formatted.length > 0 ? formatted : ['Fútbol', 'Pádel']
        })
      }
    } catch {}
  }, [effectiveTenantId])

  useEffect(() => {
    let isCancelled = false
    const run = async () => {
      await fetchCourts()
    }
    void run()

    const handleCourtsChange = () => {
      if (!isCancelled) {
        void fetchCourts()
      }
    }
    window.addEventListener('canchar:courts-changed', handleCourtsChange)
    return () => {
      isCancelled = true
      window.removeEventListener('canchar:courts-changed', handleCourtsChange)
    }
  }, [fetchCourts])

  const activeVenueId = useSyncExternalStore(
    subscribeStorage,
    getStoredVenueId,
    getServerVenueId
  )
  const customVenuesJson = useSyncExternalStore(
    subscribeStorage,
    getStoredCustomVenuesJson,
    getServerCustomVenues
  )

  const customVenues = useMemo(() => {
    try {
      const parsed = JSON.parse(customVenuesJson)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [customVenuesJson])

  const venues = useMemo(() => {
    const baseVenue: VenueItem = {
      ...DEFAULT_VENUES[0],
      name: tenantName || DEFAULT_VENUES[0].name,
      branchName: tenantName ? `${tenantName} (Central)` : 'Sede Central',
      courtsCount: effectiveCourtsCount,
      sports: effectiveSports,
    }
    return customVenues.length > 0 ? [baseVenue, ...customVenues] : [baseVenue]
  }, [customVenues, tenantName, effectiveCourtsCount, effectiveSports])

  const [isOpen, setIsOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newCourtsCount, setNewCourtsCount] = useState('2')

  const activeVenue = venues.find(v => v.id === activeVenueId) || venues[0]

  const handleSelectVenue = (venue: VenueItem) => {
    setIsOpen(false)
    try {
      localStorage.setItem('canchar_active_venue_id', venue.id)
      localStorage.setItem('canchar_active_venue_name', venue.branchName)
      setClientCookie('canchar_active_venue_id', venue.id)
      setClientCookie('canchar_active_venue_name', encodeURIComponent(venue.branchName))
      window.dispatchEvent(new CustomEvent('canchar:venue-changed', { detail: venue }))
    } catch {}
    router.refresh()
    toast.success(`Sede cambiada a: ${venue.branchName}`)
  }

  const handleCreateVenue = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBranchName.trim()) {
      toast.error('Completá el nombre de la nueva sede')
      return
    }

    const newVenue: VenueItem = {
      id: `venue-${Date.now()}`,
      name: activeVenue.name,
      branchName: newBranchName.trim(),
      address: newAddress.trim() || 'A definir',
      city: 'Tucumán, Argentina',
      courtsCount: Number(newCourtsCount) || 2,
      sports: ['Pádel'],
      isPrimary: false
    }

    const updatedCustom = [...customVenues, newVenue]
    try {
      localStorage.setItem('canchar_active_venue_id', newVenue.id)
      localStorage.setItem('canchar_active_venue_name', newVenue.branchName)
      localStorage.setItem('canchar_custom_venues', JSON.stringify(updatedCustom))
      setClientCookie('canchar_active_venue_id', newVenue.id)
      setClientCookie('canchar_active_venue_name', encodeURIComponent(newVenue.branchName))
      window.dispatchEvent(new CustomEvent('canchar:venue-changed', { detail: newVenue }))
    } catch {}

    setShowAddModal(false)
    setNewBranchName('')
    setNewAddress('')
    router.refresh()
    toast.success(`¡Nueva sede "${newVenue.branchName}" agregada con éxito!`)
  }

  return (
    <div className={`relative z-50 ${className || ''}`}>
      {/* Botón Selector de Sede */}
      <button
        type="button"
        onClick={() => {
          const next = !isOpen
          setIsOpen(next)
          if (next) {
            void fetchCourts()
          }
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 transition-all text-left group"
        aria-expanded={isOpen}
      >
        <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          <Building2 className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider leading-none">
            Sede Activa
          </span>
          <span 
            suppressHydrationWarning
            className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors max-w-35 sm:max-w-45 truncate leading-tight"
          >
            {activeVenue.branchName}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Menú Desplegable de Sedes */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl bg-slate-950 border border-slate-800 p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3 py-2 border-b border-slate-800/80 mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Complejos y Sedes ({venues.length})
              </span>
              <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">
                Multisede B2B
              </Badge>
            </div>

            <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
              {venues.map((v) => {
                const isSelected = v.id === activeVenueId
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelectVenue(v)}
                    className={`w-full p-2.5 rounded-xl text-left flex items-start gap-2.5 transition-all ${
                      isSelected
                        ? 'bg-emerald-950/40 border border-emerald-500/40 text-white'
                        : 'hover:bg-slate-900 border border-transparent text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate block">{v.branchName}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{v.address}, {v.city}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                          <Layers className="w-3 h-3" />
                          {v.courtsCount} canchas
                        </span>
                        <span className="text-[10px] text-slate-500">•</span>
                        <span className="text-[10px] text-slate-400">{v.sports.join(', ')}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Botón Agregar Nueva Sede */}
            <div className="pt-2 mt-1 border-t border-slate-800/80">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsOpen(false)
                  setShowAddModal(true)
                }}
                className="w-full h-8 rounded-xl border-dashed border-slate-700 hover:border-emerald-500/60 hover:bg-emerald-950/30 text-slate-300 hover:text-emerald-300 text-xs font-semibold gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Nueva Sucursal / Sede</span>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Modal para Agregar Nueva Sede / Sucursal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">Nueva Sede / Complejo Deportivo</h3>
                <p className="text-xs text-slate-400">Expandí tu franquicia o club con múltiples sucursales</p>
              </div>
            </div>

            <form onSubmit={handleCreateVenue} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nombre de la Sucursal *
                </label>
                <input
                  type="text"
                  placeholder="Ej. Sede Tafí Viejo (Norte)"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Dirección y Ubicación
                </label>
                <input
                  type="text"
                  placeholder="Ej. Av. Alem 1200, Tafí Viejo"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Cantidad Inicial de Canchas
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={newCourtsCount}
                  onChange={(e) => setNewCourtsCount(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Cada sede mantendrá su propia grilla de turnos, caja diaria y canchas, accesible desde una única cuenta unificada de administrador.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  className="h-9 px-3 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1"
                >
                  <span>Crear Sede</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
