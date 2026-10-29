'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error Boundary]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] px-4 text-center">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/20 backdrop-blur-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="absolute -inset-1 rounded-2xl bg-rose-500/10 blur-xl -z-10" />
      </div>

      <h2 className="text-xl font-bold text-white tracking-tight mb-2">
        Se produjo un problema al cargar el panel
      </h2>

      <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
        No se pudieron sincronizar temporalmente los datos con el servidor. Tus reservas, cobros y estado de caja permanecen completamente seguros.
      </p>

      {error.digest && (
        <div className="mb-6 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-500 max-w-xs truncate">
          ID de Diagnóstico: {error.digest}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-emerald-950/30 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar conexión
        </button>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800/90 hover:bg-slate-700/90 active:bg-slate-800 text-slate-200 text-sm font-medium rounded-lg border border-slate-700/60 transition-all focus:outline-none focus:ring-2 focus:ring-slate-600/40"
        >
          <Home className="w-4 h-4 text-slate-400" />
          Ir al Inicio
        </Link>
      </div>
    </div>
  )
}
