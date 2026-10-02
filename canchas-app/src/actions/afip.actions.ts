'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { emitElectronicInvoice, type AfipConfig, type EmitInvoiceParams, type EmitInvoiceResult } from '@/lib/afip'
import { revalidatePath } from 'next/cache'
import { resolveEffectiveTenantId, assertTenantAdmin, assertTenantMember } from '@/lib/auth-security'

export interface IssuedInvoice {
  id: string
  comprobanteTipo: string
  numeroCompleto: string
  fechaEmision: string
  cliente: string
  cuitDni: string
  montoTotal: number
  cae: string
  caeVto: string
  concepto: string
  qrUrl: string
}

// In-memory fallback si la tabla no existe en Supabase todavía
let mockInvoices: IssuedInvoice[] = []

export async function getAfipConfig(tenantId?: string): Promise<AfipConfig> {
  const targetTenantId = await resolveEffectiveTenantId(tenantId)

  if (targetTenantId) {
    try {
      const auth = await assertTenantMember(targetTenantId)
      if (auth.authorized) {
        const supabase = await createServiceClient()
        const { data } = await supabase
          .from('tenants')
          .select('name, bank_cuit, address, description')
          .eq('id', targetTenantId)
          .maybeSingle()
        if (data) {
          let afipMeta: Record<string, unknown> = {}
          try {
            if (data.description) {
              const parsed = JSON.parse(data.description)
              if (parsed.afip && typeof parsed.afip === 'object') {
                afipMeta = parsed.afip as Record<string, unknown>
              }
            }
          } catch {}

          const rawCuit = (afipMeta.cuit as string) || data.bank_cuit || ''
          const isBogusCuit = rawCuit.replace(/\D/g, '') === '20381456789'
          const cleanCuit = isBogusCuit ? '' : rawCuit

          return {
            cuit: cleanCuit,
            puntoVenta: typeof afipMeta.puntoVenta === 'number' ? afipMeta.puntoVenta : 1,
            razonSocial: (afipMeta.razonSocial as string) || data.name || '',
            condicionIva: (afipMeta.condicionIva as 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO') || 'MONOTRIBUTO',
            domicilioComercial: (afipMeta.domicilioComercial as string) || data.address || '',
            inicioActividades: (afipMeta.inicioActividades as string) || new Date().toISOString().split('T')[0],
            ingresosBrutos: (afipMeta.ingresosBrutos as string) || '',
            environment: 'TESTING'
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    cuit: '',
    puntoVenta: 1,
    razonSocial: '',
    condicionIva: 'MONOTRIBUTO',
    domicilioComercial: '',
    inicioActividades: new Date().toISOString().split('T')[0],
    ingresosBrutos: '',
    environment: 'TESTING'
  }
}

export async function saveAfipConfig(
  tenantId: string | undefined | null,
  config: AfipConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const targetTenantId = await resolveEffectiveTenantId(tenantId)
    if (!targetTenantId) {
      return { success: false, error: 'No se pudo identificar el club' }
    }

    const auth = await assertTenantAdmin(targetTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'No tienes permisos para modificar la facturación de este club' }
    }

    const supabase = await createServiceClient()

    // Obtener metadatos previos para no pisar otras configuraciones
    const { data: tenant } = await supabase
      .from('tenants')
      .select('description')
      .eq('id', targetTenantId)
      .maybeSingle()

    let prevMeta: Record<string, unknown> = {}
    try {
      if (tenant?.description) {
        prevMeta = JSON.parse(tenant.description)
      }
    } catch {}

    const cleanCuit = config.cuit?.trim() || null
    const updatedMeta = {
      ...prevMeta,
      afip: {
        cuit: cleanCuit,
        puntoVenta: config.puntoVenta || 1,
        razonSocial: config.razonSocial?.trim() || null,
        condicionIva: config.condicionIva || 'MONOTRIBUTO',
        domicilioComercial: config.domicilioComercial?.trim() || null,
        inicioActividades: config.inicioActividades || null,
        ingresosBrutos: config.ingresosBrutos || null,
      }
    }

    const { error } = await supabase.from('tenants').update({ 
      bank_cuit: cleanCuit,
      address: config.domicilioComercial?.trim() || null,
      description: JSON.stringify(updatedMeta),
      updated_at: new Date().toISOString() 
    }).eq('id', targetTenantId)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/facturacion')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al guardar configuración' }
  }
}

export async function getIssuedInvoices(): Promise<IssuedInvoice[]> {
  return mockInvoices
}

export async function emitInvoiceAction(params: EmitInvoiceParams): Promise<EmitInvoiceResult> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(params.tenantId)
    if (!effectiveTenantId) {
      return { success: false, error: 'No se pudo identificar el club emisor' }
    }

    const auth = await assertTenantMember(effectiveTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos para emitir facturas en este club' }
    }

    const config = await getAfipConfig(effectiveTenantId)
    if (!config.cuit || !config.cuit.trim()) {
      return { 
        success: false, 
        error: 'Debés configurar tu CUIT emisor de AFIP antes de emitir comprobantes.' 
      }
    }

    const result = await emitElectronicInvoice(config, params)

    if (result.success && result.cae && result.comprobanteNumero) {
      const ptoStr = (config.puntoVenta || 1).toString().padStart(4, '0')
      const nroStr = result.comprobanteNumero.toString().padStart(8, '0')
      const tipoNombre = params.tipoComprobante === 6 ? 'Factura B' : 'Factura C'

      const newInv: IssuedInvoice = {
        id: `inv-${Date.now()}`,
        comprobanteTipo: tipoNombre,
        numeroCompleto: `${ptoStr}-${nroStr}`,
        fechaEmision: result.fechaEmision || new Date().toISOString().split('T')[0],
        cliente: params.nombreCliente,
        cuitDni: params.nroDocRec ? `${params.nroDocRec}` : 'Consumidor Final',
        montoTotal: result.importeTotal || 0,
        cae: result.cae,
        caeVto: result.caeVencimiento || '',
        concepto: params.items.map(i => i.description).join(', '),
        qrUrl: result.qrUrl || ''
      }

      mockInvoices = [newInv, ...mockInvoices]
      revalidatePath('/dashboard/facturacion')
      revalidatePath('/dashboard/caja')
    }

    return result
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al procesar facturación'
    }
  }
}
