import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function JugadoresLoading() {
  return (
    <PageSkeleton
      variant="table"
      title="Reputación de Jugadores"
      description="Cargando historial de reservas y asistencia..."
    />
  )
}
