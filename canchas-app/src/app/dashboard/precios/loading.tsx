import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function PreciosLoading() {
  return (
    <PageSkeleton
      variant="table"
      title="Reglas de Precios"
      description="Cargando tarifas horarias y turnos..."
    />
  )
}
