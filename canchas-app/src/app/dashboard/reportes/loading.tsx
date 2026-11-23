import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function ReportesLoading() {
  return (
    <PageSkeleton
      variant="dashboard"
      title="Reportes de Ocupación"
      description="Cargando métricas de rendimiento y recaudación..."
    />
  )
}
