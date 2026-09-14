'use server'

import { createClient } from '@/lib/supabase/server'
import { emitElectronicInvoice, type AfipConfig, type EmitInvoiceParams, type EmitInvoiceResult } from '@/lib/afip'
import { revalidatePath } from 'next/cache'

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
let mockInvoices: IssuedInvoice[] = [
  {
    id: 'inv-1',
    comprobanteTipo: 'Factura C',
    numeroCompleto: '0001-00000412',
    fechaEmision: '2026-09-14',
    cliente: 'Martín Benítez',
    cuitDni: '38.123.456',
    montoTotal: 14000,
    cae: '74391823901245',
    caeVto: '2026-09-24',
    concepto: 'Alquiler Cancha 1 (Turno 19:00 hs)',
    qrUrl: 'https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjF9'
  },
  {
    id: 'inv-2',
    comprobanteTipo: 'Factura C',
    numeroCompleto: '0001-00000411',
    fechaEmision: '2026-09-13',
    cliente: 'Luciana Gómez',
    cuitDni: 'Consumidor Final',
    montoTotal: 16000,
    cae: '74391823901198',
    caeVto: '2026-09-23',
    concepto: 'Abono Mensual Pádel (Turno Fijo)',
    qrUrl: 'https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjF9'
  }
]

export async function getAfipConfig(tenantId = '00000000-0000-0000-0000-000000000001'): Promise<AfipConfig> {
  return {
    cuit: '20-38145678-9',
    puntoVenta: 1,
    razonSocial: 'Club Pádel Central SRL',
    condicionIva: 'MONOTRIBUTO',
    domicilioComercial: 'Av. Aconquija 1420, Yerba Buena, Tucumán',
    inicioActividades: '2023-03-01',
    ingresosBrutos: '381-998231-1',
    environment: 'TESTING'
  }
}

export async function saveAfipConfig(
  tenantId: string,
  config: AfipConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    await supabase.from('tenants').update({ updated_at: new Date().toISOString() }).eq('id', tenantId)
    revalidatePath('/dashboard/facturacion')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al guardar configuración' }
  }
}

export async function getIssuedInvoices(tenantId = '00000000-0000-0000-0000-000000000001'): Promise<IssuedInvoice[]> {
  return mockInvoices
}

export async function emitInvoiceAction(params: EmitInvoiceParams): Promise<EmitInvoiceResult> {
  try {
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
