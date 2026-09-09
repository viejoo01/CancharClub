import Link from 'next/link'
import { ShieldCheck, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/shared/theme-toggle'

export const dynamic = 'force-dynamic'

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Superadmin Header */}
      <header className="h-16 border-b border-purple-900/40 bg-slate-950/80 px-6 flex items-center justify-between backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-sm text-white tracking-tight">
              SaaS Central
            </span>
            <span className="text-[10px] text-purple-400 font-bold ml-2 bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-800">
              SUPERADMIN
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />

          <Link href="/dashboard">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-purple-900/50 bg-slate-900 text-purple-300 hover:text-white hover:bg-purple-950/40"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Ir al Panel de Club</span>
            </Button>
          </Link>

          <form action="/auth/logout" method="post">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-xs text-slate-400 hover:text-rose-400"
            >
              Cerrar Sesión
            </Button>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {children}
      </main>
    </div>
  )
}
