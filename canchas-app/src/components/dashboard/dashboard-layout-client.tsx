'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  CalendarDays, 
  Wallet, 
  Coffee, 
  Layers, 
  Menu,
  AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { TrialBanner } from './trial-banner'
import { PlanActivationModal } from './plan-activation-modal'
import { PlanExpirationAlert } from './plan-expiration-alert'
import { AutoDebitAlertModal } from './auto-debit-alert-modal'
import { ChangePasswordModal } from './change-password-modal'
import { ClubSocialLinksModal } from './club-social-links-modal'
import { cn } from '@/lib/utils'
import type { SaaSPlanId } from '@/config/saas-plans'
import type { TenantSubscriptionStatus } from '@/types/database'

interface DashboardLayoutClientProps {
  tenantId?: string | null
  tenantName: string
  tenantSlug: string
  userRole: string
  userName: string
  mpConnected: boolean
  planId?: SaaSPlanId
  isActive: boolean
  hasCard?: boolean
  courtsCount?: number
  sports?: string[]
  gracePeriodBanner?: React.ReactNode
  children: React.ReactNode
  dueDate?: string
  daysRemaining?: number
  subscriptionStatus?: TenantSubscriptionStatus
  monthlyFeeArs?: number
  isTrial?: boolean
  trialDaysRemaining?: number
  trialDueDate?: string
  trialForfeited?: boolean
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
  hasCard,
  courtsCount,
  sports,
  gracePeriodBanner,
  children,
  dueDate,
  daysRemaining,
  isTrial,
  trialDaysRemaining,
  trialDueDate,
  trialForfeited,
}: DashboardLayoutClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showActivationModal, setShowActivationModal] = useState(false)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [showSocialLinksModal, setShowSocialLinksModal] = useState(false)
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

  // Escuchar evento personalizado para abrir el modal de cambio de contraseña
  useEffect(() => {
    const handleOpenPwd = () => setShowChangePasswordModal(true)
    window.addEventListener('open-change-password-modal', handleOpenPwd)
    return () => window.removeEventListener('open-change-password-modal', handleOpenPwd)
  }, [])

  // Escuchar evento personalizado para abrir el modal de redes sociales
  useEffect(() => {
    const handleOpenSocial = () => setShowSocialLinksModal(true)
    window.addEventListener('open-social-links-modal', handleOpenSocial)
    return () => window.removeEventListener('open-social-links-modal', handleOpenSocial)
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
    ...(planId === 'CHICO_1' ? [] : [
      {
        title: 'Cantina',
        href: '/dashboard/cantina',
        icon: Coffee,
        exact: false,
      },
    ]),
    ...(isStaff ? [] : [
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
      {/* ─── 1. SIDEBAR DESKTOP ─── */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          tenantName={tenantName}
          tenantSlug={tenantSlug}
          userRole={userRole}
          isActive={isActive}
          planId={planId}
          isTrial={isTrial}
          trialDaysRemaining={trialDaysRemaining}
          trialDueDate={trialDueDate || dueDate}
        />
      </div>

      {/* ─── 2. DRAWER MÓVIL (Off-canvas en celulares) ─── */}
      <>
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
              isTrial={isTrial}
              trialDaysRemaining={trialDaysRemaining}
              trialDueDate={trialDueDate || dueDate}
            />
          </div>
        </>

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
          isTrial={isTrial}
          trialDaysRemaining={trialDaysRemaining}
          trialDueDate={trialDueDate || dueDate}
        />

        {/* Modal de cambio de contraseña para dueño y encargado */}
        <ChangePasswordModal
          isOpen={showChangePasswordModal}
          onOpenChange={setShowChangePasswordModal}
          userName={userName}
          userRole={userRole}
        />

        {/* Modal de configuración de redes sociales del club */}
        {tenantId && (
          <ClubSocialLinksModal
            isOpen={showSocialLinksModal}
            onClose={() => setShowSocialLinksModal(false)}
            tenantId={tenantId}
            clubSlug={tenantSlug}
          />
        )}

        <main className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 md:p-6 pb-24 md:pb-6 bg-linear-to-b from-slate-950 to-slate-900/80 custom-scrollbar relative">
          {/* Banner visual prominente de 15 Días de Prueba Gratuita */}
          {isTrial && (
            <TrialBanner
              daysRemaining={typeof trialDaysRemaining === 'number' ? trialDaysRemaining : 15}
              dueDate={trialDueDate || dueDate || ''}
              hasCard={hasCard}
              tenantId={tenantId}
            />
          )}

          {/* Banner de Aviso: Prueba Gratuita Revocada por Reactivación */}
          {trialForfeited && !isTrial && (
            <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 text-xs shadow-lg shadow-amber-950/20 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-amber-300 block text-sm">
                    Plan Reactivado — Comienza a Cobrarse tu Abono Mensual
                  </span>
                  <span className="text-slate-300 text-xs">
                    Al reactivar el servicio tras la solicitud de baja por arrepentimiento, se dio por finalizada la prueba gratuita de 15 días. Tu abono mensual se encuentra activo.
                  </span>
                </div>
              </div>
              <Link href="/dashboard/plan" className="shrink-0 self-end sm:self-center">
                <Button size="sm" variant="outline" className="h-8 text-xs border-amber-500/40 bg-amber-950/30 text-amber-300 hover:bg-amber-900/50 hover:text-white rounded-xl">
                  Ver Mi Plan
                </Button>
              </Link>
            </div>
          )}

          {isActive && !isTrial && gracePeriodBanner}

          {/* Modal de vinculación de tarjeta para activar plan */}
          <PlanActivationModal
            isOpen={showActivationModal}
            onOpenChange={setShowActivationModal}
            tenantName={tenantName}
            tenantId={tenantId}
            planId={planId}
          />

          {/* Alerta Progresiva Emergente de Vencimiento de Plan (3, 2, 1 días) con botón Entendido */}
          <PlanExpirationAlert
            tenantId={tenantId}
            dueDate={dueDate}
            daysRemaining={daysRemaining}
          />

          {/* Alerta de Débito Automático (Cobro Fallido o Exitoso) con botón Entendido */}
          <AutoDebitAlertModal
            tenantId={tenantId}
          />

          <div className="relative w-full">
            <div className="w-full">
              {children}
            </div>

            {/* Pie de página con copyright */}
            <footer className="mt-12 pt-6 pb-4 border-t border-slate-800/60 text-center text-xs text-slate-500 select-none">
              <p>© 2026 CancharClub. Todos los derechos reservados.</p>
            </footer>
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
