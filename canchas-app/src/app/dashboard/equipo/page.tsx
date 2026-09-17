'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  UserCheck,
  ShieldCheck,
  Shield,
  UserPlus,
  Trash2,
  MessageCircle,
  Mail,
  Phone,
  X,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  getClubStaff,
  inviteStaffMember,
  updateStaffRole,
  removeStaffMember,
  type StaffMember,
  type StaffRole,
} from '@/actions/staff.actions'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'

// tenant isolation: useTenantId hook

export default function EquipoPage() {
  const tenantId = useTenantId()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<StaffRole>('TENANT_STAFF')

  const loadStaff = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getClubStaff(tenantId!)
      if (res.success) {
        setStaff(res.staff)
      } else {
        toast.error('Error al cargar equipo')
      }
    } catch {
      toast.error('Error inesperado')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStaff()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadStaff])

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !email.trim()) {
      toast.error('Por favor completá el nombre y el correo.')
      return
    }

    setSubmitting(true)
    try {
      const res = await inviteStaffMember({
        tenantId: tenantId!,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        role,
      })

      if (res.success && res.member) {
        setStaff((prev) => [res.member!, ...prev])
        toast.success(`Colaborador ${res.member.full_name} añadido con éxito`)
        setIsModalOpen(false)
        setFullName('')
        setEmail('')
        setPhone('')
        setRole('TENANT_STAFF')
      } else {
        toast.error(res.error || 'Error al invitar')
      }
    } catch {
      toast.error('Error al procesar la solicitud')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRoleToggle = async (member: StaffMember) => {
    const newRole: StaffRole = member.role === 'TENANT_ADMIN' ? 'TENANT_STAFF' : 'TENANT_ADMIN'
    try {
      const res = await updateStaffRole(member.id, newRole)
      if (res.success) {
        setStaff((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
        )
        toast.success(`Rol de ${member.full_name} actualizado a ${newRole === 'TENANT_ADMIN' ? 'Administrador' : 'Canchero'}`)
      } else {
        toast.error('No se pudo actualizar el rol')
      }
    } catch {
      toast.error('Error al cambiar rol')
    }
  }

  const handleRemove = async (member: StaffMember) => {
    if (!confirm(`¿Estás seguro de que querés revocar el acceso a ${member.full_name}?`)) {
      return
    }

    try {
      const res = await removeStaffMember(member.id)
      if (res.success) {
        setStaff((prev) => prev.filter((m) => m.id !== member.id))
        toast.success(`Acceso de ${member.full_name} revocado`)
      } else {
        toast.error('No se pudo revocar el acceso')
      }
    } catch {
      toast.error('Error al eliminar')
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Equipo y Operadores del Club
            </h1>
            <Badge variant="outline" className="border-sky-500/40 text-sky-400 bg-sky-500/10">
              Multiusuario
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Gestioná los roles y permisos del personal del predio (cancheros, encargados y administradores).
          </p>
        </div>

        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Añadir Colaborador
        </Button>
      </div>

      {/* Explicación de Roles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4 flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-white text-sm">Canchero / Operador de Turno</p>
                <Badge className="bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px]">
                  TENANT_STAFF
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Acceso enfocado a la operación diaria: visualización y carga manual del <strong>Calendario de Turnos</strong>, cobro en <strong>Caja Diaria</strong> y despacho en <strong>Cantina</strong>. No puede ver ni alterar tarifas, canchas ni facturación.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4 flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-white text-sm">Administrador del Club</p>
                <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px]">
                  TENANT_ADMIN
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Control administrativo total: creación y edición de <strong>Canchas</strong>, definición de <strong>Reglas de Precios</strong>, reportes avanzados de ocupación, gestión de personal y configuración de cuentas de cobro.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista del Personal */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <CardTitle className="text-base text-white font-semibold">
            Colaboradores Activos ({staff.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
              <p className="text-sm">Cargando personal del club...</p>
            </div>
          ) : staff.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Shield className="w-10 h-10 text-slate-600 mb-2" />
              <p className="text-sm font-medium">No hay colaboradores registrados.</p>
              <p className="text-xs text-slate-500 mt-1">
                Hacé click en &quot;Añadir Colaborador&quot; para sumar a tus cancheros o encargados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/40 text-slate-400 text-xs">
                    <th className="py-3 px-4">Colaborador</th>
                    <th className="py-3 px-4">Rol Asignado</th>
                    <th className="py-3 px-4">Contacto</th>
                    <th className="py-3 px-4">Fecha de Alta</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {staff.map((member) => {
                    const isAdmin = member.role === 'TENANT_ADMIN'
                    const initials = member.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()

                    const waInvite = member.phone
                      ? `https://wa.me/${member.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `¡Hola ${member.full_name}! Te damos la bienvenida al panel de gestión de CancharClub. Podés ingresar con tu cuenta en: https://cancharclub.com.ar/dashboard`
                        )}`
                      : ''

                    return (
                      <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
                              {initials}
                            </div>
                            <div>
                              <p className="font-medium text-white">{member.full_name}</p>
                              <p className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3 text-slate-500" />
                                {member.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {isAdmin ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                              Administrador
                            </Badge>
                          ) : (
                            <Badge className="bg-sky-500/10 text-sky-400 border border-sky-500/30">
                              <UserCheck className="w-3.5 h-3.5 mr-1" />
                              Canchero / Operador
                            </Badge>
                          )}
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-400 font-mono">
                          {member.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-500" />
                              {member.phone}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-400">
                          {new Date(member.created_at).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRoleToggle(member)}
                              className="border-slate-700 hover:bg-slate-800 text-slate-300 h-8 text-xs"
                              title="Cambiar entre Administrador y Canchero"
                            >
                              Cambiar a {isAdmin ? 'Canchero' : 'Admin'}
                            </Button>

                            {waInvite && (
                              <a
                                href={waInvite}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
                                title="Enviar link de acceso por WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemove(member)}
                              className="text-rose-400 hover:bg-rose-500/10 h-8 w-8 p-0"
                              title="Revocar acceso"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Añadir Colaborador */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <span>Sumar Nuevo Colaborador</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Martín Rodríguez"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  placeholder="canchero@club.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Teléfono / WhatsApp (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: 3816551122"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Rol y Permisos
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('TENANT_STAFF')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      role === 'TENANT_STAFF'
                        ? 'bg-sky-500/10 border-sky-500/50 text-white'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <p className="text-xs font-bold text-sky-400">Canchero</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Solo Calendario, Caja y Cantina
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('TENANT_ADMIN')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      role === 'TENANT_ADMIN'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <p className="text-xs font-bold text-emerald-400">Administrador</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Acceso total a tarifas y gestión
                    </p>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="border-slate-700 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar Colaborador'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


