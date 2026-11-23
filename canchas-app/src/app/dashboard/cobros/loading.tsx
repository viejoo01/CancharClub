import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function CobrosLoading() {
  return (
    <PageSkeleton
      variant="cards"
      title="Cuentas de Cobro"
      description="Cargando configuración de pagos y Mercado Pago..."
    />
  )
}
