import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function LucesLoading() {
  return (
    <PageSkeleton
      variant="cards"
      title="Control de Luces"
      description="Cargando circuitos y temporizadores..."
    />
  )
}
