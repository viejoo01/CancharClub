'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  CalendarDays, 
  Layers, 
  DollarSign, 
  Wallet, 
  ExternalLink,
  ShieldCheck,
  LogOut,
  Trophy,
  Coffee,
  CreditCard,
  Repeat,
  Zap,
  BarChart3,
  X,
  Landmark,
  Users,
  UserCheck,
  Receipt,
  KeyRound,
  Share2,
  Sparkles,
  MessageSquare,
  Bell,
  SlidersHorizontal,
  Smartphone
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SAAS_PLANS, type SaaSPlanId, type SaaSFeatureKey } from '@/config/saas-plans'
import { useUserRole, useTenantId } from '@/hooks/use-tenant-id'
import { CustomizeMenuModal } from './customize-menu-modal'
import { getClubSidebarPreferences, type SidebarNavPreferences } from '@/actions/club.actions'

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  exact?: boolean
  roles: string[]
  requiredFeature?: SaaSFeatureKey   // qué feature del plan habilita este ítem
  staffVisible?: boolean              // si el canchero siempre lo ve (independiente del plan)
}

interface SidebarProps {
  tenantId?: string | null
  tenantName?: string
  tenantSlug?: string
  userRole?: string
  isActive?: boolean
  planId?: SaaSPlanId
  isMobile?: boolean
  onClose?: () => void
  isTrial?: boolean
  trialDaysRemaining?: number
  trialDueDate?: string
}

export function Sidebar({ 
  tenantId,
  tenantName = 'Mi Club Deportivo', 
  tenantSlug = 'mi-club',
  userRole = 'ADMIN',
  isActive = true,
  planId,
  isMobile = false,
  onClose,
  isTrial = false,
  trialDaysRemaining,
  trialDueDate,
}: SidebarProps) {
  const pathname = usePathname()

  const navItems: NavItem[] = [
    {
      title: 'Calendario de Turnos',
      href: '/dashboard',
      icon: CalendarDays,
      exact: true,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      staffVisible: true,
    },
    {
      title: 'Notificaciones',
      href: '/dashboard/notificaciones',
      icon: Bell,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      staffVisible: true,
    },
    {
      title: 'Turnos Fijos',
      href: '/dashboard/fijos',
      icon: Repeat,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      requiredFeature: 'turnos_fijos',
      staffVisible: true,
    },
    {
      title: 'Cantina',
      href: '/dashboard/cantina',
      icon: Coffee,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      requiredFeature: 'cantina_kiosco',
      staffVisible: true,
    },
    {
      title: 'Caja Diaria',
      href: '/dashboard/caja',
      icon: Wallet,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      staffVisible: true,
    },
    {
      title: 'Control de Luces',
      href: '/dashboard/luces',
      icon: Zap,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      requiredFeature: 'control_luces',
      staffVisible: true,
    },
    {
      title: 'Torneos y Cuadros',
      href: '/dashboard/torneos',
      icon: Trophy,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      requiredFeature: 'torneos_expres',
      staffVisible: true,
    },
    {
      title: 'Reputación de Jugadores',
      href: '/dashboard/jugadores',
      icon: Users,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      staffVisible: true,
    },
    {
      title: 'Equipo',
      href: '/dashboard/equipo',
      icon: UserCheck,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
      requiredFeature: 'multiusuario',
    },
    {
      title: 'Cuentas de Cobro',
      href: '/dashboard/cobros',
      icon: Landmark,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
      requiredFeature: 'mercadopago_deposits',
    },
    {
      title: 'Facturación AFIP / ARCA',
      href: '/dashboard/facturacion',
      icon: Receipt,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
      requiredFeature: 'facturacion_afip',
    },
    {
      title: 'Bot WhatsApp',
      href: '/dashboard/whatsapp',
      icon: MessageSquare,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
    },
    {
      title: 'Canchas',
      href: '/dashboard/canchas',
      icon: Layers,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
    },
    {
      title: 'Reglas de Precios',
      href: '/dashboard/precios',
      icon: DollarSign,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
    },
    {
      title: 'Reportes de Ocupación',
      href: '/dashboard/reportes',
      icon: BarChart3,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
      requiredFeature: 'reportes_ocupacion',
    },
    {
      title: 'Mi plan',
      href: '/dashboard/plan',
      icon: CreditCard,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
    },
  ]

  const { role: hookRole } = useUserRole()
  const effectiveRole = (userRole && userRole !== 'ADMIN') ? userRole : (hookRole || userRole || 'ADMIN')
  const isStaff = effectiveRole === 'TENANT_STAFF' || userRole === 'TENANT_STAFF' || hookRole === 'TENANT_STAFF'
  const isSuperadmin = effectiveRole === 'SUPERADMIN' || userRole === 'SUPERADMIN'
  const effectivePlanId: SaaSPlanId = planId || 'MEDIANO_2'
  const currentPlan = SAAS_PLANS[effectivePlanId] || SAAS_PLANS.MEDIANO_2
  const planAllowedFeatures = currentPlan.allowedModules

  const filteredNavItems = navItems.filter(item => {
    // Si es encargado (TENANT_STAFF), bajo ninguna circunstancia puede ver "Mi plan"
    if (isStaff && item.href === '/dashboard/plan') return false

    // 1. Filtrar por rol de usuario
    if (!item.roles.includes(effectiveRole)) return false

    // 2. Superadmin tiene acceso a todo
    if (isSuperadmin) return true

    // 3. Verificación estricta del Plan SaaS (Aplica tanto al Dueño como al Encargado)
    // Si el menú requiere una funcionalidad exclusiva y el club no la tiene en su plan, se oculta
    if (item.requiredFeature && !planAllowedFeatures.includes(item.requiredFeature)) {
      return false
    }

    // 4. Si es encargado (TENANT_STAFF), solo ve los ítems marcados como staffVisible
    if (isStaff) {
      return item.staffVisible === true
    }

    return true
  })

  const hookTenantId = useTenantId()
  const effectiveTenantId = tenantId || hookTenantId || null

  const [showCustomizeModal, setShowCustomizeModal] = useState(false)
  const [preferences, setPreferences] = useState<SidebarNavPreferences>(() => {
    if (typeof window === 'undefined') return { order: [], hidden: [] }
    try {
      const raw = localStorage.getItem(`canchar_sidebar_nav_prefs_${effectiveTenantId || 'default'}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        return {
          order: Array.isArray(parsed.order) ? parsed.order : [],
          hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
        }
      }
    } catch {}
    return { order: [], hidden: [] }
  })

  // Sincronizar con el servidor
  useEffect(() => {
    if (!effectiveTenantId) return
    const currentKey = `canchar_sidebar_nav_prefs_${effectiveTenantId}`

    getClubSidebarPreferences(effectiveTenantId).then((serverPrefs) => {
      if (serverPrefs) {
        setPreferences(serverPrefs)
        try {
          localStorage.setItem(currentKey, JSON.stringify(serverPrefs))
        } catch {}
      }
    }).catch(() => {})
  }, [effectiveTenantId])

  // Escuchar cambios de preferencias entre pestañas o instancias
  useEffect(() => {
    const handler = () => {
      if (!effectiveTenantId) return
      const currentKey = `canchar_sidebar_nav_prefs_${effectiveTenantId}`
      try {
        const raw = localStorage.getItem(currentKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          setPreferences({
            order: Array.isArray(parsed.order) ? parsed.order : [],
            hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
          })
        }
      } catch {}
    }
    window.addEventListener('canchar-sidebar-prefs-changed', handler)
    return () => window.removeEventListener('canchar-sidebar-prefs-changed', handler)
  }, [effectiveTenantId])

  const handleSavePreferences = (newPrefs: SidebarNavPreferences) => {
    setPreferences(newPrefs)
    if (effectiveTenantId) {
      try {
        localStorage.setItem(`canchar_sidebar_nav_prefs_${effectiveTenantId}`, JSON.stringify(newPrefs))
      } catch {}
    }
    window.dispatchEvent(new CustomEvent('canchar-sidebar-prefs-changed'))
  }

  // Ordenar y filtrar ítems según las preferencias del club
  const finalNavItems: NavItem[] = []
  const itemMap = new Map(filteredNavItems.map((item) => [item.href, item]))

  // 1. Agregar según orden guardado (omitiendo los que el dueño haya ocultado)
  for (const href of preferences.order || []) {
    const item = itemMap.get(href)
    if (item) {
      if (!preferences.hidden?.includes(href)) {
        finalNavItems.push(item)
      }
      itemMap.delete(href)
    }
  }

  // 2. Agregar cualquier ítem restante permitido (que no haya sido ordenado todavía y no esté oculto)
  for (const remaining of itemMap.values()) {
    if (!preferences.hidden?.includes(remaining.href)) {
      finalNavItems.push(remaining)
    }
  }

  // Si por alguna razón se ocultaron todos, mantener los permitidos
  const displayedNavItems = finalNavItems.length > 0 ? finalNavItems : filteredNavItems

  return (
    <aside className={cn(
      "flex flex-col bg-slate-950 select-none",
      isMobile ? "w-full h-full" : "w-64 shrink-0 border-r border-slate-800/80"
    )}>
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80 bg-slate-950/50">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-sm text-white truncate tracking-tight">
              {tenantName}
            </span>
            {isStaff ? (
              <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Encargado Operativo
              </span>
            ) : isSuperadmin ? (
              <span className="text-[10px] text-purple-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                Superadmin Plataforma
              </span>
            ) : (
              <span className="text-[10px] text-emerald-400/90 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Plan {currentPlan.courtsLabel}
              </span>
            )}
          </div>
        </div>

        {/* Botón de cerrar drawer móvil */}
        {isMobile && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {isTrial && !isStaff && (
          <Link
            href="/dashboard/plan"
            onClick={() => onClose?.()}
            className="block mb-3 p-2.5 rounded-xl bg-linear-to-r from-emerald-500/15 via-teal-500/10 to-indigo-500/15 border border-emerald-500/30 hover:border-emerald-500/50 transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>15 Días Gratis</span>
                    {typeof trialDaysRemaining === 'number' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                        {trialDaysRemaining}d
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {trialDueDate ? `Vence: ${trialDueDate}` : 'Prueba Bonificada'}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        )}

        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {isStaff ? 'Operaciones de Encargado' : 'Operaciones'}
          </span>
          {!isStaff && (
            <button
              type="button"
              onClick={() => setShowCustomizeModal(true)}
              className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-900 border border-transparent hover:border-slate-800 cursor-pointer"
              title="Personalizar orden y visibilidad del menú"
            >
              <SlidersHorizontal className="w-3 h-3 text-emerald-400" />
              <span>Editar menú</span>
            </button>
          )}
        </div>

        {displayedNavItems.map((item) => {
          const isActive_item = item.exact 
            ? pathname === item.href 
            : pathname.startsWith(item.href)

          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onClose?.()}
              prefetch={true}
              className={cn(
                'flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition-all duration-150',
                isActive_item
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-950/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn('w-4 h-4', isActive_item ? 'text-emerald-400' : 'text-slate-400')} />
                <span>{item.title}</span>
              </div>
            </Link>
          )
        })}

        {!(!isActive && !isSuperadmin) && (
          <>
            <div className="pt-6 px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Portal Público
            </div>

            <Link
              href={`/club/${tenantSlug}`}
              target="_blank"
              onClick={() => onClose?.()}
              className="flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                <span>Ver Portal Jugador</span>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                En vivo
              </span>
            </Link>
          </>
        )}

        {isSuperadmin && (
          <>
            <div className="pt-6 px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-purple-400">
              SaaS Admin
            </div>
            <Link
              href="/superadmin"
              onClick={() => onClose?.()}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-purple-400 hover:bg-purple-950/30 border border-purple-900/30 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Superadmin Panel</span>
            </Link>
          </>
        )}
      </nav>

      {/* Footer Acciones de Usuario (Redes Sociales, Cambiar Contraseña y Cerrar Sesión) */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 space-y-1">
        <button
          type="button"
          onClick={() => {
            onClose?.()
            window.dispatchEvent(new CustomEvent('open-pwa-install-dialog'))
          }}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-400/90 hover:text-emerald-300 hover:bg-emerald-950/30 transition-colors cursor-pointer group"
          title="Instalar CancharClub en pantalla de inicio"
        >
          <div className="flex items-center gap-3">
            <Smartphone className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>Instalar App Móvil</span>
          </div>
          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
            PWA
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose?.()
            window.dispatchEvent(new CustomEvent('open-social-links-modal'))
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/20 transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4 text-emerald-400/80" />
          <span>Redes Sociales</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose?.()
            window.dispatchEvent(new CustomEvent('open-change-password-modal'))
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-amber-400 hover:bg-amber-950/20 transition-colors cursor-pointer"
        >
          <KeyRound className="w-4 h-4 text-amber-400/80" />
          <span>Cambiar Contraseña</span>
        </button>

        <form 
          action="/auth/logout" 
          method="post" 
          onSubmit={() => {
            try {
              localStorage.removeItem('canchar_today_schedule_snapshot')
              localStorage.removeItem('canchar_cached_tenant_id')
              localStorage.removeItem('canchar_cached_tenant_slug')
              localStorage.removeItem('canchar_active_venue_id')
              localStorage.removeItem('canchar_active_venue_name')
              localStorage.removeItem('canchar_custom_venues')
              localStorage.removeItem('canchar_court_orders')
            } catch {}
            onClose?.()
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </form>
      </div>

      {!isStaff && (
        <CustomizeMenuModal
          isOpen={showCustomizeModal}
          onClose={() => setShowCustomizeModal(false)}
          tenantId={effectiveTenantId}
          availableItems={filteredNavItems.map((i) => ({
            href: i.href,
            title: i.title,
            icon: i.icon,
          }))}
          currentPreferences={preferences}
          onSavePreferences={handleSavePreferences}
        />
      )}
    </aside>
  )
}
