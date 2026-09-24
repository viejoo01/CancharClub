'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  CalendarDays, 
  Wallet, 
  Coffee, 
  Layers, 
  Menu 
} from 'lucide-react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { PlanActivationModal } from './plan-activation-modal'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { SaaSPlanId } from '@/config/saas-plans'

interface DashboardLayoutClientProps {
  tenantId?: string | null
  tenantName: string
  tenantSlug: string
  userRole: string
  userName: string
  mpConnected: boolean
  planId?: SaaSPlanId
  isActive: boolean
  courtsCount?: number
  sports?: string[]
  gracePeriodBanner?: React.ReactNode
  children: React.ReactNode
  pendingScreen?: React.ReactNode
}

export function DashboardLayoutClient({
  tenantId,
  tenantName,
  tenantSlug,
  userRole,
  userName,
  mpConnected,
  planId,
  isActive,
  courtsCount,
  sports,
  gracePeriodBanner,
  children,
  pendingScreen,
}: DashboardLayoutClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showActivationModal, setShowActivationModal] = useState(!isActive)
  const pathname = usePathname()

  // Cerrar menú móvil automáticamente al navegar a otra ruta (patrón oficial React docs)
  const [currentPath, setCurrentPath] = useState(pathname)
  if (currentPath !== pathname) {
    setCurrentPath(pathname)
    setMobileMenuOpen(false)
  }

  // Escuchar evento personalizado para abrir el modal de activación desde cualquier componente
  useEffect(() => {
    const handleOpen = () => setShowActivationModal(true)
    window.addEventListener('open-activation-modal', handleOpen)
    return () => window.removeEventListener('open-activation-modal', handleOpen)
  }, [])

  // Prevenir scroll en el fondo cuando el drawer móvil está abierto
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  const isStaff = userRole === 'TENANT_STAFF'

  // Items rápidos para la barra de navegación inferior en celulares
  const quickBottomNav = [
    {
      title: 'Turnos',
      href: '/dashboard',
      icon: CalendarDays,
      exact: true,
    },
    {
      title: 'Caja',
      href: '/dashboard/caja',
      icon: Wallet,
      exact: false,
    },
    ...(isStaff ? [] : [
      {
        title: 'Cantina',
        href: '/dashboard/cantina',
        icon: Coffee,
        exact: false,
      },
      {
        title: 'Canchas',
        href: '/dashboard/canchas',
        icon: Layers,
        exact: false,
      }
    ]),
  ]

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100 relative">
      {/* ─── 1. SIDEBAR DESKTOP (visible sólo en md y superior) ─── */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          tenantName={tenantName}
          tenantSlug={tenantSlug}
          userRole={userRole}
          isActive={isActive}
          planId={planId}
        />
      </div>

      {/* ─── 2. DRAWER MÓVIL (Off-canvas en celulares) ─── */}
      {/* Backdrop con desenfoque */}
      <div
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          'fixed inset-0 z-50 bg-black/70 backdrop-blur-xs transition-opacity duration-300 md:hidden cursor-pointer',
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden="true"
      />

      {/* Panel deslizante lateral */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-950 border-r border-slate-800 shadow-2xl transition-transform duration-300 ease-out md:hidden flex flex-col',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar
          tenantName={tenantName}
          tenantSlug={tenantSlug}
          userRole={userRole}
          isActive={isActive}
          planId={planId}
          isMobile={true}
          onClose={() => setMobileMenuOpen(false)}
        />
      </div>

      {/* ─── 3. ÁREA PRINCIPAL DE CONTENIDO ─── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        <Header
          userName={userName}
          tenantName={tenantName}
          tenantId={tenantId}
          courtsCount={courtsCount}
          sports={sports}
          mpConnected={mpConnected}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
        />

        {isActive && gracePeriodBanner}

        {/* Modal obligatorio de vinculación de tarjeta para activar plan */}
        <PlanActivationModal
          isOpen={!isActive && showActivationModal}
          onOpenChange={setShowActivationModal}
          tenantName={tenantName}
          tenantId={tenantId}
          planId={planId}
        />

        <main className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 md:p-6 pb-24 md:pb-6 bg-linear-to-b from-slate-950 to-slate-900/80 custom-scrollbar relative">
          {!isActive && pendingScreen}

          <div className="relative w-full">
            {!isActive && (
              <div
                onClick={() => {
                  setShowActivationModal(true)
                  toast.error('Tarjeta requerida para operar', {
                    description: 'Para habilitar turnos, reservas y cobros, vinculá tu tarjeta de débito o crédito (15 días gratis, $0 hoy).',
                  })
                }}
                className="absolute inset-0 z-30 bg-black/5 cursor-not-allowed select-none rounded-xl"
                title="Para usar las funciones de CancharClub, vinculá tu tarjeta de débito o crédito."
              />
            )}
            <div className={cn("w-full transition-all", !isActive && "pointer-events-none select-none opacity-85")}>
              {children}
            </div>
          </div>
        </main>

        {/* ─── 4. BARRA DE NAVEGACIÓN INFERIOR (BOTTOM BAR) PARA CELULARES ─── */}
        <nav 
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-2 pt-1.5 flex items-center justify-around shadow-2xl select-none"
          style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
          aria-label="Navegación inferior móvil"
        >
            {quickBottomNav.map((item) => {
              const isActiveRoute = item.exact 
                ? pathname === item.href 
                : pathname.startsWith(item.href)
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-150 min-w-14',
                    isActiveRoute
                      ? 'text-emerald-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  <div className={cn(
                    'p-1 rounded-lg transition-colors',
                    isActiveRoute ? 'bg-emerald-500/15' : 'bg-transparent'
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] tracking-tight mt-0.5">
                    {item.title}
                  </span>
                </Link>
              )
            })}

            {/* Botón rápido "Más / Menú" para abrir el drawer completo con un toque del pulgar */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-400 hover:text-slate-200 transition-all duration-150 min-w-14 cursor-pointer"
              aria-label="Ver todas las opciones"
            >
              <div className="p-1 rounded-lg hover:bg-slate-900">
                <Menu className="w-5 h-5 text-indigo-400" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 text-indigo-400 font-medium">
                Más
              </span>
            </button>
          </nav>
      </div>
    </div>
  )
}
