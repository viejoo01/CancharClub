'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldCheck, LayoutDashboard, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  async function handleLogout() {
    try {
      await fetch('/api/superadmin/login', { method: 'DELETE' })
    } catch {}
    router.push('/superadmin/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Superadmin Header */}
      <header className="h-16 border-b border-purple-900/40 bg-slate-950/80 px-3 sm:px-6 flex items-center justify-between backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-xs sm:text-sm text-white tracking-tight whitespace-nowrap">
              SaaS Central
            </span>
            <span className="text-[9px] sm:text-[10px] text-purple-400 font-bold bg-purple-950/80 px-1 sm:px-1.5 py-0.5 rounded border border-purple-800">
              SUPERADMIN
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link href="/dashboard">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-purple-900/50 bg-slate-900 text-purple-300 hover:text-white hover:bg-purple-950/40 h-8 px-2 sm:px-3"
              title="Ir al Panel de Club"
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Ir al Panel de Club</span>
              <span className="sm:hidden">Panel Club</span>
            </Button>
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-rose-400 h-8 px-2 sm:px-3 flex items-center gap-1 cursor-pointer"
            title="Cerrar Sesión Superadmin"
          >
            <LogOut className="w-3.5 h-3.5 sm:hidden" />
            <span className="hidden sm:inline">Cerrar Sesión</span>
            <span className="sm:hidden">Salir</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-6 max-w-7xl w-full mx-auto space-y-4 sm:space-y-6">
        {children}
      </main>
    </div>
  )
}
