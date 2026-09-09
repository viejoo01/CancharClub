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
  BarChart3
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  tenantName?: string
  tenantSlug?: string
  userRole?: string
}

export function Sidebar({ 
  tenantName = 'Club Deportivo', 
  tenantSlug = 'demo-club',
  userRole = 'ADMIN' 
}: SidebarProps) {
  const pathname = usePathname()

  const navItems = [
    {
      title: 'Calendario de Turnos',
      href: '/dashboard',
      icon: CalendarDays,
      exact: true,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
    },
    {
      title: 'Turnos Fijos (Abonados)',
      href: '/dashboard/fijos',
      icon: Repeat,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      badge: 'Plan 3c+',
    },
    {
      title: 'Cantina & Kiosco',
      href: '/dashboard/cantina',
      icon: Coffee,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      badge: 'Plan 2c+',
    },
    {
      title: 'Caja Diaria',
      href: '/dashboard/caja',
      icon: Wallet,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
    },
    {
      title: 'Control de Luces',
      href: '/dashboard/luces',
      icon: Zap,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'ADMIN'],
      badge: 'Plan 3c+',
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
      badge: 'Plan 5c+',
    },
    {
      title: 'Reportes de Ocupación',
      href: '/dashboard/reportes',
      icon: BarChart3,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
      badge: 'Plan 3c+',
    },
    {
      title: 'Mi Plan SaaS',
      href: '/dashboard/plan',
      icon: CreditCard,
      roles: ['SUPERADMIN', 'TENANT_ADMIN', 'ADMIN'],
    },
  ]

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true
    return item.roles.includes(userRole)
  })

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-slate-950 border-r border-slate-800/80 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800/80 bg-slate-950/50">
        <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
          <Trophy className="w-5 h-5 text-white" />
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="font-bold text-sm text-white truncate tracking-tight">
            {tenantName}
          </span>
          {userRole === 'TENANT_STAFF' ? (
            <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Canchero (Turnos y Cantina)
            </span>
          ) : userRole === 'SUPERADMIN' ? (
            <span className="text-[10px] text-purple-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              Superadmin Plataforma
            </span>
          ) : (
            <span className="text-[10px] text-emerald-400/90 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Dueño del Club
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {userRole === 'TENANT_STAFF' ? 'Operaciones de Canchero' : 'Operaciones'}
        </div>

        {filteredNavItems.map((item) => {
          const isActive = item.exact 
            ? pathname === item.href 
            : pathname.startsWith(item.href)

          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-950/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn('w-4 h-4', isActive ? 'text-emerald-400' : 'text-slate-400')} />
                <span>{item.title}</span>
              </div>
              {'badge' in item && item.badge && (
                <span className="text-[9px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}

        <div className="pt-6 px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Portal Público
        </div>

        <Link
          href={`/club/${tenantSlug}`}
          target="_blank"
          className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
            <span>Ver Portal Jugador</span>
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
            En vivo
          </span>
        </Link>

        {userRole === 'SUPERADMIN' && (
          <>
            <div className="pt-6 px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-purple-400">
              SaaS Admin
            </div>
            <Link
              href="/superadmin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-purple-400 hover:bg-purple-950/30 border border-purple-900/30 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Superadmin Panel</span>
            </Link>
          </>
        )}
      </nav>

      {/* Footer Profile & Logout */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
