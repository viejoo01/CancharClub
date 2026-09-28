import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function MetricasLoading() {
  return <PageSkeleton variant="cards" title="Métricas & Ocupación" description="Calculando estadísticas en tiempo real desde la base de datos..." />
}
