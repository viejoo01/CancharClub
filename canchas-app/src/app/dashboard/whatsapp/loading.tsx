import { PageSkeleton } from '@/components/shared/page-skeleton'

export default function WhatsappLoading() {
  return (
    <PageSkeleton
      variant="default"
      title="Bot de WhatsApp"
      description="Cargando configuración de mensajes y recordatorios..."
    />
  )
}
