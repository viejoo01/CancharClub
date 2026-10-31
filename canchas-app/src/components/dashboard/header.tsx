'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Plus, CheckCircle2, Menu, KeyRound, LogOut, ChevronDown, Share2, Sparkles, Smartphone, PanelLeftClose, PanelLeftOpen, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { NotificationsDropdown } from './notifications-dropdown'
import { VenueSwitcher } from './venue-switcher'
import { useUserRole } from '@/hooks/use-tenant-id'
import { clearClientSensitiveStorage } from '@/lib/storage-cleanup'

interface HeaderProps {
  onQuickBookClick?: () => void
  onToggleMobileMenu?: () => void
  onToggleSidebar?: () => void
  isSidebarCollapsed?: boolean
  mpConnected?: boolean
  userName?: string
  tenantName?: string
  tenantId?: string | null
  courtsCount?: number
  sports?: string[]
  isTrial?: boolean
  trialDaysRemaining?: number
  trialDueDate?: string
}

export function Header({
  onQuickBookClick,
  onToggleMobileMenu,
  onToggleSidebar,
  isSidebarCollapsed = false,
  mpConnected = false,
  userName = 'Administrador',
  tenantName,
  tenantId,
  courtsCount,
  sports,
  isTrial = false,
  trialDaysRemaining,
  trialDueDate,
}: HeaderProps) {
  const { isOwner } = useUserRole()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Atajo de teclado global Ctrl+K o / para enfocar la barra de búsqueda rápida
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    window.dispatchEvent(new CustomEvent('canchar-search-bookings', { detail: { query: val } }))
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    window.dispatchEvent(new CustomEvent('canchar-search-bookings', { detail: { query: '' } }))
  }

  const handleTriggerQuickBook = () => {
    if (onQuickBookClick) {
      onQuickBookClick()
    } else {
      window.dispatchEvent(new CustomEvent('open-quick-booking-modal'))
    }
  }

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleOpenSocialLinks = () => {
    setUserMenuOpen(false)
    window.dispatchEvent(new CustomEvent('open-social-links-modal'))
  }

  const handleOpenChangePassword = () => {
    setUserMenuOpen(false)
    window.dispatchEvent(new CustomEvent('open-change-password-modal'))
  }

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-3 sm:px-6 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/90 dark:bg-[#0B0F19]/90 backdrop-blur-md shadow-2xs relative z-40 transition-colors">
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
        {/* Botón menú hamburguesa para celulares */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] border border-slate-200/80 dark:border-white/[0.08] transition-colors cursor-pointer"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Botón para ocultar / mostrar menú lateral en Desktop */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden md:flex p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 bg-slate-100/70 hover:bg-slate-200/70 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] border border-slate-200/80 dark:border-white/[0.08] transition-all cursor-pointer items-center justify-center group"
            title={isSidebarCollapsed ? "Mostrar menú lateral" : "Ocultar menú lateral"}
            aria-label={isSidebarCollapsed ? "Mostrar menú lateral" : "Ocultar menú lateral"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
            ) : (
              <PanelLeftClose className="w-5 h-5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
            )}
          </button>
        )}

        <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white hidden xl:block tracking-tight shrink-0">
          Gestión Operativa
        </h1>

        {/* Selector de Sede / Sucursal Multisede */}
        <VenueSwitcher 
          tenantName={tenantName} 
          tenantId={tenantId}
          initialCourtsCount={courtsCount}
          initialSports={sports}
        />

        {/* Badge de Prueba Gratuita (15 días) */}
        {isTrial && (
          isOwner ? (
            <Link 
              href="/dashboard/plan" 
              title={trialDueDate ? `Período de prueba gratuita de 15 días activo ($0 hoy). Vence el ${trialDueDate}` : 'Período de prueba gratuita de 15 días activo ($0 hoy)'}
            >
              <Badge variant="outline" className="gap-1.5 py-1 px-2.5 text-[11px] hidden 2xl:inline-flex bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20 transition-colors cursor-pointer rounded-full shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                <span>
                  Prueba 15 Días: <strong className="text-slate-900 dark:text-white font-mono">{typeof trialDaysRemaining === 'number' ? `${trialDaysRemaining}d restantes` : 'Activa'}</strong>
                </span>
              </Badge>
            </Link>
          ) : (
            <Badge variant="outline" className="gap-1.5 py-1 px-2.5 text-[11px] hidden 2xl:inline-flex bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 cursor-default rounded-full shadow-2xs" title="Período de prueba del club activo">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>
                Prueba 15 Días: <strong className="text-slate-900 dark:text-white font-mono">{typeof trialDaysRemaining === 'number' ? `${trialDaysRemaining}d restantes` : 'Activa'}</strong>
              </span>
            </Badge>
          )
        )}

        {mpConnected ? (
          isOwner ? (
            <Link href="/dashboard/cobros" title="Mercado Pago activo para cobro online de señas con tarjeta">
              <Badge variant="default" className="gap-1.5 py-1 px-2.5 text-[11px] hidden 2xl:inline-flex bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors cursor-pointer rounded-full shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Tarjetas Online</span>
              </Badge>
            </Link>
          ) : (
            <Badge variant="default" className="gap-1.5 py-1 px-2.5 text-[11px] hidden 2xl:inline-flex bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 cursor-default rounded-full shadow-2xs" title="Mercado Pago activo para cobro online de señas">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Tarjetas Online</span>
            </Badge>
          )
        ) : null}
      </div>

      {/* Buscador de reservas y clientes estilo Command Center 24" */}
      <div className="hidden md:flex items-center relative max-w-xs xl:max-w-sm w-full mx-2 lg:mx-4">
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar turno o cliente..."
            className="w-full pl-8 pr-12 py-1.5 text-xs rounded-xl bg-slate-100/80 dark:bg-[#111827]/80 border border-slate-200/80 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/60 transition-all shadow-2xs"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden lg:inline-flex items-center gap-0.5 absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded pointer-events-none shadow-2xs">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Live Status Badge */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 select-none shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
          <span>ONLINE</span>
        </div>

        <Button
          onClick={handleTriggerQuickBook}
          size="sm"
          className="bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-sm hover:shadow-md hover:shadow-emerald-500/20 gap-1.5 cursor-pointer rounded-xl text-xs h-9 px-3.5 transition-all duration-150 active:scale-95"
          title="Crear nueva reserva manual (Atajo: tecla N)"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nuevo Turno</span>
          <kbd className="hidden sm:inline-flex ml-0.5 px-1 py-0.2 rounded bg-white/20 text-white text-[9px] font-mono">N</kbd>
        </Button>

        <NotificationsDropdown tenantId={tenantId} />

        <ThemeToggle />

        <div className="h-4 w-px bg-slate-200 dark:border-white/[0.08] mx-0.5 hidden sm:block" />

        {/* Menú de Usuario / Perfil con Cambiar Contraseña */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 sm:px-2 sm:py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.05] border border-transparent hover:border-slate-200/80 dark:hover:border-white/[0.08] transition-colors cursor-pointer text-left"
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300 shadow-2xs">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold hidden md:inline truncate max-w-32">
              {userName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 hidden md:block" />
          </button>

          {/* Dropdown flotante */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-white/[0.08] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-white/[0.06] mb-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{userName}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{tenantName || 'CancharClub'}</p>
              </div>

              <button
                type="button"
                onClick={handleOpenSocialLinks}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
              >
                <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Redes Sociales</span>
              </button>

              <button
                type="button"
                onClick={handleOpenChangePassword}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
              >
                <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Cambiar Contraseña</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false)
                  window.dispatchEvent(new CustomEvent('open-pwa-install-dialog'))
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Instalar App Móvil</span>
                </div>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 px-1 rounded font-bold">
                  PWA
                </span>
              </button>

              <div className="h-px bg-slate-100 dark:bg-slate-800/80 my-1" />

              <form 
                action="/auth/logout" 
                method="post"
                onSubmit={() => {
                  setIsLoggingOut(true)
                  clearClientSensitiveStorage()
                }}
              >
                <button
                  type="submit"
                  disabled={isLoggingOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer text-left disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoggingOut ? (
                    <Loader2 className="w-4 h-4 animate-spin text-rose-600 dark:text-rose-400 shrink-0" />
                  ) : (
                    <LogOut className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isLoggingOut ? 'Cerrando sesión...' : 'Cerrar Sesión'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

