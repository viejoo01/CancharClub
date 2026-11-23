import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function NotificacionesLoading() {
  return (
    <PageSkeleton
      variant="cards"
      title="Notificaciones del Club"
      description="Cargando alertas y avisos en vivo..."
    />
  )
}
