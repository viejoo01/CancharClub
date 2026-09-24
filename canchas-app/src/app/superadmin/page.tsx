'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Building2, 
  DollarSign, 
  Calendar, 
  Plus, 
  CheckCircle2, 
  Check,
  ExternalLink,
  Search,
  ShieldCheck,
  Send,
  Calculator,
  Receipt,
  Pencil,
  Trash2,
  Users,
  UserPlus,
  Coffee,
  Copy,
  Sparkles,
  MessageSquare,
  LogIn,
  Eye,
  EyeOff,
  Smartphone,
  CreditCard,
  RefreshCw,
  Gift
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatARS, setClientCookie, cn } from '@/lib/utils'
import { calculateClubSaaSFee, calculateSaaSMultiplier, calculateReactivationFee } from '@/lib/saas-pricing'
import { SAAS_PLANS, SAAS_PLANS_LIST, getPlanByCourtsCount, type SaaSPlanId } from '@/config/saas-plans'
import { createClient } from '@/lib/supabase/client'
import { 
  getSuperadminTenants, 
  activateTenantAccess, 
  deactivateTenantAccess, 
  deleteTenantById, 
  getSuperadminUsers, 
  deleteProfileById, 
  updateUserPasswordBySuperadmin,
  createUserBySuperadmin,
  generateUserImpersonationUrl,
  updateTenantSubscriptionStatusAction,
  activateTenantTrialPeriodAction,
  type SuperadminUserItem, 
  type SuperadminTenantItem 
} from '@/actions/superadmin.actions'
import { recordClubSubscriptionPayment } from '@/actions/saas-billing.actions'
import { toast } from 'sonner'

export interface ClubUser {
  id: string
  name: string
  email: string
  phone: string
  role: 'TENANT_ADMIN' | 'TENANT_STAFF'
  tenantId: string
  tenantName: string
  tenantSlug: string
  password: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
}

export default function SuperadminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'BILLING' | 'TENANTS' | 'USERS'>('USERS')

  // Listado de clubes con sus parámetros para la fórmula proporcional y plan asignado
  const [tenants, setTenants] = useState<SuperadminTenantItem[]>([])

  const [searchTerm, setSearchTerm] = useState('')
  const [subscriptionFilter, setSubscriptionFilter] = useState<'ALL' | 'AL_DIA' | 'PENDIENTE' | 'PAUSADO' | 'PRUEBA'>('ALL')
  const [tenantSearchTerm, setTenantSearchTerm] = useState('')
  const [tenantStatusFilter, setTenantStatusFilter] = useState<'ALL' | 'ACTIVE' | 'TRIAL' | 'PENDING'>('ALL')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newClubName, setNewClubName] = useState('')
  const [newCity, setNewCity] = useState('San Miguel de Tucumán')
  const [newCourts, setNewCourts] = useState('2')
  const [newMaxPrice, setNewMaxPrice] = useState('30000')
  const [newPlanId, setNewPlanId] = useState<SaaSPlanId>('MEDIANO_2')

  // Estado para modal de edición de club
  const [editingTenant, setEditingTenant] = useState<{
    id: string
    name: string
    slug: string
    city: string
    active_courts: number
    highest_slot_price: number
    status: string
    subscription_status: 'AL_DIA' | 'PENDIENTE' | 'PAUSADO'
    mp_connected: boolean
    plan_id: SaaSPlanId
    is_active: boolean
  } | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Estado para modal rápido de activación de club y asignación de plan
  const [activatingTenant, setActivatingTenant] = useState<{
    id: string
    name: string
    active_courts: number
    plan_id: SaaSPlanId
  } | null>(null)
  const [isActivating, setIsActivating] = useState(false)

  // Estado para modal de activación de período de prueba (15 días)
  const [activatingTrialTenant, setActivatingTrialTenant] = useState<SuperadminTenantItem | null>(null)
  const [isActivatingTrial, setIsActivatingTrial] = useState(false)
  const [trialDaysToSet, setTrialDaysToSet] = useState(15)

  // Listado de usuarios administradores y cancheros por club (se carga desde Supabase)
  const [clubUsers, setClubUsers] = useState<ClubUser[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Cargar datos reales y frescos desde Supabase
  const loadData = async (showToast = false) => {
    setIsRefreshing(true)
    try {
      const clubsRes = await getSuperadminTenants()
      if (clubsRes.success) {
        setTenants(clubsRes.data)
      }

      const usersRes = await getSuperadminUsers()
      if (usersRes.success && usersRes.data.length > 0) {
        const mapped: ClubUser[] = usersRes.data.map((u: SuperadminUserItem) => ({
          id: u.id,
          name: u.full_name,
          email: u.email,
          phone: u.phone || '',
          role: (u.role === 'SUPERADMIN' ? 'TENANT_ADMIN' : u.role) as 'TENANT_ADMIN' | 'TENANT_STAFF',
          tenantId: u.tenant_id || '',
          tenantName: u.tenant_name || 'Sin club',
          tenantSlug: u.tenant_slug || '',
          password: u.password || 'Elite123',
          status: 'ACTIVE' as const,
          createdAt: u.created_at?.split('T')[0] || '',
        }))
        setClubUsers(mapped)
      }
      if (showToast) {
        toast.success('Datos actualizados en tiempo real desde la base de datos')
      }
    } catch (err) {
      console.error('Error al sincronizar datos superadmin:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Sincronización en tiempo real y sondeo periódico cada 30 segundos
  useEffect(() => {
    let isMounted = true

    const fetchInitialData = async () => {
      try {
        const clubsRes = await getSuperadminTenants()
        if (isMounted && clubsRes.success) {
          setTenants(clubsRes.data)
        }

        const usersRes = await getSuperadminUsers()
        if (isMounted && usersRes.success && usersRes.data.length > 0) {
          const mapped: ClubUser[] = usersRes.data.map((u: SuperadminUserItem) => ({
            id: u.id,
            name: u.full_name,
            email: u.email,
            phone: u.phone || '',
            role: (u.role === 'SUPERADMIN' ? 'TENANT_ADMIN' : u.role) as 'TENANT_ADMIN' | 'TENANT_STAFF',
            tenantId: u.tenant_id || '',
            tenantName: u.tenant_name || 'Sin club',
            tenantSlug: u.tenant_slug || '',
            password: u.password || 'Elite123',
            status: 'ACTIVE' as const,
            createdAt: u.created_at?.split('T')[0] || '',
          }))
          setClubUsers(mapped)
        }
      } catch (err) {
        console.error('Error initial load superadmin:', err)
      }
    }

    void fetchInitialData()

    const interval = setInterval(() => {
      void fetchInitialData()
    }, 30000)

    const handleFocus = () => void fetchInitialData()
    window.addEventListener('focus', handleFocus)

    return () => {
      isMounted = false
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const handleOpenActivate = (t: typeof tenants[0]) => {
    setActivatingTenant({
      id: t.id,
      name: t.name,
      active_courts: t.active_courts,
      plan_id: t.plan_id || getPlanByCourtsCount(t.active_courts).id,
    })
  }

  const handleConfirmActivation = async () => {
    if (!activatingTenant) return
    setIsActivating(true)
    try {
      const res = await activateTenantAccess(activatingTenant.id, activatingTenant.plan_id)
      if (res.success) {
        setTenants(prev => prev.map(t => {
          if (t.id === activatingTenant.id) {
            return {
              ...t,
              is_active: true,
              status: 'ACTIVE',
              subscription_status: 'AL_DIA',
              plan_id: activatingTenant.plan_id,
            }
          }
          return t
        }))
        toast.success(`¡Club "${activatingTenant.name}" HABILITADO con éxito!`, {
          description: `Se activó en producción con el plan de ${activatingTenant.active_courts} canchas.`
        })
        setActivatingTenant(null)
      } else {
        toast.error('Error al habilitar club: ' + (res.error || ''))
      }
    } catch {
      toast.error('Error de conexión al habilitar club')
    } finally {
      setIsActivating(false)
    }
  }

  const handleConfirmTrialActivation = async () => {
    if (!activatingTrialTenant) return
    setIsActivatingTrial(true)
    try {
      const res = await activateTenantTrialPeriodAction(activatingTrialTenant.id, trialDaysToSet)
      if (res.success) {
        const trialEnds = res.trialEndsAt || new Date(Date.now() + trialDaysToSet * 86400000).toISOString()
        setTenants(prev => prev.map(t => {
          if (t.id === activatingTrialTenant.id) {
            return {
              ...t,
              is_active: true,
              status: 'ACTIVE',
              subscription_status: 'AL_DIA',
              is_trial: true,
              trial_ends_at: trialEnds,
              trial_days_remaining: trialDaysToSet,
            }
          }
          return t
        }))
        toast.success(`¡Periodo de prueba (${trialDaysToSet} días) activado para "${activatingTrialTenant.name}"!`, {
          description: `El club tiene acceso total habilitado hasta el ${new Date(trialEnds).toLocaleDateString('es-AR')}.`
        })
        setActivatingTrialTenant(null)
      } else {
        toast.error('Error al activar periodo de prueba: ' + (res.error || ''))
      }
    } catch {
      toast.error('Error de conexión al activar periodo de prueba')
    } finally {
      setIsActivatingTrial(false)
    }
  }

  const handleToggleDeactivate = async (tenantId: string, clubName: string) => {
    const res = await deactivateTenantAccess(tenantId)
    if (!res.success) {
      toast.error('Error al pausar club: ' + (res.error || ''))
      return
    }
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, is_active: false, status: 'PENDING', subscription_status: 'PENDIENTE' } : t))
    toast.info(`Club "${clubName}" pausado temporalmente`, {
      description: 'El club ahora está en modo de vista previa restringida.'
    })
  }

  const handleTogglePause = async (tenantId: string, clubName: string, currentStatus: 'AL_DIA' | 'PENDIENTE' | 'PAUSADO') => {
    const newStatus: 'AL_DIA' | 'PENDIENTE' | 'PAUSADO' = currentStatus === 'PAUSADO' ? 'AL_DIA' : 'PAUSADO'
    const res = await updateTenantSubscriptionStatusAction(tenantId, newStatus)
    if (!res.success) {
      toast.error('Error al cambiar estado de pausa: ' + (res.error || ''))
      return
    }
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, subscription_status: newStatus } : t))
    if (newStatus === 'PAUSADO') {
      toast.warning(`Club "${clubName}" puesto EN PAUSA`, {
        description: 'Las reservas públicas online han sido pausadas temporalmente por no abonar la suscripción a tiempo.'
      })
    } else {
      toast.success(`Club "${clubName}" REANUDADO`, {
        description: 'El club ahora está Al Día y sus reservas públicas online están habilitadas nuevamente.'
      })
    }
  }

  // Cálculos SaaS basados en la fórmula y plan asignado
  const tenantsWithPricing = tenants.map(t => {
    const pricing = calculateClubSaaSFee(t.active_courts, t.highest_slot_price, t.created_at, t.trial_ends_at)
    return { 
      ...t, 
      pricing: {
        ...pricing,
        planId: t.plan_id || pricing.planId,
        planName: (t.plan_id ? SAAS_PLANS[t.plan_id]?.name : null) || pricing.planName
      } 
    }
  })

  const totalMRR = tenantsWithPricing.reduce((acc, t) => acc + t.pricing.monthlyFeeArs, 0)
  const totalCourts = tenants.reduce((acc, t) => acc + t.active_courts, 0)
  const upToDateCount = tenants.filter(t => t.subscription_status === 'AL_DIA').length
  const pendingCount = tenants.filter(t => t.subscription_status === 'PENDIENTE').length
  const pausedCount = tenants.filter(t => t.subscription_status === 'PAUSADO').length
  const trialCount = tenants.filter(t => Boolean(t.is_trial)).length

  const filteredTenants = tenantsWithPricing.filter(t => {
    const term = searchTerm.toLowerCase().trim()
    const matchesSearch = !term ||
      t.name.toLowerCase().includes(term) ||
      t.slug.toLowerCase().includes(term) ||
      (t.city && t.city.toLowerCase().includes(term))
    if (!matchesSearch) return false
    if (subscriptionFilter === 'AL_DIA') return t.subscription_status === 'AL_DIA'
    if (subscriptionFilter === 'PENDIENTE') return t.subscription_status === 'PENDIENTE'
    if (subscriptionFilter === 'PAUSADO') return t.subscription_status === 'PAUSADO'
    if (subscriptionFilter === 'PRUEBA') return Boolean(t.is_trial)
    return true
  })

  const directoryTenants = tenantsWithPricing.filter(t => {
    const term = tenantSearchTerm.toLowerCase().trim()
    const matchesSearch = !term ||
      t.name.toLowerCase().includes(term) ||
      t.slug.toLowerCase().includes(term) ||
      (t.city && t.city.toLowerCase().includes(term))
    if (!matchesSearch) return false
    if (tenantStatusFilter === 'ACTIVE') return t.is_active && !t.is_trial
    if (tenantStatusFilter === 'TRIAL') return Boolean(t.is_trial)
    if (tenantStatusFilter === 'PENDING') return !t.is_active
    return true
  })

  const handleRegisterPayment = async (tenantId: string, clubName: string, amount: number) => {
    try {
      const res = await recordClubSubscriptionPayment(tenantId, `Cobro mensual de ${formatARS(amount)} registrado desde Superadmin`)
      if (res.success) {
        setTenants(prev => prev.map(t => {
          if (t.id === tenantId) {
            return {
              ...t,
              subscription_status: 'AL_DIA',
              last_paid: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            }
          }
          return t
        }))
        toast.success(`Pago mensual registrado para ${clubName}`, {
          description: `Se acreditó la cuota mensual de ${formatARS(amount)} en la base de datos.`
        })
      } else {
        toast.error('Error al registrar pago en base de datos: ' + (res.error || ''))
      }
    } catch (err) {
      console.error(err)
      toast.error('Error al registrar pago')
    }
  }

  const handleSendPaymentLink = (clubName: string, amount: number) => {
    toast.info(`Link de cobro generado para ${clubName}`, {
      description: `Orden de pago de ${formatARS(amount)} copiada al portapapeles para enviar por WhatsApp o email.`
    })
  }

  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClubName.trim()) return

    const slug = newClubName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const courtsNum = Number(newCourts) || 2
    const created = {
      id: `t-${Date.now()}`,
      name: newClubName,
      slug,
      city: newCity,
      active_courts: courtsNum,
      highest_slot_price: Number(newMaxPrice) || 30000,
      total_bookings: 0,
      mp_connected: false,
      status: 'ACTIVE',
      subscription_status: 'PENDIENTE' as const,
      last_paid: null,
      plan_id: newPlanId || getPlanByCourtsCount(courtsNum).id,
      is_active: true,
    }

    setTenants(prev => [...prev, created])
    setIsModalOpen(false)
    setNewClubName('')
    toast.success(`Club "${newClubName}" creado exitosamente`, {
      description: `Plan: ${SAAS_PLANS[created.plan_id]?.name || created.plan_id}. Fórmula: ${calculateSaaSMultiplier(created.active_courts)} turnos ($${(created.highest_slot_price * calculateSaaSMultiplier(created.active_courts)).toLocaleString('es-AR')}/mes).`
    })
  }

  const handleOpenEdit = (t: typeof tenants[0]) => {
    setEditingTenant({
      id: t.id,
      name: t.name,
      slug: t.slug,
      city: t.city,
      active_courts: t.active_courts,
      highest_slot_price: t.highest_slot_price,
      status: t.status,
      subscription_status: t.subscription_status,
      mp_connected: t.mp_connected,
      plan_id: t.plan_id || getPlanByCourtsCount(t.active_courts).id,
      is_active: t.is_active !== false,
    })
    setIsEditModalOpen(true)
  }

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTenant || !editingTenant.name.trim()) return

    const sanitizedSlug = editingTenant.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '')
    const activeCourts = Math.max(1, Number(editingTenant.active_courts) || 1)
    const highestPrice = Math.max(1000, Number(editingTenant.highest_slot_price) || 10000)

    setTenants(prev => prev.map(t => {
      if (t.id === editingTenant.id) {
        return {
          ...t,
          name: editingTenant.name,
          slug: sanitizedSlug || t.slug,
          city: editingTenant.city,
          active_courts: activeCourts,
          highest_slot_price: highestPrice,
          status: editingTenant.status,
          subscription_status: editingTenant.subscription_status,
          mp_connected: editingTenant.mp_connected,
          plan_id: editingTenant.plan_id,
          is_active: editingTenant.is_active,
        }
      }
      return t
    }))

    try {
      if (editingTenant.is_active) {
        if (editingTenant.subscription_status === 'PAUSADO') {
          await updateTenantSubscriptionStatusAction(editingTenant.id, 'PAUSADO')
        } else if (editingTenant.subscription_status === 'AL_DIA') {
          await activateTenantAccess(editingTenant.id, editingTenant.plan_id)
        } else {
          await updateTenantSubscriptionStatusAction(editingTenant.id, 'PENDIENTE')
        }
      } else {
        await deactivateTenantAccess(editingTenant.id)
      }
      const supabase = createClient()
      await supabase
        .from('tenants')
        .update({
          name: editingTenant.name,
          slug: sanitizedSlug || editingTenant.slug,
          city: editingTenant.city,
          is_active: editingTenant.is_active,
        })
        .eq('id', editingTenant.id)
    } catch {
      // Ignorar en modo local/demo
    }

    setIsEditModalOpen(false)
    const planDef = SAAS_PLANS[editingTenant.plan_id]
    const newMultiplier = calculateSaaSMultiplier(activeCourts)
    const newFee = highestPrice * newMultiplier

    toast.success(`Club "${editingTenant.name}" actualizado con éxito`, {
      description: `Plan: ${planDef?.name || editingTenant.plan_id} (${editingTenant.is_active ? 'Habilitado' : 'Bloqueado/Pendiente'}). Tarifa: ${formatARS(newFee)}/mes.`
    })
  }

  const handleDeleteTenant = async (tenantId: string, clubName: string) => {
    if (confirm(`¿Estás seguro de que deseas dar de baja o eliminar el club "${clubName}" de la base de datos? Esta acción es irreversible.`)) {
      const res = await deleteTenantById(tenantId)
      if (!res.success) {
        toast.error(res.error || `Error al eliminar "${clubName}"`)
        return
      }
      setTenants(prev => prev.filter(t => t.id !== tenantId))
      setIsEditModalOpen(false)
      toast.success(`Club "${clubName}" eliminado permanentemente del sistema`)
    }
  }

  // Filtros de usuarios
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | 'TENANT_ADMIN' | 'TENANT_STAFF'>('ALL')
  const [userClubFilter, setUserClubFilter] = useState<string>('ALL')

  // Modales de usuario individual
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
  const [newUserTenantId, setNewUserTenantId] = useState('t1')
  const [newUserRole, setNewUserRole] = useState<'TENANT_ADMIN' | 'TENANT_STAFF'>('TENANT_ADMIN')
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPhone, setNewUserPhone] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('club2026')

  // Edición de usuario
  const [editingUser, setEditingUser] = useState<ClubUser | null>(null)
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false)

  // Modal de confirmación de eliminación de usuario (reemplaza window.confirm)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ id: string; name: string } | null>(null)
  const [loadingDeleteUserId, setLoadingDeleteUserId] = useState<string | null>(null)

  // Revelar contraseñas
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({})

  // Modal Alta Rápida 3-en-1 (Club + Dueño + Canchero)
  const [isQuickWizardModalOpen, setIsQuickWizardModalOpen] = useState(false)
  const [wizardClubName, setWizardClubName] = useState('')
  const [wizardCity, setWizardCity] = useState('San Miguel de Tucumán')
  const [wizardCourts, setWizardCourts] = useState('2')
  const [wizardMaxPrice, setWizardMaxPrice] = useState('30000')
  const [wizardPlanId, setWizardPlanId] = useState<SaaSPlanId>('MEDIANO_2')

  const [wizardOwnerName, setWizardOwnerName] = useState('')
  const [wizardOwnerEmail, setWizardOwnerEmail] = useState('')
  const [wizardOwnerPhone, setWizardOwnerPhone] = useState('')
  const [wizardOwnerPassword, setWizardOwnerPassword] = useState('admin123')

  const [wizardStaffName, setWizardStaffName] = useState('')
  const [wizardStaffEmail, setWizardStaffEmail] = useState('')
  const [wizardStaffPhone, setWizardStaffPhone] = useState('')
  const [wizardStaffPassword, setWizardStaffPassword] = useState('canchero123')

  const [wizardResult, setWizardResult] = useState<{
    clubName: string
    owner: ClubUser
    staff: ClubUser
  } | null>(null)
  const [isWizardResultModalOpen, setIsWizardResultModalOpen] = useState(false)

  const handleTogglePassword = (userId: string) => {
    setRevealedPasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }))
  }

  const handleCopyWhatsAppMessage = (user: ClubUser) => {
    const roleTitle = user.role === 'TENANT_ADMIN' ? 'Dueño del Club (Administrador)' : 'Encargado (Turnos y Cantina)'
    const rolePermissions = user.role === 'TENANT_ADMIN'
      ? 'Control total del predio: canchas, reglas de precios, reportes de ocupación y facturación SaaS.'
      : 'Control operativo: calendario de turnos en vivo, turnos fijos de abonados, cantina/kiosco y caja diaria.'

    const message = `🎾 *¡Hola ${user.name}! Te damos la bienvenida a Canchar Club.*

Tu usuario para gestionar *${user.tenantName}* ya está activo:
🔗 *Portal de Acceso:* https://cancharclub.com.ar/auth/login
👤 *Email:* ${user.email}
🔑 *Contraseña:* ${user.password}
🛡️ *Rol asignado:* ${roleTitle}

📌 *Tus funciones habilitadas:*
${rolePermissions}

Por cualquier duda sobre la plataforma, podés escribirnos por este medio. ¡A romperla en la cancha!`

    navigator.clipboard.writeText(message)
    toast.success(`Datos de acceso de ${user.name} copiados`, {
      description: 'Mensaje formateado listo para enviar por WhatsApp.'
    })
  }

  const [loggingInUserId, setLoggingInUserId] = useState<string | null>(null)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [isUpdatingUser, setIsUpdatingUser] = useState(false)

  const handleLoginAsUser = async (user: ClubUser) => {
    setLoggingInUserId(user.id)
    try {
      const assignedTenant = tenants.find(t => t.id === user.tenantId || t.slug === user.tenantSlug)
      setClientCookie('demo_user_role', user.role)
      setClientCookie('demo_user_name', encodeURIComponent(user.name))
      setClientCookie('demo_tenant_name', encodeURIComponent(user.tenantName))
      setClientCookie('demo_tenant_slug', encodeURIComponent(user.tenantSlug))
      if (assignedTenant) {
        setClientCookie('canchar_tenant_id', assignedTenant.id)
        setClientCookie('demo_tenant_id', assignedTenant.id)
        setClientCookie('demo_plan_id', assignedTenant.plan_id)
        setClientCookie('demo_is_active', assignedTenant.is_active !== false ? 'true' : 'false')
      }

      const appOrigin = typeof window !== 'undefined' ? window.location.origin : undefined
      const linkRes = await generateUserImpersonationUrl(user.id, appOrigin)

      if (linkRes.success && linkRes.url) {
        toast.success(`Ingresando al panel de ${user.tenantName}...`, {
          description: `Sesión autenticada generada como ${user.email}. Abriendo panel en nueva pestaña.`
        })
        window.open(linkRes.url, '_blank')
      } else {
        toast.info(`Ingresando al panel de ${user.tenantName}`, {
          description: `Modo directo: ${user.role === 'TENANT_ADMIN' ? 'Dueño' : 'Encargado'}`
        })
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      console.error('Error al ingresar como usuario:', err)
      toast.error('Error al generar enlace de acceso directo')
      router.push('/dashboard')
    } finally {
      setLoggingInUserId(null)
    }
  }

  const handleSimulateClub = (t: typeof tenants[0], role: 'TENANT_ADMIN' | 'TENANT_STAFF' = 'TENANT_ADMIN') => {
    setClientCookie('canchar_tenant_id', t.id)
    setClientCookie('demo_tenant_id', t.id)
    setClientCookie('demo_user_role', role)
    setClientCookie('demo_user_name', encodeURIComponent(role === 'TENANT_ADMIN' ? 'Dueño ' + t.name : 'Encargado ' + t.name))
    setClientCookie('demo_tenant_name', encodeURIComponent(t.name))
    setClientCookie('demo_tenant_slug', encodeURIComponent(t.slug))
    setClientCookie('demo_plan_id', t.plan_id)
    setClientCookie('demo_is_active', t.is_active !== false ? 'true' : 'false')
    toast.success(`Ingresando a ${t.name}`, {
      description: `Modo: ${role === 'TENANT_ADMIN' ? 'Dueño' : 'Encargado'} | Plan: ${SAAS_PLANS[t.plan_id]?.name || t.plan_id} (${t.is_active !== false ? 'Activo' : 'Pendiente'})`
    })
    router.push('/dashboard')
    router.refresh()
  }

  const handleToggleUserStatus = (userId: string) => {
    setClubUsers(prev => prev.map(u => {
      if (u.id === userId) {
        const nextStatus = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
        toast.info(`Usuario ${u.name} ahora está ${nextStatus === 'ACTIVE' ? 'Activo' : 'Inactivo'}`)
        return { ...u, status: nextStatus }
      }
      return u
    }))
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error('Completá los campos obligatorios.')
      return
    }

    setIsCreatingUser(true)
    try {
      const assignedTenant = tenants.find(t => t.id === newUserTenantId) || tenants[0]
      const res = await createUserBySuperadmin({
        name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        phone: newUserPhone.trim() || '+54 9 381 000-0000',
        role: newUserRole,
        tenantId: assignedTenant ? assignedTenant.id : '',
        password: newUserPassword.trim(),
      })

      if (!res.success || !res.userId) {
        toast.error('Error al crear usuario en Supabase: ' + (res.error || ''))
        return
      }

      const newUser: ClubUser = {
        id: res.userId,
        name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        phone: newUserPhone.trim() || '+54 9 381 000-0000',
        role: newUserRole,
        tenantId: assignedTenant?.id || '',
        tenantName: assignedTenant?.name || 'Club',
        tenantSlug: assignedTenant?.slug || '',
        password: newUserPassword.trim(),
        status: 'ACTIVE',
        createdAt: new Date().toISOString().split('T')[0]
      }

      setClubUsers(prev => [newUser, ...prev])
      setIsCreateUserModalOpen(false)
      setNewUserName('')
      setNewUserEmail('')
      setNewUserPhone('')
      setNewUserPassword('')

      toast.success(`Usuario "${newUser.name}" creado con éxito`, {
        description: `Asignado a ${newUser.tenantName} con clave persistida en el sistema.`
      })
    } catch (err) {
      console.error('Error al crear usuario:', err)
      toast.error('Error inesperado al crear usuario')
    } finally {
      setIsCreatingUser(false)
    }
  }

  const handleOpenEditUser = (user: ClubUser) => {
    setEditingUser({ ...user })
    setIsEditUserModalOpen(true)
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    setIsUpdatingUser(true)
    try {
      if (editingUser.password?.trim()) {
        const pwdRes = await updateUserPasswordBySuperadmin(editingUser.id, editingUser.password.trim())
        if (!pwdRes.success) {
          toast.error('Error al actualizar contraseña: ' + (pwdRes.error || ''))
        }
      }

      const supabase = createClient()
      const assignedTenant = tenants.find(t => t.id === editingUser.tenantId) || tenants[0]
      await supabase
        .from('profiles')
        .update({
          full_name: editingUser.name,
          phone: editingUser.phone,
          role: editingUser.role,
          tenant_id: editingUser.tenantId,
        })
        .eq('id', editingUser.id)

      const updated: ClubUser = {
        ...editingUser,
        tenantName: assignedTenant?.name || editingUser.tenantName,
        tenantSlug: assignedTenant?.slug || editingUser.tenantSlug,
      }

      setClubUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
      setIsEditUserModalOpen(false)
      toast.success(`Usuario "${updated.name}" actualizado correctamente`, {
        description: 'Se guardaron los datos y la contraseña en la base de datos.'
      })
    } catch (err) {
      console.error(err)
      toast.error('Error al guardar cambios del usuario')
    } finally {
      setIsUpdatingUser(false)
    }
  }

  const handleDeleteUser = (userId: string, userName: string) => {
    // Abre el modal de confirmación propio (window.confirm es poco confiable)
    setConfirmDeleteUser({ id: userId, name: userName })
  }

  const handleConfirmDeleteUser = async () => {
    if (!confirmDeleteUser) return
    const { id, name } = confirmDeleteUser
    setLoadingDeleteUserId(id)
    setConfirmDeleteUser(null)

    const res = await deleteProfileById(id)

    setLoadingDeleteUserId(null)

    if (!res.success) {
      toast.error(`Error al eliminar a "${name}"`, {
        description: res.error || 'Intentá nuevamente.'
      })
      return
    }

    // Actualizar estado local
    setClubUsers(prev => prev.filter(u => u.id !== id))
    // Cerrar modal de edición si estaba abierto para este usuario
    if (editingUser?.id === id) {
      setIsEditUserModalOpen(false)
      setEditingUser(null)
    }
    toast.success(`Usuario "${name}" eliminado correctamente`)
  }

  const handleQuickWizardSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!wizardClubName.trim() || !wizardOwnerName.trim() || !wizardOwnerEmail.trim()) {
      toast.error('Completá los datos del club y del dueño.')
      return
    }

    const tenantSlug = wizardClubName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const newTenantId = `t-${Date.now()}`
    const activeCourts = Math.max(1, Number(wizardCourts) || 2)
    const highestPrice = Math.max(1000, Number(wizardMaxPrice) || 30000)

    const createdTenant = {
      id: newTenantId,
      name: wizardClubName.trim(),
      slug: tenantSlug,
      city: wizardCity.trim(),
      active_courts: activeCourts,
      highest_slot_price: highestPrice,
      total_bookings: 0,
      mp_connected: false,
      status: 'ACTIVE',
      subscription_status: 'PENDIENTE' as const,
      last_paid: null,
      plan_id: getPlanByCourtsCount(activeCourts).id,
      is_active: true,
    }

    const createdOwner: ClubUser = {
      id: `u-${Date.now()}-1`,
      name: wizardOwnerName.trim(),
      email: wizardOwnerEmail.trim().toLowerCase(),
      phone: wizardOwnerPhone.trim() || '+54 9 381 555-0001',
      role: 'TENANT_ADMIN',
      tenantId: newTenantId,
      tenantName: createdTenant.name,
      tenantSlug: createdTenant.slug,
      password: wizardOwnerPassword.trim() || 'admin123',
      status: 'ACTIVE',
      createdAt: new Date().toISOString().split('T')[0]
    }

    const staffName = wizardStaffName.trim() || `Encargado ${createdTenant.name}`
    const staffEmail = wizardStaffEmail.trim().toLowerCase() || `encargado@${createdTenant.slug}.com`
    const createdStaff: ClubUser = {
      id: `u-${Date.now()}-2`,
      name: staffName,
      email: staffEmail,
      phone: wizardStaffPhone.trim() || '+54 9 381 555-0002',
      role: 'TENANT_STAFF',
      tenantId: newTenantId,
      tenantName: createdTenant.name,
      tenantSlug: createdTenant.slug,
      password: wizardStaffPassword.trim() || 'canchero123',
      status: 'ACTIVE',
      createdAt: new Date().toISOString().split('T')[0]
    }

    setTenants(prev => [createdTenant, ...prev])
    setClubUsers(prev => [createdOwner, createdStaff, ...prev])
    setIsQuickWizardModalOpen(false)

    setWizardResult({
      clubName: createdTenant.name,
      owner: createdOwner,
      staff: createdStaff
    })
    setIsWizardResultModalOpen(true)

    // Reset wizard fields
    setWizardClubName('')
    setWizardOwnerName('')
    setWizardOwnerEmail('')
    setWizardOwnerPhone('')
    setWizardStaffName('')
    setWizardStaffEmail('')
    setWizardStaffPhone('')
    setWizardPlanId('MEDIANO_2')

    toast.success(`¡Club "${createdTenant.name}", Dueño y Encargado creados!`, {
      description: 'Ya podés copiar los accesos para enviar por WhatsApp.'
    })
  }

  // Filtrado de usuarios
  const filteredUsers = clubUsers.filter(u => {
    const matchesSearch = 
      u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.tenantName.toLowerCase().includes(userSearchTerm.toLowerCase())
    
    const matchesRole = userRoleFilter === 'ALL' || u.role === userRoleFilter
    const matchesClub = userClubFilter === 'ALL' || u.tenantId === userClubFilter

    return matchesSearch && matchesRole && matchesClub
  })

  const ownerCount = clubUsers.filter(u => u.role === 'TENANT_ADMIN').length
  const staffCount = clubUsers.filter(u => u.role === 'TENANT_STAFF').length
  const activeUserCount = clubUsers.filter(u => u.status === 'ACTIVE').length

  const trialExpirationPreview = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + trialDaysToSet)
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  }, [trialDaysToSet])

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1 sm:px-2">
      {/* Header Superior y Barra de Acciones */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-xl shadow-black/20">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-[11px] font-semibold tracking-wider uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Superadmin Central</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400 font-normal normal-case">Sistema CancharClub SaaS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Gestión de Clubes, Dueños y Cobranzas
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            Supervisá predios inquilinos, asigná accesos a dueños y encargados, y controlá períodos de prueba y facturación SaaS.
          </p>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <Button
            onClick={() => void loadData(true)}
            disabled={isRefreshing}
            variant="outline"
            className="h-10 px-3 text-xs border-slate-800 bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl cursor-pointer transition-colors"
            title="Sincronizar base de datos en tiempo real"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isRefreshing && "animate-spin text-indigo-400")} />
            <span className="hidden sm:inline">Sincronizar</span>
          </Button>

          <Button 
            onClick={() => setIsModalOpen(true)}
            variant="outline"
            className="h-10 px-3.5 text-xs border-slate-700/80 hover:border-indigo-500/60 bg-slate-950/90 text-slate-200 hover:text-white rounded-xl font-medium cursor-pointer transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1 text-indigo-400 shrink-0" />
            <span>Nuevo Club</span>
          </Button>

          <Button 
            onClick={() => setIsCreateUserModalOpen(true)}
            className="h-10 px-3.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md shadow-emerald-950/40 cursor-pointer transition-all"
          >
            <UserPlus className="w-4 h-4 mr-1.5 shrink-0" />
            <span>Crear Usuario</span>
          </Button>

          <Button
            onClick={() => setIsQuickWizardModalOpen(true)}
            className="h-10 px-4 text-xs font-bold bg-linear-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white shadow-lg shadow-purple-950/40 rounded-xl cursor-pointer border border-purple-400/25 transition-all"
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-yellow-300 shrink-0" />
            <span>⚡ Alta Rápida Completa</span>
          </Button>
        </div>
      </div>

      {/* Ribbon HUD: Reglas de Negocio, Fórmula SaaS y Roles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-linear-to-br from-indigo-950/40 via-slate-900/60 to-slate-950/80 border border-indigo-500/20 backdrop-blur-md flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
            <Calculator className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase text-indigo-300 tracking-wider block">Fórmula de Cuota SaaS</span>
            <span className="text-xs font-mono font-bold text-white truncate block">
              Turno Más Caro × (0.5 × Canchas + 0.5)
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-linear-to-br from-emerald-950/30 via-slate-900/60 to-slate-950/80 border border-emerald-500/20 backdrop-blur-md flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0 text-xs">
            <span className="text-[11px] font-semibold uppercase text-emerald-300 tracking-wider block">Separación de Roles</span>
            <span className="text-slate-300 truncate block">
              <strong className="text-emerald-400">Dueños:</strong> Admin & Finanzas • <strong className="text-amber-400">Encargados:</strong> Turnos & Caja
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-linear-to-br from-purple-950/40 via-slate-900/60 to-slate-950/80 border border-purple-500/20 backdrop-blur-md flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
            <Gift className="w-4 h-4" />
          </div>
          <div className="min-w-0 text-xs">
            <span className="text-[11px] font-semibold uppercase text-purple-300 tracking-wider block">Período de Prueba</span>
            <span className="text-slate-300 truncate block">
              <strong className="text-purple-300">15 días gratis bonificados</strong> para cada club nuevo que se registre
            </span>
          </div>
        </div>
      </div>

      {/* Métricas Globales (KPIs) con micro-glow y tarjetas premium */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: MRR */}
        <div className="p-4 rounded-2xl bg-linear-to-br from-indigo-950/30 via-slate-900/70 to-slate-950 border border-indigo-500/30 shadow-lg shadow-black/20 hover:border-indigo-500/50 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-indigo-300 tracking-wider">
              MRR SaaS Proyectado
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white tracking-tight font-mono">
              {formatARS(totalMRR)}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400 mt-1.5">
              <span className="text-emerald-400 font-semibold">{upToDateCount} al día</span>
              <span>•</span>
              <span className="text-amber-400 font-semibold">{pendingCount} pendientes</span>
              {trialCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-purple-400 font-semibold">{trialCount} en prueba</span>
                </>
              )}
              {pausedCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-rose-400 font-semibold">{pausedCount} en pausa</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Clubes */}
        <div className="p-4 rounded-2xl bg-linear-to-br from-sky-950/30 via-slate-900/70 to-slate-950 border border-sky-500/30 shadow-lg shadow-black/20 hover:border-sky-500/50 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-sky-300 tracking-wider">
              Clubes Registrados
            </span>
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/20">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white tracking-tight">
              {tenants.length} <span className="text-sm font-normal text-slate-400">clubes</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              <strong className="text-sky-300 font-semibold">{totalCourts}</strong> canchas operativas en total
            </p>
          </div>
        </div>

        {/* Card 3: Usuarios */}
        <div className="p-4 rounded-2xl bg-linear-to-br from-emerald-950/30 via-slate-900/70 to-slate-950 border border-emerald-500/30 shadow-lg shadow-black/20 hover:border-emerald-500/50 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-emerald-300 tracking-wider">
              Usuarios Asignados
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1.5 text-2xl font-black text-white tracking-tight">
              <span className="text-emerald-400">{ownerCount}</span>
              <span className="text-xs font-medium text-slate-400">dueños</span>
              <span className="text-slate-600 text-lg">/</span>
              <span className="text-amber-400">{staffCount}</span>
              <span className="text-xs font-medium text-slate-400">encargados</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              <strong className="text-emerald-300 font-semibold">{activeUserCount}</strong> cuentas activas con acceso
            </p>
          </div>
        </div>

        {/* Card 4: Turnos */}
        <div className="p-4 rounded-2xl bg-linear-to-br from-purple-950/30 via-slate-900/70 to-slate-950 border border-purple-500/30 shadow-lg shadow-black/20 hover:border-purple-500/50 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-purple-300 tracking-wider">
              Turnos en Plataforma
            </span>
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white tracking-tight">
              {tenants.reduce((acc, t) => acc + t.total_bookings, 0)}
            </div>
            <p className="text-[11px] text-purple-300 font-medium mt-1.5">
              Reservas procesadas este mes
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Control: Moderno Segmented Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="p-1 rounded-2xl bg-slate-950/90 border border-slate-800/80 backdrop-blur-xl shadow-inner inline-flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
          <button
            onClick={() => setActiveTab('USERS')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0",
              activeTab === 'USERS'
                ? "bg-linear-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30 ring-1 ring-white/10"
                : "text-slate-400 hover:text-white hover:bg-slate-900/60"
            )}
          >
            <Users className="w-4 h-4" />
            <span>Usuarios & Accesos</span>
            <Badge className={cn(
              "text-[10px] px-1.5 py-0 border",
              activeTab === 'USERS' 
                ? "bg-white/20 text-white border-white/20" 
                : "bg-slate-800 text-slate-300 border-slate-700"
            )}>
              {clubUsers.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab('TENANTS')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0",
              activeTab === 'TENANTS'
                ? "bg-linear-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30 ring-1 ring-white/10"
                : "text-slate-400 hover:text-white hover:bg-slate-900/60"
            )}
          >
            <Building2 className="w-4 h-4" />
            <span>Directorio de Clubes</span>
            <Badge className={cn(
              "text-[10px] px-1.5 py-0 border",
              activeTab === 'TENANTS' 
                ? "bg-white/20 text-white border-white/20" 
                : "bg-slate-800 text-slate-300 border-slate-700"
            )}>
              {tenants.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab('BILLING')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0",
              activeTab === 'BILLING'
                ? "bg-linear-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30 ring-1 ring-white/10"
                : "text-slate-400 hover:text-white hover:bg-slate-900/60"
            )}
          >
            <Receipt className="w-4 h-4" />
            <span>Facturación SaaS</span>
            <Badge className={cn(
              "text-[10px] px-1.5 py-0 border",
              activeTab === 'BILLING' 
                ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/40" 
                : "bg-slate-800 text-slate-300 border-slate-700"
            )}>
              {pendingCount > 0 ? `${pendingCount} pendientes` : 'Al día'}
            </Badge>
          </button>
        </div>

        {/* Acceso rápido contextual a la derecha del tab bar */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {activeTab === 'USERS' && (
            <Button
              size="sm"
              onClick={() => setIsCreateUserModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-xl shadow-xs cursor-pointer h-9 px-3"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              Nuevo Usuario
            </Button>
          )}
          {activeTab === 'TENANTS' && (
            <Button
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-xl shadow-xs cursor-pointer h-9 px-3"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Nuevo Club
            </Button>
          )}
          {activeTab === 'BILLING' && (
            <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl font-bold">
              Total MRR: {formatARS(totalMRR)}
            </div>
          )}
        </div>
      </div>

      {/* Pestaña: FACTURACIÓN Y COBROS SAAS */}
      {activeTab === 'BILLING' && (
        <Card className="bg-slate-900/60 border-slate-800/80 rounded-2xl backdrop-blur-md overflow-hidden">
          <CardHeader className="border-b border-slate-800/80 p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold text-white">
                  Matriz de Facturación Mensual por Club
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Liquidación de cuotas proporcionales a pagar a fin de mes.
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadData(true)}
                  disabled={isRefreshing}
                  className="h-9 text-xs border-slate-800 bg-slate-950 text-slate-300 hover:text-white rounded-xl shrink-0 cursor-pointer"
                  title="Consultar base de datos para información actualizada"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
                  Actualizar
                </Button>
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    placeholder="Buscar club..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 rounded-xl border-slate-800 bg-slate-950 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Filtros rápidos por estado de suscripción */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
              <button
                type="button"
                onClick={() => setSubscriptionFilter('ALL')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  subscriptionFilter === 'ALL'
                    ? "bg-slate-700 text-white"
                    : "bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800"
                )}
              >
                Todos ({tenants.length})
              </button>
              <button
                type="button"
                onClick={() => setSubscriptionFilter('AL_DIA')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  subscriptionFilter === 'AL_DIA'
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/40 border border-emerald-500/20"
                )}
              >
                ✓ Al Día ({upToDateCount})
              </button>
              <button
                type="button"
                onClick={() => setSubscriptionFilter('PENDIENTE')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  subscriptionFilter === 'PENDIENTE'
                    ? "bg-amber-600 text-white"
                    : "bg-amber-950/30 text-amber-400 hover:bg-amber-900/40 border border-amber-500/20"
                )}
              >
                ⏳ Pendientes ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setSubscriptionFilter('PAUSADO')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  subscriptionFilter === 'PAUSADO'
                    ? "bg-rose-600 text-white animate-pulse"
                    : "bg-rose-950/30 text-rose-300 hover:bg-rose-900/40 border border-rose-500/30"
                )}
              >
                ⏸️ En Pausa ({pausedCount})
              </button>
              <button
                type="button"
                onClick={() => setSubscriptionFilter('PRUEBA')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  subscriptionFilter === 'PRUEBA'
                    ? "bg-purple-600 text-white"
                    : "bg-purple-950/30 text-purple-300 hover:bg-purple-900/40 border border-purple-500/30"
                )}
              >
                🎁 En Prueba ({trialCount})
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* VISTA MÓVIL: Tarjetas de Facturación (<md) */}
            <div className="md:hidden divide-y divide-slate-800/80 p-3 space-y-3">
              {filteredTenants.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <p className="font-semibold text-slate-300">No se encontraron clubes.</p>
                </div>
              ) : (
                filteredTenants.map((t) => (
                  <div key={t.id} className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-white">{t.name}</span>
                          {t.pricing.planName && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {t.pricing.planName}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{t.city}</div>
                      </div>
                      <div className="shrink-0">
                        {t.subscription_status === 'PAUSADO' ? (
                          <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] animate-pulse">
                            ⏸️ En Pausa
                          </Badge>
                        ) : t.subscription_status === 'AL_DIA' ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                            Al Día
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px]">
                            Pendiente
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Fila con métricas de la cuota */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Cuota Mensual</span>
                        <span className="text-emerald-400 font-extrabold text-base font-mono">
                          {formatARS(t.pricing.monthlyFeeArs)}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {t.pricing.formulaDescription}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Canchas & Mult.</span>
                        <span className="text-slate-200 font-medium">
                          {t.active_courts} canchas • <strong className="text-indigo-400">{t.pricing.multiplier}x</strong>
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Vence: {t.pricing.nextDueDate}
                        </span>
                      </div>
                    </div>

                    {/* Botones de acción móvil */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(t)}
                        className="h-8 text-xs border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white rounded-xl px-2.5"
                      >
                        <Pencil className="w-3 h-3 mr-1 text-indigo-400" />
                        Editar
                      </Button>

                      {t.subscription_status === 'PAUSADO' ? (
                        <Button
                          size="sm"
                          onClick={() => handleTogglePause(t.id, t.name, t.subscription_status)}
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-xs px-2.5 cursor-pointer"
                          title="Reanudar reservas públicas del club"
                        >
                          <Sparkles className="w-3 h-3 mr-1 text-amber-300" />
                          Reanudar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTogglePause(t.id, t.name, t.subscription_status)}
                          className="h-8 text-xs border-rose-500/30 text-rose-300 hover:bg-rose-950/40 rounded-xl px-2 cursor-pointer"
                          title="Pausar reservas públicas por no abonar a tiempo"
                        >
                          ⏸️ Pausar
                        </Button>
                      )}

                      {t.subscription_status === 'PENDIENTE' ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendPaymentLink(t.name, t.pricing.monthlyFeeArs)}
                            className="h-8 text-xs border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white rounded-xl px-2"
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Link
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleRegisterPayment(t.id, t.name, t.pricing.monthlyFeeArs)}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-xs px-2.5"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Cobrar
                          </Button>
                        </>
                      ) : t.subscription_status === 'AL_DIA' ? (
                        <div className="flex-1 text-[11px] text-emerald-400/80 font-medium flex items-center justify-end gap-1 px-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Pagado {t.last_paid}</span>
                        </div>
                      ) : (
                        <div className="flex-1 text-[11px] text-rose-400 font-semibold flex flex-col items-end justify-center px-1">
                          <span>⏸️ En Pausa</span>
                          <span className="text-[10px] text-amber-400 font-mono font-normal">
                            Reactivar: {formatARS(calculateReactivationFee(t.pricing.monthlyFeeArs, t.pricing.nextDueDate).totalAmount)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* VISTA DESKTOP: Tabla completa (>=md) */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="p-4 pl-6">Club / Inquilino</th>
                    <th className="p-4 text-center">Canchas (N)</th>
                    <th className="p-4 text-right">Turno Más Caro</th>
                    <th className="p-4 text-center">Multiplicador (M)</th>
                    <th className="p-4 text-right">Cuota Mensual Final</th>
                    <th className="p-4 text-center">Vencimiento</th>
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 pr-6 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{t.name}</span>
                          {t.pricing.planName && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {t.pricing.planName}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{t.city}</div>
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300 font-mono text-xs">
                          {t.active_courts} {t.active_courts === 1 ? 'cancha' : 'canchas'}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-200 font-mono">
                        {formatARS(t.highest_slot_price)}
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-semibold text-indigo-400 font-mono bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
                          {t.pricing.multiplier}x
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="font-extrabold text-sm text-emerald-400 font-mono">
                          {formatARS(t.pricing.monthlyFeeArs)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {t.pricing.formulaDescription}
                        </div>
                      </td>
                      <td className="p-4 text-center text-slate-400 text-xs font-mono">
                        {t.pricing.nextDueDate}
                      </td>
                      <td className="p-4 text-center">
                        {t.is_trial ? (
                          <div>
                            <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                              🎁 En Prueba ({t.trial_days_remaining !== undefined ? `${t.trial_days_remaining}d` : '15d'})
                            </Badge>
                            <div className="text-[10px] text-purple-400 font-mono mt-0.5">
                              Gratis hasta vencimiento
                            </div>
                          </div>
                        ) : t.subscription_status === 'PAUSADO' ? (
                          <div>
                            <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] animate-pulse">
                              ⏸️ En Pausa
                            </Badge>
                            <div className="text-[10px] text-amber-400 font-mono mt-0.5" title="Cuota base + 3% diario por mora">
                              Reactivar: {formatARS(calculateReactivationFee(t.pricing.monthlyFeeArs, t.pricing.nextDueDate).totalAmount)}
                            </div>
                          </div>
                        ) : t.subscription_status === 'AL_DIA' ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                            Al Día
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px]">
                            Pendiente
                          </Badge>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTrialDaysToSet(15)
                              setActivatingTrialTenant(t)
                            }}
                            className={cn(
                              "h-8 text-xs px-2.5 cursor-pointer flex items-center gap-1",
                              t.is_trial
                                ? "border-purple-500/60 bg-purple-950/30 text-purple-300 hover:bg-purple-900/50 hover:text-white"
                                : "border-purple-500/40 bg-purple-950/20 text-purple-300 hover:bg-purple-900/40 hover:text-white"
                            )}
                            title={t.is_trial ? "Extender o renovar período de prueba (15 días)" : "Activar 15 días de prueba gratis"}
                          >
                            <Gift className="w-3.5 h-3.5 text-purple-400" />
                            <span>{t.is_trial ? 'Extender 15d' : '15d Prueba'}</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEdit(t)}
                            className="h-8 text-xs border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white px-2.5 cursor-pointer"
                            title="Editar datos del club y cuota"
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                            Editar
                          </Button>

                          {t.subscription_status === 'PAUSADO' ? (
                            <Button
                              size="sm"
                              onClick={() => handleTogglePause(t.id, t.name, t.subscription_status)}
                              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-2.5 font-bold cursor-pointer shadow-xs gap-1"
                              title="Reanudar reservas públicas del club"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              Reanudar Club
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTogglePause(t.id, t.name, t.subscription_status)}
                              className="h-8 text-xs border-rose-500/30 text-rose-300 hover:bg-rose-950/40 rounded-xl px-2.5 cursor-pointer"
                              title="Pausar reservas públicas del club por no abonar suscripción a tiempo"
                            >
                              ⏸️ Pausar
                            </Button>
                          )}

                          {t.subscription_status === 'PENDIENTE' ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSendPaymentLink(t.name, t.pricing.monthlyFeeArs)}
                                className="h-8 text-xs border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white"
                                title="Generar link de pago"
                              >
                                <Send className="w-3.5 h-3.5 mr-1" />
                                Link
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleRegisterPayment(t.id, t.name, t.pricing.monthlyFeeArs)}
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Registrar Cobro
                              </Button>
                            </>
                          ) : t.subscription_status === 'AL_DIA' ? (
                            <div className="text-[11px] text-emerald-400/80 font-medium flex items-center gap-1 ml-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Pagado el {t.last_paid}
                            </div>
                          ) : (
                            <div className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 ml-1">
                              <span>Falta de pago</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pestaña: DIRECTORIO DE CLUBES */}
      {activeTab === 'TENANTS' && (
        <Card className="bg-slate-900/60 border-slate-800/80 rounded-2xl backdrop-blur-md overflow-hidden">
          <CardHeader className="border-b border-slate-800/80 p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold text-white">
                  Directorio de Clubes y Subdominios
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Visualizá y gestioná el estado operativo, accesos, planes y links públicos de cada club.
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  onClick={() => setIsModalOpen(true)}
                  className="h-9 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Nuevo Club
                </Button>
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    placeholder="Buscar club, slug o ciudad..."
                    value={tenantSearchTerm}
                    onChange={(e) => setTenantSearchTerm(e.target.value)}
                    className="pl-9 h-9 rounded-xl border-slate-800 bg-slate-950 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Filtros por estado operativo */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
              <button
                type="button"
                onClick={() => setTenantStatusFilter('ALL')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  tenantStatusFilter === 'ALL'
                    ? "bg-slate-700 text-white"
                    : "bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800"
                )}
              >
                Todos ({tenants.length})
              </button>
              <button
                type="button"
                onClick={() => setTenantStatusFilter('ACTIVE')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  tenantStatusFilter === 'ACTIVE'
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/40 border border-emerald-500/20"
                )}
              >
                ✅ Habilitados ({tenants.filter(t => t.is_active && !t.is_trial).length})
              </button>
              <button
                type="button"
                onClick={() => setTenantStatusFilter('TRIAL')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  tenantStatusFilter === 'TRIAL'
                    ? "bg-purple-600 text-white"
                    : "bg-purple-950/30 text-purple-300 hover:bg-purple-900/40 border border-purple-500/30"
                )}
              >
                🎁 En Prueba ({trialCount})
              </button>
              <button
                type="button"
                onClick={() => setTenantStatusFilter('PENDING')}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                  tenantStatusFilter === 'PENDING'
                    ? "bg-amber-600 text-white"
                    : "bg-amber-950/30 text-amber-400 hover:bg-amber-900/40 border border-amber-500/20"
                )}
              >
                ⏳ Pendientes ({tenants.filter(t => !t.is_active).length})
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* VISTA MÓVIL: Tarjetas de Clubes (<md) */}
            <div className="md:hidden divide-y divide-slate-800/80 p-3 space-y-3">
              {directoryTenants.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <p className="font-semibold text-slate-300">No se encontraron clubes.</p>
                </div>
              ) : (
                directoryTenants.map((t) => (
                  <div key={t.id} className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-sm text-white block">{t.name}</span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">{t.city}</span>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {t.is_trial && (
                          <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                            🎁 Prueba {t.trial_days_remaining !== undefined ? `(${t.trial_days_remaining}d)` : 'Activa'}
                          </Badge>
                        )}
                        {t.is_active !== false ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                            ✅ Habilitado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px]">
                            ⏳ Pendiente
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Plan Contratado</span>
                        <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300 text-[11px] font-medium mt-1">
                          {SAAS_PLANS[t.plan_id]?.name || t.plan_id}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Mercado Pago</span>
                        <div className="mt-1">
                          {t.mp_connected ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                              Conectado
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                              Sin Configurar
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Portal Público:</span>
                        <span className="font-mono text-indigo-400">/club/{t.slug}</span>
                      </div>
                    </div>

                    {/* Botón para activar o extender período de prueba (15 días) */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTrialDaysToSet(15)
                        setActivatingTrialTenant(t)
                      }}
                      className={cn(
                        "w-full h-8 text-xs font-bold rounded-xl gap-1.5 cursor-pointer",
                        t.is_trial
                          ? "border-purple-500/60 bg-purple-950/30 text-purple-300 hover:bg-purple-900/50 hover:text-white"
                          : "border-purple-500/40 bg-purple-950/20 text-purple-300 hover:bg-purple-900/40 hover:text-white"
                      )}
                    >
                      <Gift className="w-3.5 h-3.5 text-purple-400" />
                      <span>{t.is_trial ? `Extender Prueba (${t.trial_days_remaining ?? 0}d)` : '🎁 Activar 15 Días de Prueba'}</span>
                    </Button>

                    {/* Botón destacado para activar si está pendiente */}
                    {!t.is_active && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenActivate(t)}
                        className="w-full h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl gap-1.5 shadow-md shadow-emerald-950/40 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Activar y Dar Acceso Total</span>
                      </Button>
                    )}

                    {/* Botones de acción móvil */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSimulateClub(t, 'TENANT_ADMIN')}
                        className="flex-1 h-8 text-xs border-indigo-700/60 bg-indigo-950/30 hover:bg-indigo-900/50 text-indigo-300 hover:text-white rounded-xl gap-1"
                      >
                        <LogIn className="w-3 h-3" />
                        <span>Panel Club</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(t)}
                        className="flex-1 h-8 text-xs border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white rounded-xl gap-1"
                      >
                        <Pencil className="w-3 h-3 text-indigo-400" />
                        <span>Editar</span>
                      </Button>

                      {t.is_active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleDeactivate(t.id, t.name)}
                          className="h-8 px-2 text-[11px] border-amber-500/30 text-amber-400 hover:bg-amber-950/30 rounded-xl cursor-pointer"
                          title="Suspender acceso"
                        >
                          Pausar
                        </Button>
                      ) : null}

                      <Link 
                        href={`/club/${t.slug}`} 
                        target="_blank"
                        className="h-8 px-3 text-xs text-indigo-300 hover:text-white font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl inline-flex items-center gap-1"
                      >
                        <span>Ver</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* VISTA DESKTOP: Tabla completa (>=md) */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="p-4 pl-6">Club</th>
                    <th className="p-4">Ubicación</th>
                    <th className="p-4 text-center">Plan Contratado</th>
                    <th className="p-4 text-center">Estado Acceso</th>
                    <th className="p-4">Slug / Portal</th>
                    <th className="p-4 text-center">Mercado Pago</th>
                    <th className="p-4 pr-6 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {directoryTenants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        <p className="font-semibold text-slate-300">No se encontraron clubes con los filtros seleccionados.</p>
                        <p className="text-xs text-slate-500 mt-1">Probá cambiando el término de búsqueda o el filtro de estado.</p>
                      </td>
                    </tr>
                  ) : (
                    directoryTenants.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 pl-6 font-semibold text-white">
                        {t.name}
                      </td>
                      <td className="p-4 text-slate-400">
                        {t.city}
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300 text-[11px] font-medium">
                          {SAAS_PLANS[t.plan_id]?.name || t.plan_id}
                        </Badge>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {t.is_trial && (
                            <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                              🎁 Prueba {t.trial_days_remaining !== undefined ? `(${t.trial_days_remaining}d)` : 'Activa'}
                            </Badge>
                          )}
                          {t.is_active ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              ✅ Habilitado
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold animate-pulse">
                              ⏳ Pendiente
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-mono text-indigo-400">
                        /club/{t.slug}
                      </td>
                      <td className="p-4 text-center">
                        {t.mp_connected ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                            Conectado
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                            Sin Configurar
                          </Badge>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTrialDaysToSet(15)
                              setActivatingTrialTenant(t)
                            }}
                            className={cn(
                              "h-7 text-xs font-bold px-2.5 rounded-lg cursor-pointer flex items-center gap-1 transition-all",
                              t.is_trial
                                ? "border-purple-500/60 bg-purple-950/30 text-purple-300 hover:bg-purple-900/50 hover:text-white"
                                : "border-purple-500/40 bg-purple-950/15 text-purple-300 hover:bg-purple-900/40 hover:text-white"
                            )}
                            title={t.is_trial ? "Extender o renovar el período de prueba de 15 días" : "Activar período de prueba de 15 días gratis para este club"}
                          >
                            <Gift className="w-3 h-3 text-purple-400" />
                            <span>{t.is_trial ? 'Extender 15d' : '15 Días Prueba'}</span>
                          </Button>

                          {!t.is_active ? (
                            <Button
                              size="sm"
                              onClick={() => handleOpenActivate(t)}
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 rounded-lg shadow-sm shadow-emerald-950/40 cursor-pointer flex items-center gap-1"
                              title="Otorgar poder y acceso total a este club asignando su plan"
                            >
                              <Sparkles className="w-3 h-3 text-amber-300" />
                              <span>Activar Acceso</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleDeactivate(t.id, t.name)}
                              className="h-7 text-[11px] text-slate-400 hover:text-amber-400 px-2 rounded-lg cursor-pointer"
                              title="Suspender acceso (modo sólo lectura)"
                            >
                              Pausar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSimulateClub(t, 'TENANT_ADMIN')}
                            className="h-7 text-xs border-indigo-700/60 bg-indigo-950/30 hover:bg-indigo-900/50 text-indigo-300 hover:text-white px-2.5 rounded-lg"
                            title="Ingresar directamente al panel de este club con su plan asignado"
                          >
                            <LogIn className="w-3 h-3 mr-1" />
                            Panel Club
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEdit(t)}
                            className="h-7 text-xs border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white px-2.5"
                            title="Editar parámetros del club y plan SaaS"
                          >
                            <Pencil className="w-3 h-3 mr-1 text-indigo-400" />
                            Editar
                          </Button>
                          <Link 
                            href={`/club/${t.slug}`} 
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded-lg hover:bg-indigo-950/40"
                          >
                            Portal <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pestaña: USUARIOS & ACCESOS (DUEÑOS Y CANCHEROS) */}
      {activeTab === 'USERS' && (
        <div className="space-y-6">
          {/* Banner explicativo de roles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-linear-to-br from-emerald-950/40 via-slate-900/60 to-slate-950/80 border border-emerald-500/25 backdrop-blur-md flex flex-col justify-between gap-3 shadow-lg shadow-emerald-950/20">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shrink-0 shadow-xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white tracking-tight">Dueño del Club</h4>
                      <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 border border-emerald-500/30 font-mono">
                        TENANT_ADMIN
                      </Badge>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      {ownerCount} asignados
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-0.5">
                    Acceso y administración total del club: configuración de canchas, reglas de tarifas, precios de slots, reportes de ocupación y cobros de la cuota SaaS mensual.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/80">
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 text-emerald-300/90 border border-emerald-500/15">
                  ✓ Configuración General
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 text-emerald-300/90 border border-emerald-500/15">
                  ✓ Planes y Cuota SaaS
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 text-emerald-300/90 border border-emerald-500/15">
                  ✓ Reportes y Facturación
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-linear-to-br from-amber-950/40 via-slate-900/60 to-slate-950/80 border border-amber-500/25 backdrop-blur-md flex flex-col justify-between gap-3 shadow-lg shadow-amber-950/20">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25 shrink-0 shadow-xs">
                  <Coffee className="w-5 h-5" />
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white tracking-tight">Encargado / Mostrador</h4>
                      <Badge className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 border border-amber-500/30 font-mono">
                        TENANT_STAFF
                      </Badge>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                      {staffCount} asignados
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-0.5">
                    Operativa diaria en cancha: Calendario de turnos en vivo, turnos fijos de abonados, cantina & kiosco, y apertura/cierre de caja diaria. No accede a finanzas SaaS ni precios.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/80">
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 text-amber-300/90 border border-amber-500/15">
                  ✓ Calendario de Turnos
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 text-amber-300/90 border border-amber-500/15">
                  ✓ Kiosco / Cantina
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 text-amber-300/90 border border-amber-500/15">
                  ✓ Caja Diaria
                </span>
              </div>
            </div>
          </div>

          {/* Tabla de Usuarios */}
          <Card className="bg-slate-900/60 border-slate-800/80 rounded-2xl backdrop-blur-md overflow-hidden">
            <CardHeader className="border-b border-slate-800/80 p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    Directorio de Usuarios por Club
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Gestioná credenciales de acceso, roles asignados y generá mensajes de WhatsApp para entregar a cada usuario.
                  </p>
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative min-w-50 flex-1 sm:flex-initial">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input 
                      placeholder="Buscar por nombre, email o club..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="pl-9 h-9 rounded-xl border-slate-800 bg-slate-950 text-xs"
                    />
                  </div>

                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value as 'ALL' | 'TENANT_ADMIN' | 'TENANT_STAFF')}
                    className="h-9 rounded-xl border border-slate-800 bg-slate-950 text-xs px-3 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">Todos los roles</option>
                    <option value="TENANT_ADMIN">Solo Dueños (Admin)</option>
                    <option value="TENANT_STAFF">Solo Encargados (Operativo)</option>
                  </select>

                  <select
                    value={userClubFilter}
                    onChange={(e) => setUserClubFilter(e.target.value)}
                    className="h-9 rounded-xl border border-slate-800 bg-slate-950 text-xs px-3 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">Todos los clubes</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    onClick={() => setIsCreateUserModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs h-9 px-3"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1" />
                    Nuevo Usuario
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* VISTA MÓVIL: Tarjetas de Usuarios (<md) */}
              <div className="md:hidden divide-y divide-slate-800/80 p-3 space-y-3">
                {filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    <p className="font-semibold text-slate-300">No se encontraron usuarios.</p>
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div key={user.id} className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                      {/* Header de la tarjeta */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            user.role === 'TENANT_ADMIN'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-white flex items-center gap-1.5">
                              {user.name}
                              {user.role === 'TENANT_ADMIN' ? (
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : (
                                <Coffee className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium">
                              {user.tenantName}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(user.id)}
                          className="cursor-pointer shrink-0"
                          title="Click para cambiar estado"
                        >
                          {user.status === 'ACTIVE' ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                              Activo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-400 text-[10px]">
                              Inactivo
                            </Badge>
                          )}
                        </button>
                      </div>

                      {/* Detalles: Rol, Email y Contraseña */}
                      <div className="space-y-2 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Rol:</span>
                          {user.role === 'TENANT_ADMIN' ? (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-1.5 py-0">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              Dueño (Admin Total)
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] px-1.5 py-0">
                              <Coffee className="w-3 h-3 mr-1" />
                              Encargado (Operativo)
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/50">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase font-bold block">Email</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-slate-200 font-mono text-[11px] truncate">{user.email}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(user.email)
                                  toast.success('Email copiado al portapapeles')
                                }}
                                className="text-slate-500 hover:text-slate-300 shrink-0"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase font-bold block">Contraseña</span>
                            <div className="flex items-center gap-1 mt-0.5 font-mono text-[11px] text-slate-300">
                              <span>{revealedPasswords[user.id] ? (user.password || 'Sin clave') : '••••••••'}</span>
                              <button
                                type="button"
                                onClick={() => handleTogglePassword(user.id)}
                                className="text-slate-500 hover:text-slate-300 cursor-pointer"
                              >
                                {revealedPasswords[user.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (user.password) {
                                    navigator.clipboard.writeText(user.password)
                                    toast.success('Contraseña copiada al portapapeles')
                                  } else {
                                    toast.info('No hay contraseña guardada para este usuario. Podés asignarle una con el botón de editar.')
                                  }
                                }}
                                className="text-slate-500 hover:text-slate-300 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Botones de acción móvil */}
                      <div className="flex items-center justify-between gap-1.5 pt-1">
                        <Button
                          size="sm"
                          onClick={() => handleCopyWhatsAppMessage(user)}
                          className="flex-1 h-8 text-xs bg-emerald-700/80 hover:bg-emerald-600 text-white font-medium rounded-xl gap-1 shadow-xs cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loggingInUserId === user.id}
                          onClick={() => handleLoginAsUser(user)}
                          className="flex-1 h-8 text-xs border-indigo-700/60 bg-indigo-950/30 hover:bg-indigo-900/50 text-indigo-300 hover:text-white rounded-xl gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          {loggingInUserId === user.id ? (
                            <span className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                          ) : (
                            <LogIn className="w-3.5 h-3.5" />
                          )}
                          <span>{loggingInUserId === user.id ? 'Ingresando...' : 'Probar'}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEditUser(user)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-white rounded-xl"
                          title="Editar usuario"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteUser(user.id, user.name)}
                          disabled={loadingDeleteUserId === user.id}
                          className="h-8 w-8 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl disabled:opacity-50"
                          title="Eliminar usuario"
                        >
                          {loadingDeleteUserId === user.id ? (
                            <span className="w-3.5 h-3.5 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* VISTA DESKTOP: Tabla completa (>=md) */}
              <div className="hidden md:block overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="p-4 pl-6">Usuario / Contacto</th>
                      <th className="p-4">Club Asignado</th>
                      <th className="p-4 text-center">Rol en Plataforma</th>
                      <th className="p-4">Alcance Operativo</th>
                      <th className="p-4 text-center">Contraseña</th>
                      <th className="p-4 text-center">Estado</th>
                      <th className="p-4 pr-6 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          <p className="font-semibold text-slate-300">No se encontraron usuarios con esos filtros.</p>
                          <p className="text-xs mt-1">Probá cambiando el término de búsqueda o el club seleccionado.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-800/20 transition-colors">
                          <td className="p-4 pl-6">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                user.role === 'TENANT_ADMIN'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  {user.name}
                                  {user.role === 'TENANT_ADMIN' ? (
                                    <span title="Dueño / Administrador del Club">
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                    </span>
                                  ) : (
                                    <span title="Encargado (Turnos y Cantina)">
                                      <Coffee className="w-3.5 h-3.5 text-amber-400" />
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                  <span>{user.email}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(user.email)
                                      toast.success('Email copiado al portapapeles')
                                    }}
                                    className="text-slate-500 hover:text-slate-300 ml-0.5"
                                    title="Copiar email"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                  <Smartphone className="w-2.5 h-2.5" />
                                  {user.phone}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="font-medium text-slate-200">{user.tenantName}</div>
                            <Link
                              href={`/club/${user.tenantSlug}`}
                              target="_blank"
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-0.5 mt-0.5"
                            >
                              /club/{user.tenantSlug}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </Link>
                          </td>
                          <td className="p-4 text-center">
                            {user.role === 'TENANT_ADMIN' ? (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] px-2 py-0.5">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                Dueño del Club
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] px-2 py-0.5">
                                <Coffee className="w-3 h-3 mr-1" />
                                Encargado
                              </Badge>
                            )}
                          </td>
                          <td className="p-4 max-w-55">
                            {user.role === 'TENANT_ADMIN' ? (
                              <div className="text-[11px] text-slate-300 leading-tight">
                                <strong className="text-emerald-400">Total:</strong> Canchas, Precios, Reportes, Ocupación y Facturación SaaS.
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-300 leading-tight">
                                <strong className="text-amber-400">Operativo:</strong> Calendario de turnos, turnos fijos, cantina/kiosco y caja diaria.
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300">
                              <span>
                                {revealedPasswords[user.id] ? (user.password || 'Sin clave') : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleTogglePassword(user.id)}
                                className="text-slate-500 hover:text-slate-300 ml-1 cursor-pointer"
                                title={revealedPasswords[user.id] ? 'Ocultar' : 'Ver clave'}
                              >
                                {revealedPasswords[user.id] ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (user.password) {
                                    navigator.clipboard.writeText(user.password)
                                    toast.success('Contraseña copiada al portapapeles')
                                  } else {
                                    toast.info('No hay contraseña guardada para este usuario. Podés asignarle una con el botón de editar.')
                                  }
                                }}
                                className="text-slate-500 hover:text-slate-300 cursor-pointer"
                                title="Copiar contraseña"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(user.id)}
                              className="cursor-pointer"
                              title="Click para cambiar estado"
                            >
                              {user.status === 'ACTIVE' ? (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                                  Activo
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-400 text-[10px]">
                                  Inactivo
                                </Badge>
                              )}
                            </button>
                          </td>
                          <td className="p-4 pr-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => handleCopyWhatsAppMessage(user)}
                                className="h-7 text-xs bg-emerald-700/80 hover:bg-emerald-600 text-white font-medium px-2.5 rounded-lg shadow-xs cursor-pointer"
                                title="Copiar mensaje de bienvenida con link y accesos para WhatsApp"
                              >
                                <MessageSquare className="w-3 h-3 mr-1" />
                                WhatsApp
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                disabled={loggingInUserId === user.id}
                                onClick={() => handleLoginAsUser(user)}
                                className="h-7 text-xs border-indigo-700/60 bg-indigo-950/30 hover:bg-indigo-900/50 text-indigo-300 hover:text-white px-2.5 rounded-lg disabled:opacity-50 cursor-pointer"
                                title="Ingresar directamente al panel como este usuario con 1 solo clic"
                              >
                                {loggingInUserId === user.id ? (
                                  <span className="w-3 h-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin mr-1" />
                                ) : (
                                  <LogIn className="w-3 h-3 mr-1" />
                                )}
                                {loggingInUserId === user.id ? 'Ingresando...' : 'Probar'}
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenEditUser(user)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                                title="Editar datos del usuario"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteUser(user.id, user.name)}
                                className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                                title="Eliminar usuario"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Registrar Nuevo Club */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg bg-slate-950 border-slate-800 text-slate-100 rounded-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <DialogHeader className="pr-6">
            <DialogTitle className="text-lg font-bold text-white">
              Dar de Alta Nuevo Club
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Registra un nuevo inquilino B2B en la plataforma y configura sus parámetros de facturación.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTenant} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Nombre del Club / Complejo</Label>
              <Input 
                required
                placeholder="Ej. Pádel Point Tucumán"
                value={newClubName}
                onChange={(e) => setNewClubName(e.target.value)}
                className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Ciudad / Localidad</Label>
              <Input 
                required
                placeholder="Ej. San Miguel de Tucumán"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Cantidad de Canchas</Label>
                <Input 
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={newCourts}
                  onChange={(e) => {
                    const val = e.target.value
                    setNewCourts(val)
                    const count = Number(val) || 1
                    setNewPlanId(getPlanByCourtsCount(count).id)
                  }}
                  className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Turno Más Caro (ARS)</Label>
                <Input 
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={newMaxPrice}
                  onChange={(e) => setNewMaxPrice(e.target.value)}
                  className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                <span>Plan SaaS Inicial Asignado</span>
                <span className="text-[10px] text-indigo-400 font-normal">Módulos permitidos</span>
              </Label>
              <select
                value={newPlanId}
                onChange={(e) => setNewPlanId(e.target.value as SaaSPlanId)}
                className="w-full h-9 rounded-xl border border-slate-800 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                {SAAS_PLANS_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.courtsLabel}) — {p.priceTurnosLabel}
                  </option>
                ))}
              </select>
            </div>

            {/* Vista Previa de la Cuota Calculada */}
            <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs">
              <div className="text-indigo-300 font-semibold mb-1">
                Cuota Mensual Proyectada:
              </div>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {formatARS(
                  Number(newMaxPrice) * calculateSaaSMultiplier(Number(newCourts) || 1)
                )} / mes
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Multiplicador: {calculateSaaSMultiplier(Number(newCourts) || 1)}x turnos
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl border-slate-800 text-xs flex-1 sm:flex-initial"
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs flex-1 sm:flex-initial"
              >
                Registrar y Activar Club
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Club / Inquilino */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl bg-slate-950 border-slate-800 text-slate-100 rounded-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <DialogHeader className="pr-6">
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Pencil className="w-4 h-4 text-indigo-400" />
              Editar Parámetros del Club
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Modifica la información del predio, cantidad de canchas y turno más caro para recalcular la cuota mensual SaaS.
            </DialogDescription>
          </DialogHeader>

          {editingTenant && (
            <form onSubmit={handleUpdateTenant} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Nombre del Club / Complejo</Label>
                <Input 
                  required
                  value={editingTenant.name}
                  onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })}
                  className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Slug / URL (/club/...)</Label>
                  <Input 
                    required
                    value={editingTenant.slug}
                    onChange={(e) => setEditingTenant({ ...editingTenant, slug: e.target.value })}
                    className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Ciudad / Ubicación</Label>
                  <Input 
                    required
                    value={editingTenant.city}
                    onChange={(e) => setEditingTenant({ ...editingTenant, city: e.target.value })}
                    className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Cantidad de Canchas (N)</Label>
                  <Input 
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={editingTenant.active_courts}
                    onChange={(e) => setEditingTenant({ ...editingTenant, active_courts: Number(e.target.value) })}
                    className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Turno Más Caro (ARS)</Label>
                  <Input 
                    type="number"
                    min="1000"
                    step="1000"
                    required
                    value={editingTenant.highest_slot_price}
                    onChange={(e) => setEditingTenant({ ...editingTenant, highest_slot_price: Number(e.target.value) })}
                    className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Asignación de Plan SaaS */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-indigo-300">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                    Plan SaaS Asignado (Módulos visibles)
                  </span>
                  <span className="text-[10px] text-indigo-400 font-normal">Editable por Superadmin</span>
                </Label>
                <select
                  value={editingTenant.plan_id}
                  onChange={(e) => setEditingTenant({ ...editingTenant, plan_id: e.target.value as SaaSPlanId })}
                  className="w-full h-9 rounded-xl border border-indigo-700/60 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  {SAAS_PLANS_LIST.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.courtsLabel}) — {p.priceTurnosLabel}
                    </option>
                  ))}
                </select>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] leading-relaxed">
                  <div className="text-slate-400 font-semibold mb-0.5">Módulos habilitados para el club:</div>
                  {editingTenant.plan_id === 'CHICO_1' && (
                    <span className="text-emerald-400 font-medium">📅 Calendario, 💰 Caja Diaria, ⚙️ Canchas, 💵 Reglas Precios, 📋 Mi Plan SaaS. (Solo dueño, sin multiusuario ni cantina)</span>
                  )}
                  {editingTenant.plan_id === 'MEDIANO_2' && (
                    <span className="text-emerald-400 font-medium">📅 Calendario, ☕ Cantina & Kiosco, 💰 Caja Diaria, ⚙️ Canchas, 💵 Reglas Precios, 📋 Mi Plan SaaS.</span>
                  )}
                  {editingTenant.plan_id === 'CONSOLIDADO_3_4' && (
                    <span className="text-emerald-400 font-medium">📅 Calendario, 📅 Turnos Fijos (Abonados), ☕ Cantina & Kiosco, 💰 Caja, ⚡ Control Luces, 📊 Reportes Ocupación, ⚙️ Canchas, 💵 Precios.</span>
                  )}
                  {editingTenant.plan_id === 'GRANDE_5_PLUS' && (
                    <span className="text-emerald-400 font-medium">🏆 Torneos y Cuadros, 📅 Turnos Fijos, ☕ Cantina, 💰 Caja, ⚡ Control Luces, 📊 Reportes Ocupación, ⚙️ Canchas + Módulos Ilimitados.</span>
                  )}
                </div>
              </div>

              {/* Estado de Activación y Acceso */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                  <span>Habilitación y Acceso al Dashboard</span>
                  <span className="text-[10px] text-slate-400 font-normal">Control de activación</span>
                </Label>
                <select
                  value={editingTenant.is_active ? 'true' : 'false'}
                  onChange={(e) => setEditingTenant({ ...editingTenant, is_active: e.target.value === 'true' })}
                  className="w-full h-9 rounded-xl border border-slate-800 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  <option value="true">✅ Habilitado / Activo (Acceso completo según su plan)</option>
                  <option value="false">⏳ Pendiente de Activación (Panel bloqueado con pantalla a WhatsApp)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Estado Suscripción</Label>
                  <select
                    value={editingTenant.subscription_status}
                    onChange={(e) => setEditingTenant({ ...editingTenant, subscription_status: e.target.value as 'AL_DIA' | 'PENDIENTE' | 'PAUSADO' })}
                    className="w-full h-9 rounded-xl border border-slate-800 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="AL_DIA">Al Día (Sin deuda)</option>
                    <option value="PENDIENTE">Pendiente de Pago</option>
                    <option value="PAUSADO">⏸️ En Pausa (Por no abonar suscripción a tiempo)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Mercado Pago Split</Label>
                  <select
                    value={editingTenant.mp_connected ? 'true' : 'false'}
                    onChange={(e) => setEditingTenant({ ...editingTenant, mp_connected: e.target.value === 'true' })}
                    className="w-full h-9 rounded-xl border border-slate-800 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="true">Conectado (OAuth)</option>
                    <option value="false">Sin Configurar</option>
                  </select>
                </div>
              </div>

              {/* Recálculo en Vivo de la Cuota SaaS */}
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs space-y-1">
                <div className="flex items-center justify-between text-indigo-300 font-semibold">
                  <span>Nueva Cuota Recalculada:</span>
                  <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/20 text-indigo-300 font-mono text-[11px]">
                    {calculateSaaSMultiplier(Number(editingTenant.active_courts) || 1)}x turnos
                  </Badge>
                </div>
                <div className="text-xl font-extrabold text-emerald-400 font-mono">
                  {formatARS(
                    (Number(editingTenant.highest_slot_price) || 0) * calculateSaaSMultiplier(Number(editingTenant.active_courts) || 1)
                  )} / mes
                </div>
                <div className="text-[11px] text-slate-400">
                  Fórmula: {Number(editingTenant.highest_slot_price) ? formatARS(editingTenant.highest_slot_price) : '$0'} × {calculateSaaSMultiplier(Number(editingTenant.active_courts) || 1)} turnos
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-slate-800/80 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mt-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => handleDeleteTenant(editingTenant.id, editingTenant.name)}
                  className="rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 text-xs justify-center sm:justify-start"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Eliminar Club
                </Button>
                <div className="flex items-center gap-2 justify-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsEditModalOpen(false)}
                    className="rounded-xl border-slate-800 text-xs flex-1 sm:flex-initial"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex-1 sm:flex-initial"
                  >
                    Guardar Cambios
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Crear Usuario Individual (Dueño o Canchero) */}
      <Dialog open={isCreateUserModalOpen} onOpenChange={setIsCreateUserModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg bg-slate-950 border-slate-800 text-slate-100 rounded-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <DialogHeader className="pr-6">
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-400" />
              Crear Usuario para Club
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Generá las credenciales para el Dueño (administración total) o para el Encargado (control de turnos, cantina y caja).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4 py-2">
            {/* Club asignado */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Club / Predio al que pertenece</Label>
              <select
                value={newUserTenantId}
                onChange={(e) => setNewUserTenantId(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-800 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.city})
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Rol interactivo */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Rol y Nivel de Acceso</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNewUserRole('TENANT_ADMIN')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    newUserRole === 'TENANT_ADMIN'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md shadow-emerald-950/40'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-emerald-400">
                      <ShieldCheck className="w-4 h-4" />
                      Dueño del Club
                    </span>
                    {newUserRole === 'TENANT_ADMIN' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-300 leading-tight">
                    Administración general, canchas, precios, reportes y finanzas SaaS.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setNewUserRole('TENANT_STAFF')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    newUserRole === 'TENANT_STAFF'
                      ? 'bg-amber-950/40 border-amber-500 text-white shadow-md shadow-amber-950/40'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-amber-400">
                      <Coffee className="w-4 h-4" />
                      Encargado / Mostrador
                    </span>
                    {newUserRole === 'TENANT_STAFF' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-300 leading-tight">
                    Operación de turnos en vivo, turnos fijos, cantina/kiosco y caja diaria.
                  </p>
                </button>
              </div>
            </div>

            {/* Nombre y Apellido */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Nombre Completo</Label>
              <Input
                required
                placeholder="Ej. Lucas Pereyra"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Email */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Email de Acceso</Label>
                <Input
                  type="email"
                  required
                  placeholder="ejemplo@club.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                />
              </div>

              {/* Teléfono */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">WhatsApp / Teléfono</Label>
                <Input
                  placeholder="+54 9 381 555-1234"
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-300">Contraseña Inicial</Label>
                <button
                  type="button"
                  onClick={() => setNewUserPassword(`club${Math.floor(1000 + Math.random() * 9000)}`)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                >
                  ⚡ Generar aleatoria
                </button>
              </div>
              <Input
                required
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
              />
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsCreateUserModalOpen(false)}
                className="rounded-xl border-slate-800 text-xs flex-1 sm:flex-initial"
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                disabled={isCreatingUser}
                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex-1 sm:flex-initial cursor-pointer disabled:opacity-50"
              >
                {isCreatingUser ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
                    Creando en Supabase...
                  </>
                ) : (
                  'Crear Usuario y Generar Credenciales'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Usuario */}
      <Dialog open={isEditUserModalOpen} onOpenChange={setIsEditUserModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg bg-slate-950 border-slate-800 text-slate-100 rounded-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <DialogHeader className="pr-6">
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Pencil className="w-4 h-4 text-indigo-400" />
              Editar Usuario
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Modificá los datos de acceso, club asignado o rol de este usuario.
            </DialogDescription>
          </DialogHeader>

          {editingUser && (
            <form onSubmit={handleUpdateUser} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Nombre Completo</Label>
                <Input
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Email</Label>
                  <Input
                    type="email"
                    required
                    value={editingUser.email}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">WhatsApp / Teléfono</Label>
                  <Input
                    value={editingUser.phone}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Club Asignado</Label>
                  <select
                    value={editingUser.tenantId}
                    onChange={(e) => setEditingUser({ ...editingUser, tenantId: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-800 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Rol</Label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as 'TENANT_ADMIN' | 'TENANT_STAFF' })}
                    className="w-full h-9 rounded-xl border border-slate-800 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="TENANT_ADMIN">Dueño del Club (Admin)</option>
                    <option value="TENANT_STAFF">Encargado (Turnos y Cantina)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Contraseña</Label>
                  <Input
                    required
                    value={editingUser.password}
                    onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                    className="h-9 rounded-xl border-slate-800 bg-slate-900 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Estado</Label>
                  <select
                    value={editingUser.status}
                    onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                    className="w-full h-9 rounded-xl border border-slate-800 bg-slate-900 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ACTIVE">Activo</option>
                    <option value="INACTIVE">Inactivo</option>
                  </select>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-slate-800/80 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mt-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => handleDeleteUser(editingUser.id, editingUser.name)}
                  className="rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 text-xs cursor-pointer justify-center sm:justify-start"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Eliminar Usuario
                </Button>
                <div className="flex items-center gap-2 justify-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsEditUserModalOpen(false)}
                    className="rounded-xl border-slate-800 text-xs flex-1 sm:flex-initial"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit"
                    disabled={isUpdatingUser}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex-1 sm:flex-initial cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingUser ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar Cambios'
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Alta Rápida 3-en-1 */}
      <Dialog open={isQuickWizardModalOpen} onOpenChange={setIsQuickWizardModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-slate-950 border-slate-800 text-slate-100 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              Alta Rápida de Club Completo (Club + Dueño + Encargado)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              En un solo paso, creá el club nuevo y asignale inmediatamente el usuario al Dueño y al Encargado con sus claves para WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleQuickWizardSubmit} className="space-y-6 py-2">
            {/* 1. Datos del Club */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                <Building2 className="w-4 h-4" />
                1. Datos del Club / Predio
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Nombre del Complejo</Label>
                  <Input
                    required
                    placeholder="Ej. Smash Padel Club"
                    value={wizardClubName}
                    onChange={(e) => setWizardClubName(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Ciudad / Localidad</Label>
                  <Input
                    required
                    value={wizardCity}
                    onChange={(e) => setWizardCity(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Cantidad de Canchas</Label>
                  <Input
                    type="number"
                    min="1"
                    required
                    value={wizardCourts}
                    onChange={(e) => setWizardCourts(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Turno Más Caro (ARS)</Label>
                  <Input
                    type="number"
                    step="1000"
                    required
                    value={wizardMaxPrice}
                    onChange={(e) => setWizardMaxPrice(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                  <span>Plan SaaS Inicial Asignado</span>
                  <span className="text-[10px] text-indigo-400 font-normal">Auto-detectado según canchas</span>
                </Label>
                <select
                  value={wizardPlanId}
                  onChange={(e) => setWizardPlanId(e.target.value as SaaSPlanId)}
                  className="w-full h-9 rounded-xl border border-slate-800 bg-slate-950 text-xs px-3 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  {SAAS_PLANS_LIST.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.courtsLabel}) — {p.priceTurnosLabel}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vista previa cuota */}
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs">
                <div className="flex items-center justify-between text-indigo-300 font-semibold">
                  <span>Cuota SaaS Proyectada:</span>
                  <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/20 text-indigo-300 font-mono text-[11px]">
                    {calculateSaaSMultiplier(Number(wizardCourts) || 1)}x turnos
                  </Badge>
                </div>
                <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                  {formatARS(
                    Number(wizardMaxPrice) * calculateSaaSMultiplier(Number(wizardCourts) || 1)
                  )} / mes
                </div>
              </div>
            </div>

            {/* 2. Usuario Dueño del Club */}
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-900/40 space-y-3">
              <div className="flex items-center justify-between text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  2. Credenciales del Dueño (Admin Total)
                </span>
                <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">TENANT_ADMIN</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Nombre Completo</Label>
                  <Input 
                    required
                    placeholder="Ej. Carlos Dueño"
                    value={wizardOwnerName}
                    onChange={(e) => setWizardOwnerName(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">WhatsApp / Celular</Label>
                  <Input 
                    placeholder="+54 9 381 555-1111"
                    value={wizardOwnerPhone}
                    onChange={(e) => setWizardOwnerPhone(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Email de Ingreso</Label>
                  <Input 
                    type="email"
                    required
                    placeholder="carlos@miclub.com"
                    value={wizardOwnerEmail}
                    onChange={(e) => setWizardOwnerEmail(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-300">Contraseña</Label>
                    <button
                      type="button"
                      onClick={() => setWizardOwnerPassword(`admin${Math.floor(1000 + Math.random() * 9000)}`)}
                      className="text-[10px] text-emerald-400 hover:underline"
                    >
                      ⚡ Random
                    </button>
                  </div>
                  <Input 
                    required
                    value={wizardOwnerPassword}
                    onChange={(e) => setWizardOwnerPassword(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* 3. Usuario Canchero */}
            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-900/40 space-y-3">
              <div className="flex items-center justify-between text-amber-400 font-bold text-xs uppercase tracking-wider">
                <span className="flex items-center gap-2">
                  <Coffee className="w-4 h-4" />
                  3. Credenciales del Encargado (Mostrador)
                </span>
                <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">TENANT_STAFF</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Nombre Completo</Label>
                  <Input 
                    required
                    placeholder="Ej. Lucas Encargado"
                    value={wizardStaffName}
                    onChange={(e) => setWizardStaffName(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">WhatsApp / Celular</Label>
                  <Input 
                    placeholder="+54 9 381 555-2222"
                    value={wizardStaffPhone}
                    onChange={(e) => setWizardStaffPhone(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Email de Ingreso</Label>
                  <Input 
                    type="email"
                    required
                    placeholder="mostrador@miclub.com"
                    value={wizardStaffEmail}
                    onChange={(e) => setWizardStaffEmail(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-300">Contraseña</Label>
                    <button
                      type="button"
                      onClick={() => setWizardStaffPassword(`staff${Math.floor(1000 + Math.random() * 9000)}`)}
                      className="text-[10px] text-amber-400 hover:underline"
                    >
                      ⚡ Random
                    </button>
                  </div>
                  <Input 
                    required
                    value={wizardStaffPassword}
                    onChange={(e) => setWizardStaffPassword(e.target.value)}
                    className="h-9 rounded-xl border-slate-800 bg-slate-950 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsQuickWizardModalOpen(false)}
                className="rounded-xl border-slate-800 text-xs flex-1 sm:flex-initial"
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-extrabold rounded-xl text-xs flex-1 sm:flex-initial"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Crear Club + Dueño + Encargado en 1 Click
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Resultado de Alta Rápida con botones para WhatsApp */}
      <Dialog open={isWizardResultModalOpen} onOpenChange={setIsWizardResultModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg bg-slate-950 border-slate-800 text-slate-100 rounded-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <DialogHeader className="pr-6">
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ¡Club y Usuarios Creados con Éxito!
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {wizardResult?.clubName} ya está activo. Copiá y enviá las credenciales a cada uno:
            </DialogDescription>
          </DialogHeader>

          {wizardResult && (
            <div className="space-y-4 py-2">
              {/* Tarjeta Dueño */}
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Dueño: {wizardResult.owner.name}
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">Admin Total</Badge>
                </div>
                <div className="text-xs text-slate-300 font-mono space-y-0.5">
                  <div>Email: <span className="text-white">{wizardResult.owner.email}</span></div>
                  <div>Clave: <span className="text-white">{wizardResult.owner.password}</span></div>
                </div>
                <Button
                  onClick={() => handleCopyWhatsAppMessage(wizardResult.owner)}
                  className="w-full h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                >
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                  Copiar Mensaje de WhatsApp (Dueño)
                </Button>
              </div>

              {/* Tarjeta Canchero */}
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                    <Coffee className="w-4 h-4" />
                    Encargado: {wizardResult.staff.name}
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">Turnos y Cantina</Badge>
                </div>
                <div className="text-xs text-slate-300 font-mono space-y-0.5">
                  <div>Email: <span className="text-white">{wizardResult.staff.email}</span></div>
                  <div>Clave: <span className="text-white">{wizardResult.staff.password}</span></div>
                </div>
                <Button
                  onClick={() => handleCopyWhatsAppMessage(wizardResult.staff)}
                  className="w-full h-8 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg"
                >
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                  Copiar Mensaje de WhatsApp (Encargado)
                </Button>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  onClick={() => {
                    setIsWizardResultModalOpen(false)
                    setActiveTab('USERS')
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl"
                >
                  Ver en el Listado de Usuarios
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: ACTIVAR CLUB Y ASIGNAR PLAN SAAS */}
      <Dialog open={Boolean(activatingTenant)} onOpenChange={(open) => !open && setActivatingTenant(null)}>
        <DialogContent className="sm:max-w-md bg-slate-900 border border-slate-800 text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-emerald-400">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Activar Club y Otorgar Acceso
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Otorgá el acceso y poder total a <strong className="text-white">{activatingTenant?.name}</strong> asignando su plan de canchas.
            </DialogDescription>
          </DialogHeader>

          {activatingTenant && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-300">
                  Seleccionar Plan de Canchas Contratado:
                </Label>
                <div className="grid grid-cols-1 gap-2">
                  {SAAS_PLANS_LIST.map((plan) => {
                    const isSelected = activatingTenant.plan_id === plan.id
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setActivatingTenant({ ...activatingTenant, plan_id: plan.id })}
                        className={cn(
                          "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between",
                          isSelected
                            ? "bg-emerald-500/10 border-emerald-500 text-white shadow-sm shadow-emerald-950/40"
                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{plan.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                              {plan.badge}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {plan.courtsLabel} • Tarifa: {plan.priceTurnosLabel}
                          </p>
                        </div>
                        <div className="shrink-0 ml-3">
                          <div className={cn(
                            "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                            isSelected ? "border-emerald-400 bg-emerald-500 text-white" : "border-slate-600"
                          )}>
                            {isSelected && <Check className="w-3 h-3 stroke-3" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Canchas activas del predio:</span>
                  <span className="font-semibold text-white">{activatingTenant.active_courts} canchas</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Estado resultante:</span>
                  <span className="font-bold text-emerald-400">100% Habilitado y Operativo</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActivatingTenant(null)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={isActivating}
                  onClick={handleConfirmActivation}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-900/40 cursor-pointer flex items-center gap-1.5"
                >
                  {isActivating ? (
                    <span>Habilitando...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar y Dar Acceso Total</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: ACTIVAR PERÍODO DE PRUEBA DE 15 DÍAS */}
      <Dialog open={Boolean(activatingTrialTenant)} onOpenChange={(open) => !open && setActivatingTrialTenant(null)}>
        <DialogContent className="sm:max-w-md bg-slate-900 border border-slate-800 text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-purple-400">
              <Gift className="w-5 h-5 text-purple-400" />
              {activatingTrialTenant?.is_trial ? 'Extender Período de Prueba' : 'Activar Período de Prueba Gratis'}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Habilitá el acceso completo y gratuito a <strong className="text-white">{activatingTrialTenant?.name}</strong> para que puedan probar la plataforma.
            </DialogDescription>
          </DialogHeader>

          {activatingTrialTenant && (
            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/40 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-300 font-medium">Club seleccionado:</span>
                  <span className="font-bold text-white text-sm">{activatingTrialTenant.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-300 font-medium">Duración de la prueba:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-purple-500/20 text-purple-200 border border-purple-500/40 px-2 py-0.5 rounded-md font-bold">
                      {trialDaysToSet} días corridos
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-300 font-medium">Fecha de vencimiento:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {trialExpirationPreview}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2 text-slate-300">
                <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  ¿Qué incluye el período de prueba de 15 días?
                </p>
                <ul className="space-y-1.5 text-slate-400 pl-1">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Acceso total al panel de administración del club y canchas.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Portal público de reservas online habilitado (/club/{activatingTrialTenant.slug}).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Control de caja, turnos fijos y gestión de clientes.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Exención total de facturación SaaS durante los 15 días.</span>
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActivatingTrialTenant(null)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={isActivatingTrial}
                  onClick={handleConfirmTrialActivation}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-md shadow-purple-900/40 cursor-pointer flex items-center gap-1.5"
                >
                  {isActivatingTrial ? (
                    <span>Activando prueba...</span>
                  ) : (
                    <>
                      <Gift className="w-4 h-4" />
                      <span>{activatingTrialTenant.is_trial ? 'Extender 15 Días' : 'Confirmar y Activar 15 Días'}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación: Eliminar Usuario */}
      <Dialog open={!!confirmDeleteUser} onOpenChange={(o) => { if (!o) setConfirmDeleteUser(null) }}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <Trash2 className="w-5 h-5" />
              Eliminar Usuario
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Esta acción es <strong className="text-rose-400">permanente e irreversible</strong>. El usuario perderá el acceso al sistema.
            </DialogDescription>
          </DialogHeader>
          {confirmDeleteUser && (
            <div className="py-2 px-1">
              <p className="text-sm text-slate-300">
                ¿Segúes que querés eliminar al usuario{' '}
                <span className="font-bold text-white">&ldquo;{confirmDeleteUser.name}&rdquo;</span>?
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteUser(null)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDeleteUser}
              disabled={loadingDeleteUserId !== null}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
            >
              {loadingDeleteUserId ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Sí, eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
