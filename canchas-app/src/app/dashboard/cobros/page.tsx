'use client'

import { useState, useEffect } from 'react'
import NextLink from 'next/link'
import { 
  Building2, 
  ShieldCheck, 
  Save, 
  Loader2, 
  CheckCircle2, 
  ShieldAlert
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { 
  getTenantPaymentSettings, 
  saveTenantBankSettings
} from '@/actions/tenant-payment-settings.actions'
import { useTenantId, useUserRole } from '@/hooks/use-tenant-id'
import { setGlobalCachedTenantId } from '@/providers/tenant-provider'

export default function CobrosConfigPage() {
  const tenantId = useTenantId()
  const { role, isOwner } = useUserRole()
  const [loading, setLoading] = useState(true)
  const [savingBank, setSavingBank] = useState(false)

  // Datos bancarios
  const [bankName, setBankName] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [cbu, setCbu] = useState('')
  const [alias, setAlias] = useState('')
  const [cuit, setCuit] = useState('')
  const [whatsappPhone, setWhatsappPhone] = useState('')

  // Estado de persistencia y borrador
  const [isSavedInDb, setIsSavedInDb] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function loadSettings(isInitial = false) {
      if (isInitial) setLoading(true)
      try {
        const settings = await getTenantPaymentSettings(tenantId || undefined)
        if (settings && isMounted) {
          if (settings.tenantId) {
            setGlobalCachedTenantId(settings.tenantId)
          }
          const hasDbData = Boolean(settings.accountHolder && (settings.alias || settings.cbu))
          setIsSavedInDb(hasDbData)

          // Revisar si había borrador en sessionStorage
          let draft: Record<string, string> | null = null
          try {
            const raw = sessionStorage.getItem('canchar_draft_bank_settings')
            if (raw) draft = JSON.parse(raw)
          } catch {}

          if (!hasUnsavedChanges) {
            if (hasDbData) {
              setBankName(settings.bankName || '')
              setAccountHolder(settings.accountHolder || '')
              setCbu(settings.cbu || '')
              setAlias(settings.alias || '')
              setCuit(settings.cuit || '')
              setWhatsappPhone(settings.whatsappPhone || '')
            } else if (draft && (draft.accountHolder || draft.alias || draft.bankName || draft.cbu)) {
              setBankName(draft.bankName || '')
              setAccountHolder(draft.accountHolder || '')
              setCbu(draft.cbu || '')
              setAlias(draft.alias || '')
              setCuit(draft.cuit || '')
              setWhatsappPhone(draft.whatsappPhone || '')
              setHasUnsavedChanges(true)
            } else {
              setBankName(settings.bankName || '')
              setAccountHolder(settings.accountHolder || '')
              setCbu(settings.cbu || '')
              setAlias(settings.alias || '')
              setCuit(settings.cuit || '')
              setWhatsappPhone(settings.whatsappPhone || '')
            }
          }
        }
      } catch (err) {
        console.error('Error cargando configuración de cobros:', err)
      } finally {
        if (isMounted && isInitial) {
          setLoading(false)
        }
      }
    }

    void loadSettings(true)

    // Sondeo de respaldo cada 60 segundos (cobros no cambian en tiempo real)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void loadSettings(false)
    }, 60000)

    const handleSync = () => void loadSettings(false)
    window.addEventListener('focus', handleSync)
    document.addEventListener('visibilitychange', handleSync)

    return () => {
      isMounted = false
      clearInterval(interval)
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', handleSync)
    }
  }, [tenantId, hasUnsavedChanges])

  const handleFieldChange = (fieldKey: string, setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setter(val)
    setHasUnsavedChanges(true)
    try {
      const current = {
        bankName: fieldKey === 'bankName' ? val : bankName,
        accountHolder: fieldKey === 'accountHolder' ? val : accountHolder,
        cbu: fieldKey === 'cbu' ? val : cbu,
        alias: fieldKey === 'alias' ? val : alias,
        cuit: fieldKey === 'cuit' ? val : cuit,
        whatsappPhone: fieldKey === 'whatsappPhone' ? val : whatsappPhone,
      }
      sessionStorage.setItem('canchar_draft_bank_settings', JSON.stringify(current))
    } catch {}
  }

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountHolder.trim() || (!alias.trim() && !cbu.trim())) {
      toast.error('Completá al menos el Titular y el Alias o CBU de tu cuenta')
      return
    }

    setSavingBank(true)
    try {
      const res = await saveTenantBankSettings(tenantId || undefined, {
        bankName,
        accountHolder,
        cbu,
        alias,
        cuit,
        whatsappPhone,
        paymentMethods: ['TRANSFER'],
      })

      if (res.success) {
        try {
          sessionStorage.removeItem('canchar_draft_bank_settings')
        } catch {}
        setHasUnsavedChanges(false)
        setIsSavedInDb(true)
        if (res.savedData) {
          if (res.savedData.tenantId) {
            setGlobalCachedTenantId(res.savedData.tenantId)
          }
          setBankName(res.savedData.bankName ?? bankName)
          setAccountHolder(res.savedData.accountHolder ?? accountHolder)
          setCbu(res.savedData.cbu ?? cbu)
          setAlias(res.savedData.alias ?? alias)
          setCuit(res.savedData.cuit ?? cuit)
          setWhatsappPhone(res.savedData.whatsappPhone ?? whatsappPhone)
        }
        toast.success('¡Datos bancarios guardados en la base de datos!', {
          description: 'Los jugadores verán estos datos para transferir la seña al reservar.',
        })
      } else {
        toast.error(res.error || 'Error al guardar datos bancarios')
      }
    } catch {
      toast.error('Error inesperado al guardar')
    } finally {
      setSavingBank(false)
    }
  }

  if (role === 'TENANT_STAFF' || !isOwner) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <Card className="border-red-500/30 bg-red-950/20 text-center p-6 shadow-xl">
          <CardHeader className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3">
              <ShieldAlert className="w-8 h-8 text-red-400" />
            </div>
            <CardTitle className="text-xl font-bold text-white">Acceso Restringido</CardTitle>
            <CardDescription className="text-slate-300 max-w-md mt-2 text-sm leading-relaxed">
              La configuración de cuentas bancarias y recepción de señas está reservada exclusivamente para los administradores y dueños del club.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pt-2">
            <Button asChild variant="outline" className="border-slate-700 bg-slate-800 text-slate-200 hover:text-white">
              <NextLink href="/dashboard">
                Volver al Panel Principal
              </NextLink>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
        <span>Cargando cuentas de cobro...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight text-white">
            Cuentas de Cobro & Señas del Club
          </h2>
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
            100% Directo a tu Club
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Configurá la cuenta bancaria o billetera virtual (Mercado Pago, banco, etc.) donde recibirás las transferencias directas de las señas.
        </p>
      </div>

      {/* Banner de Garantía y Transparencia */}
      <div className="p-4 rounded-2xl bg-linear-to-r from-emerald-950/50 via-slate-900 to-slate-900 border border-emerald-500/30 flex items-start gap-3.5 shadow-md">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1 text-xs">
          <h4 className="font-extrabold text-white text-sm">
            Tus señas van directamente a tu cuenta, sin intermediarios
          </h4>
          <p className="text-slate-300 leading-relaxed">
            <strong>CancharClub nunca retiene ni toca la recaudación de tus canchas.</strong> Cuando un jugador abona una seña por transferencia, el dinero se acredita íntegramente en tu cuenta configurada. La plataforma solo te cobra el abono mensual fijo del software.
          </p>
        </div>
      </div>

      {/* ─── 1. DATOS BANCARIOS (TRANSFERENCIA DIRECTA CON CBU/ALIAS) ─── */}
      <Card className="border-slate-800 bg-slate-900/80 rounded-2xl overflow-hidden shadow-lg">
        <CardHeader className="border-b border-slate-800 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-white">
                  Cuenta Bancaria o Billetera Virtual (Transferencias)
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Los jugadores transferirán la seña directamente a este Alias o CBU
                </CardDescription>
              </div>
            </div>
            <div>
              {isSavedInDb && !hasUnsavedChanges ? (
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[11px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Activo en Base de Datos
                </Badge>
              ) : hasUnsavedChanges ? (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[11px] font-bold flex items-center gap-1 animate-pulse">
                  Cambios pendientes de guardar
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-[11px] font-bold">
                  Recomendado
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <form onSubmit={handleSaveBank} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bankName" className="text-xs font-semibold text-slate-300">
                  Banco o Billetera Virtual *
                </Label>
                <Input
                  id="bankName"
                  value={bankName}
                  onChange={handleFieldChange('bankName', setBankName)}
                  placeholder="Ej. Mercado Pago, Banco Galicia, Santander"
                  className="h-10 rounded-xl bg-slate-950 border-slate-800 text-xs focus:border-emerald-500 text-white"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountHolder" className="text-xs font-semibold text-slate-300">
                  Titular de la Cuenta *
                </Label>
                <Input
                  id="accountHolder"
                  value={accountHolder}
                  onChange={handleFieldChange('accountHolder', setAccountHolder)}
                  placeholder="Ej. Club Deportivo SRL"
                  className="h-10 rounded-xl bg-slate-950 border-slate-800 text-xs focus:border-emerald-500 text-white"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="alias" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Alias para Transferir *</span>
                  <span className="text-[10px] text-emerald-400 font-normal">Fácil de recordar para el jugador</span>
                </Label>
                <Input
                  id="alias"
                  value={alias}
                  onChange={handleFieldChange('alias', setAlias)}
                  placeholder="Ej. miclub.mp"
                  className="h-10 rounded-xl bg-slate-950 border-slate-800 text-xs font-mono font-bold text-emerald-400 focus:border-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cbu" className="text-xs font-semibold text-slate-300">
                  CBU o CVU (22 dígitos)
                </Label>
                <Input
                  id="cbu"
                  value={cbu}
                  onChange={handleFieldChange('cbu', setCbu)}
                  placeholder="0000003100098765432101"
                  className="h-10 rounded-xl bg-slate-950 border-slate-800 text-xs font-mono text-slate-200 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cuit" className="text-xs font-semibold text-slate-300">
                  CUIT o CUIL (Opcional)
                </Label>
                <Input
                  id="cuit"
                  value={cuit}
                  onChange={handleFieldChange('cuit', setCuit)}
                  placeholder="Ej. 30-71234567-9"
                  className="h-10 rounded-xl bg-slate-950 border-slate-800 text-xs text-slate-200 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="whatsapp" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>WhatsApp de Recepción de Comprobantes *</span>
                  <span className="text-[10px] text-slate-400 font-normal">Con código de país (549...)</span>
                </Label>
                <Input
                  id="whatsapp"
                  value={whatsappPhone}
                  onChange={handleFieldChange('whatsappPhone', setWhatsappPhone)}
                  placeholder="Ej. 5493814123456"
                  className="h-10 rounded-xl bg-slate-950 border-slate-800 text-xs text-slate-200 focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Vista Previa en Vivo de lo que ve el Jugador */}
            {(alias || accountHolder || bankName) && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Vista previa de cómo lo ve el jugador al transferir la seña:
                  </span>
                  {isSavedInDb && !hasUnsavedChanges && (
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      ✓ Sincronizado con reservas
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300 pt-1">
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block">Banco / Billetera:</span>
                    <strong className="text-white">{bankName || 'A definir'}</strong>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block">Titular de la cuenta:</span>
                    <strong className="text-white">{accountHolder || 'A definir'}</strong>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block">Alias para transferir:</span>
                    <strong className="text-emerald-400 font-mono text-sm">{alias || 'A definir'}</strong>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block">CBU / CVU:</span>
                    <strong className="text-slate-200 font-mono text-xs">{cbu || 'Opcional (solo si se ingresa)'}</strong>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <div>
                {hasUnsavedChanges && (
                  <span className="text-xs text-amber-400 font-medium">
                    Hay cambios sin guardar. Presioná &quot;Guardar Datos Bancarios&quot;.
                  </span>
                )}
              </div>
              <Button
                type="submit"
                disabled={savingBank}
                className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 gap-1.5"
              >
                {savingBank ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Guardar Datos Bancarios</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
