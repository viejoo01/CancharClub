'use client'

import { useState } from 'react'
import { CreditCard, Loader2, AlertCircle } from 'lucide-react'
import { createInvoicePreference } from '@/app/actions/createInvoicePreference'
import { calculateInvoiceSurcharge } from '@/lib/billing/dunning'

export interface PayInvoiceButtonProps {
  invoiceId: string
  amount: number
  dueDate?: string | Date | null
  status: 'UNPAID' | 'PAID' | string
  className?: string
}

export function PayInvoiceButton({ invoiceId, amount, dueDate, status, className }: PayInvoiceButtonProps) {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800/50">
        Pagada
      </span>
    )
  }

  const breakdown = calculateInvoiceSurcharge(amount, dueDate || new Date())

  const handlePayment = async () => {
    try {
      setLoading(true)
      setErrorMessage(null)

      const result = await createInvoicePreference(invoiceId)

      if (!result.success || !result.initPoint) {
        setErrorMessage(result.error || 'No se pudo iniciar el cobro')
        return
      }

      window.location.href = result.initPoint
    } catch {
      setErrorMessage('Ocurrió un error inesperado al procesar el pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handlePayment}
        disabled={loading}
        className={className || "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm cursor-pointer"}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Generando enlace...</span>
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            <span>Pagar ${breakdown.totalAmount.toLocaleString('es-AR')}</span>
          </>
        )}
      </button>

      {breakdown.surchargeDays > 0 && (
        <span className="text-[11px] font-medium text-amber-400">
          Incluye +{breakdown.surchargePercentage}% de mora ({breakdown.surchargeDays} día{breakdown.surchargeDays > 1 ? 's' : ''})
        </span>
      )}

      {errorMessage && (
        <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </span>
      )}
    </div>
  )
}
