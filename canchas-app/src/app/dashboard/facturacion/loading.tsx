import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function FacturacionLoading() {
  return (
    <PageSkeleton
      variant="table"
      title="Facturación AFIP / ARCA"
      description="Cargando comprobantes fiscales emitidos..."
    />
  )
}
