'use client'

import { Plus, CheckCircle2, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { VenueSwitcher } from './venue-switcher'

interface HeaderProps {
  onQuickBookClick?: () => void
  onToggleMobileMenu?: () => void
  mpConnected?: boolean
  userName?: string
  tenantName?: string
}

export function Header({
  onQuickBookClick,
  onToggleMobileMenu,
  mpConnected = true,
  userName = 'Administrador',
  tenantName,
}: HeaderProps) {
  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-3 sm:px-6 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md relative z-40">
      <div className="flex items-center gap-2.5 sm:gap-4">
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

        {/* Mejora 19: Selector de Sede / Sucursal Multisede */}
        <VenueSwitcher tenantName={tenantName} />

        {mpConnected ? (
          <Badge variant="default" className="gap-1.5 py-0.5 sm:py-1 text-[11px] sm:text-xs hidden sm:inline-flex bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
            <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Mercado Pago</span> Activo
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 py-0.5 sm:py-1 text-[11px] sm:text-xs hidden sm:inline-flex border-slate-700 bg-slate-900/60 text-slate-300">
            <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Cobros</span> Activos
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onQuickBookClick && (
          <Button
            onClick={onQuickBookClick}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md shadow-emerald-950/40 gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Turno</span>
          </Button>
        )}

        <ThemeToggle />

        <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-slate-300 font-medium hidden md:inline">
            {userName}
          </span>
        </div>
      </div>
    </header>
  )
}
