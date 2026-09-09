'use client'

import { Plus, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/shared/theme-toggle'

interface HeaderProps {
  onQuickBookClick?: () => void
  mpConnected?: boolean
  userName?: string
}

export function Header({
  onQuickBookClick,
  mpConnected = true,
  userName = 'Administrador'
}: HeaderProps) {
  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <h1 className="text-base font-semibold text-slate-100 hidden sm:block">
          Gestión Operativa
        </h1>
        {mpConnected ? (
          <Badge variant="default" className="gap-1.5 py-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Mercado Pago</span> Activo
          </Badge>
        ) : (
          <Badge variant="warning" className="gap-1.5 py-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            MP Desconectado
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
