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
          .select('name, bank_cuit, address')
          .eq('id', targetTenantId)
          .maybeSingle()
        if (data) {
          return {
            cuit: data.bank_cuit || '',
            puntoVenta: 1,
            razonSocial: data.name || 'Mi Club Deportivo',
            condicionIva: 'MONOTRIBUTO',
            domicilioComercial: data.address || '',
            inicioActividades: new Date().toISOString().split('T')[0],
            ingresosBrutos: '',
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
    razonSocial: 'Mi Club Deportivo',
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
    const { error } = await supabase.from('tenants').update({ 
      bank_cuit: config.cuit || null,
      address: config.domicilioComercial || null,
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
    if (params.tenantId) {
      const auth = await assertTenantMember(params.tenantId)
      if (!auth.authorized) {
        return { success: false, error: auth.error || 'Sin permisos para emitir facturas en este club' }
      }
    }

    const config = await getAfipConfig(params.tenantId)
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
