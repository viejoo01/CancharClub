import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function TorneosLoading() {
  return (
    <PageSkeleton
      variant="cards"
      title="Torneos y Cuadros"
      description="Cargando competencias y brackets..."
    />
  )
}
