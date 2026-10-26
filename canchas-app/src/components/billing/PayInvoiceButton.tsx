'use client'

import { useState } from 'react'
import { CreditCard, Loader2, AlertCircle } from 'lucide-react'
import { createInvoicePreference } from '@/app/actions/createInvoicePreference'

export interface PayInvoiceButtonProps {
  invoiceId: string
  amount: number
  status: 'UNPAID' | 'PAID' | string
  className?: string
}

export function PayInvoiceButton({ invoiceId, amount, status, className }: PayInvoiceButtonProps) {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800/50">
        Pagada
      </span>
    )
  }

  const handlePayment = async () => {
    try {
      setLoading(true)
      setErrorMessage(null)

      const result = await createInvoicePreference(invoiceId)

      if (!result.success || !result.initPoint) {
        setErrorMessage(result.error || 'No se pudo iniciar el cobro')
        return
      }

      // Redirigir al checkout oficial de Mercado Pago
      window.location.href = result.initPoint
    } catch {
      setErrorMessage('Ocurrió un error inesperado al procesar el pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handlePayment}
        disabled={loading}
        className={className || "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm cursor-pointer"}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Generando pago...</span>
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            <span>Pagar ${Number(amount).toLocaleString('es-AR')}</span>
          </>
        )}
      </button>

      {errorMessage && (
        <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </span>
      )}
    </div>
  )
}
