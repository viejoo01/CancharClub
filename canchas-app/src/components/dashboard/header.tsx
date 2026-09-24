'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Plus, CheckCircle2, Menu, Wallet, KeyRound, LogOut, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { VenueSwitcher } from './venue-switcher'

import { CancharClubIcon } from '@/components/shared/canchar-club-logo'

interface HeaderProps {
  onQuickBookClick?: () => void
  onToggleMobileMenu?: () => void
  mpConnected?: boolean
  userName?: string
  tenantName?: string
  tenantId?: string | null
  courtsCount?: number
  sports?: string[]
  isClubPaused?: boolean
}

export function Header({
  onQuickBookClick,
  onToggleMobileMenu,
  mpConnected = false,
  userName = 'Administrador',
  tenantName,
  tenantId,
  courtsCount,
  sports,
  isClubPaused = false,
}: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  const handleOpenChangePassword = () => {
    setUserMenuOpen(false)
    window.dispatchEvent(new CustomEvent('open-change-password-modal'))
  }

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-3 sm:px-6 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md relative z-40">
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* En estado pausado o sin toggle: mostrar logo directo de CancharClub */}
        {isClubPaused ? (
          <div className="flex items-center gap-2.5">
            <CancharClubIcon className="w-7 h-7" />
            <span className="font-black text-base tracking-tight text-slate-100 hidden sm:inline">
              Canchar<span className="text-emerald-400">Club</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              Club Pausado
            </span>
          </div>
        ) : (
          <>
            {/* Botón menú hamburguesa para celulares */}
            {onToggleMobileMenu && (
              <button
                type="button"
                onClick={onToggleMobileMenu}
                className="md:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                aria-label="Abrir menú de navegación"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <h1 className="text-sm sm:text-base font-semibold text-slate-100 hidden lg:block">
              Gestión Operativa
            </h1>

            {/* Selector de Sede / Sucursal Multisede */}
            <VenueSwitcher 
              tenantName={tenantName} 
              tenantId={tenantId}
              initialCourtsCount={courtsCount}
              initialSports={sports}
            />

            {mpConnected ? (
              <Link href="/dashboard/cobros" title="Mercado Pago activo para cobro online de señas con tarjeta">
                <Badge variant="default" className="gap-1.5 py-0.5 sm:py-1 text-[11px] sm:text-xs hidden sm:inline-flex bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 transition-colors cursor-pointer">
                  <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
                  <span className="hidden md:inline">MP Señas:</span> Tarjetas Online
                </Badge>
              </Link>
            ) : (
              <Link href="/dashboard/cobros" title="Señas de turnos configuradas para recibir por transferencia directa o alias">
                <Badge variant="outline" className="gap-1.5 py-0.5 sm:py-1 text-[11px] sm:text-xs hidden sm:inline-flex border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer">
                  <Wallet className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-400" />
                  <span className="hidden md:inline">Señas:</span> Transferencia / Alias
                </Badge>
              </Link>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onQuickBookClick && (
          <Button
            onClick={onQuickBookClick}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md shadow-emerald-950/40 gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Turno</span>
          </Button>
        )}

        <ThemeToggle />

        <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

        {/* Menú de Usuario / Perfil con Cambiar Contraseña */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 sm:px-2 sm:py-1 rounded-xl hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors cursor-pointer text-left"
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
          >
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-slate-300 font-medium hidden md:inline truncate max-w-32">
              {userName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 hidden md:block" />
          </button>

          {/* Dropdown flotante */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                <p className="text-xs font-bold text-white truncate">{userName}</p>
                <p className="text-[11px] text-slate-400 truncate">{tenantName || 'CancharClub'}</p>
              </div>

              <button
                type="button"
                onClick={handleOpenChangePassword}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-left"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Cambiar Contraseña</span>
              </button>

              <div className="h-px bg-slate-800/80 my-1" />

              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-950/20 transition-colors cursor-pointer text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar Sesión</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

