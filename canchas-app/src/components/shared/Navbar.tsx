import Link from 'next/link'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Phone, LayoutDashboard, Shield } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { ThemeToggle } from '@/components/shared/theme-toggle'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">

      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo Canchar */}
        <Logo iconSize="md" showTagline={true} />

        {/* Enlaces de Navegación */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <Link
            href="/club/padel-central"
            className="hover:text-emerald-400 transition-colors flex items-center gap-1.5"
          >
            <span>Portal de Reservas</span>
            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 px-1.5 py-0">
              Público
            </Badge>
          </Link>
          <Link
            href="/dashboard"
            className="hover:text-emerald-400 transition-colors flex items-center gap-1.5"
          >
            <LayoutDashboard className="w-4 h-4 text-slate-400" />
            <span>Panel de Gestión</span>
          </Link>
          <Link
            href="/dashboard/plan"
            className="hover:text-emerald-400 transition-colors"
          >
            Tarifas & Planes
          </Link>
          <Link
            href="/superadmin"
            className="hover:text-purple-400 transition-colors flex items-center gap-1"
          >
            <Shield className="w-3.5 h-3.5 text-purple-400" />
            <span>Superadmin</span>
          </Link>
        </nav>

        {/* Acciones & Ingreso */}
        <div className="flex items-center gap-2.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 rounded-xl"
          >
            <a
              href={siteConfig.links.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Soporte</span>
            </a>
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="text-xs font-semibold border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-200 rounded-xl"
          >
            <Link href="/auth/login">
              Ingresar
            </Link>
          </Button>

          <ThemeToggle />

          <Button
            asChild
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-950/40 gap-1.5"
          >
            <Link href="/dashboard">
              <span>Ir al Panel</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
