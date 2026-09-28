'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trophy, Mail, Lock, Phone, Building2, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { registerClub } from '@/actions/auth.actions'
import { toast } from 'sonner'

export default function RegisterPage() {
  const router = useRouter()
  const [clubName, setClubName] = useState('')
  const [emailPrefix, setEmailPrefix] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleClubNameChange = (val: string) => {
    setClubName(val)
    const slug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
    setEmailPrefix(slug)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanPrefix = emailPrefix.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
    
    if (!cleanPrefix) {
      toast.error('Por favor ingresá un usuario para el email de tu club.')
      return
    }

    const fullEmail = `${cleanPrefix}@club.com`

    setLoading(true)

    const formData = new FormData()
    formData.append('clubName', clubName)
    formData.append('email', fullEmail)
    formData.append('phone', phone)
    formData.append('password', password)
    formData.append('planId', 'MEDIANO_2')

    try {
      const res = await registerClub(formData)
      if (res && !res.success) {
        toast.error(res.error || 'Error al registrar el club')
        setLoading(false)
      } else {
        router.push('/onboarding/tarjeta')
      }
    } catch {
      // Manejado por redirect
      router.push('/onboarding/tarjeta')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 items-center justify-center shadow-xl shadow-emerald-950/50 mb-1">
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Registrar mi Club
          </h1>
          <p className="text-xs text-slate-400">
            Comenzá a gestionar tus canchas y reservas en minutos
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
          <CardHeader className="pb-4 text-center">
            <CardTitle className="text-lg">Crear Cuenta de Club</CardTitle>
            <CardDescription className="text-xs">
              Configurá el acceso y panel exclusivo para tu club
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="clubName">Nombre del Club o Complejo *</Label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <Input
                    id="clubName"
                    placeholder="Ej. Pádel Norte Tucumán"
                    value={clubName}
                    onChange={(e) => handleClubNameChange(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="emailPrefix">Email Administrativo *</Label>
                  <span className="text-[10px] text-emerald-400 font-semibold font-mono">
                    @club.com
                  </span>
                </div>
                <div className="flex items-center w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all">
                  <div className="pl-3 text-slate-500 flex items-center pointer-events-none">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="emailPrefix"
                    type="text"
                    required
                    placeholder="nombreclub"
                    value={emailPrefix}
                    onChange={(e) => {
                      const raw = e.target.value.toLowerCase().split('@')[0]
                      setEmailPrefix(raw.replace(/[^a-z0-9._-]/g, ''))
                    }}
                    className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none lowercase font-mono"
                  />
                  <div className="px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-emerald-400 bg-slate-900 border-l border-slate-800 select-none whitespace-nowrap flex items-center font-mono">
                    @club.com
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>Con este correo ingresarás al sistema:</span>
                  <span className="text-emerald-400 font-mono font-medium">
                    {emailPrefix.trim() ? `${emailPrefix.trim()}@club.com` : 'tuclub@club.com'}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono Celular (WhatsApp de Reservas) *</Label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Ej. 3814556677"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña *</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Al menos 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    minLength={6}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 shadow-lg shadow-emerald-950/40"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Dar de Alta Club</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="text-center text-xs text-slate-400 pt-4">
              ¿Ya tenés cuenta?{' '}
              <Link href="/auth/login" className="text-emerald-400 font-semibold hover:underline">
                Iniciar sesión
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
