import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function PlanLoading() {
  return (
    <PageSkeleton
      variant="cards"
      title="Mi Plan CancharClub"
      description="Cargando suscripción y módulos contratados..."
    />
  )
}
