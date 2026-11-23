import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function CajaLoading() {
  return (
    <PageSkeleton
      variant="table"
      title="Caja Diaria"
      description="Cargando movimientos de caja y balance..."
    />
  )
}
