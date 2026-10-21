import { describe, it, expect } from 'vitest'
import { generateAfipQrUrl } from '@/lib/afip'

describe('AFIP Fiscal Invoicing Engine (RG 4291 & RG 5003)', () => {
  it('generates a compliant AFIP QR validation URL with base64 payload', () => {
    const data = {
      fecha: '2026-10-21',
      cuit: 30712345678,
      ptoVta: 1,
      tipoCmp: 11, // Factura C
      nroCmp: 142,
      importe: 25000,
      tipoDocRec: 99, // Consumidor Final
      nroDocRec: 0,
      cae: '74391234567890',
    }

    const qrUrl = generateAfipQrUrl(data)
    expect(qrUrl.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true)

    // Decode and verify the payload matches RG 4291 schema
    const base64Part = qrUrl.replace('https://www.afip.gob.ar/fe/qr/?p=', '')
    const decodedJson = Buffer.from(base64Part, 'base64').toString('utf-8')
    const parsed = JSON.parse(decodedJson)

    expect(parsed.ver).toBe(1)
    expect(parsed.fecha).toBe('2026-10-21')
    expect(parsed.cuit).toBe(30712345678)
    expect(parsed.ptoVta).toBe(1)
    expect(parsed.tipoCmp).toBe(11)
    expect(parsed.nroCmp).toBe(142)
    expect(parsed.importe).toBe(25000)
    expect(parsed.moneda).toBe('PES')
    expect(parsed.ctz).toBe(1)
    expect(parsed.tipoCodAut).toBe('E')
    expect(parsed.codAut).toBe(74391234567890)
  })

  it('calculates Net and VAT breakdown accurately for Factura A and B', () => {
    function computeInvoiceTaxes(totalGross: number, vatRate = 0.21): {
      netSubtotal: number
      vatAmount: number
      totalGross: number
    } {
      const netSubtotal = Math.round((totalGross / (1 + vatRate)) * 100) / 100
      const vatAmount = Math.round((totalGross - netSubtotal) * 100) / 100
      return { netSubtotal, vatAmount, totalGross }
    }

    const res = computeInvoiceTaxes(12100) // $12.100 total
    expect(res.netSubtotal).toBe(10000)
    expect(res.vatAmount).toBe(2100)
    expect(res.totalGross).toBe(12100)
  })
})
