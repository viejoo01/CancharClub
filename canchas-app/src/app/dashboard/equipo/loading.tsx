import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function EquipoLoading() {
  return (
    <PageSkeleton
      variant="table"
      title="Equipo del Club"
      description="Cargando administradores y encargados..."
    />
  )
}
