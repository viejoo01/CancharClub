'use client'

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
  Monitor,
  KeyRound,
  Share2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SAAS_PLANS, type SaaSPlanId, type SaaSFeatureKey } from '@/config/saas-plans'

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
  tenantName?: string
  tenantSlug?: string
  userRole?: string
  isActive?: boolean
  planId?: SaaSPlanId
  isMobile?: boolean
  onClose?: () => void
}

export function Sidebar({ 
  tenantName = 'Mi Club Deportivo', 
  tenantSlug = 'mi-club',
  userRole = 'ADMIN',
  isActive = true,
  planId,
  isMobile = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname()

  const navItems: NavItem[] = [
    {
      title: 'Calendario de Turnos',
      href: '/dashboard',
      icon: CalendarDays,
      exact: true,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      staffVisible: true,   // SIEMPRE visible para el canchero
      // Sin requiredFeature → siempre disponible para admins también
    },
    {
      title: 'Turnos Fijos (Abonados)',
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
      staffVisible: true,   // SIEMPRE visible para el canchero
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
      title: 'Facturación AFIP',
      href: '/dashboard/facturacion',
      icon: Receipt,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
      requiredFeature: 'facturacion_afip',
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
      title: 'Torneos y Cuadros',
      href: '/dashboard/torneos',
      icon: Trophy,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      requiredFeature: 'torneos_expres',
      staffVisible: true,
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
    {
      title: 'Tótem / Kiosco Mostrador',
      href: '/totem',
      icon: Monitor,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      staffVisible: true,
    },
  ]

  const isStaff = userRole === 'TENANT_STAFF'
  const isSuperadmin = userRole === 'SUPERADMIN'
  const effectivePlanId: SaaSPlanId = planId || 'MEDIANO_2'
  const currentPlan = SAAS_PLANS[effectivePlanId] || SAAS_PLANS.MEDIANO_2
  const planAllowedFeatures = currentPlan.allowedModules

  const filteredNavItems = navItems.filter(item => {
    // 1. Filtrar por rol de usuario
    if (!item.roles.includes(userRole)) return false

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
                Encargado (Turnos y Caja)
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
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {isStaff ? 'Operaciones de Encargado' : 'Operaciones'}
        </div>

        {filteredNavItems.map((item) => {
          const isActive_item = item.exact 
            ? pathname === item.href 
            : pathname.startsWith(item.href)

          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onClose?.()}
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
              localStorage.removeItem('canchar_cached_tenant_id')
              localStorage.removeItem('canchar_active_venue_id')
              localStorage.removeItem('canchar_active_venue_name')
              localStorage.removeItem('canchar_custom_venues')
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
    </aside>
  )
}
