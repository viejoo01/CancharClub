'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trophy, Mail, Lock, Phone, Building2, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { registerClub } from '@/actions/auth.actions'
import { toast } from 'sonner'

export default function RegisterPage() {
  const [clubName, setClubName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData()
    formData.append('clubName', clubName)
    formData.append('email', email)
    formData.append('phone', phone)
    formData.append('password', password)

    try {
      const res = await registerClub(formData)
      if (res && !res.success) {
        toast.error(res.error || 'Error al registrar el club')
        setLoading(false)
      }
    } catch {
      // Manejado por redirect
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
              Configurá tu tenant B2B en la plataforma
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
                    onChange={(e) => setClubName(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email Administrativo *</Label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="contacto@padelnorte.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
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
