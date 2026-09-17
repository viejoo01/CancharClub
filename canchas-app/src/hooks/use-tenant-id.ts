// src/hooks/use-tenant-id.ts
// Hook para obtener el tenant_id real del usuario autenticado.
// Reemplaza el uso de DEMO_TENANT_ID hardcodeado en todas las páginas del dashboard.
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

let cachedTenantId: string | null = null

export function useTenantId(): string | null {
  // Initialize from cache synchronously (avoids extra render cycle)
  const [tenantId, setTenantId] = useState<string | null>(() => cachedTenantId)

  useEffect(() => {
    // Already have the tenant_id (either from cache or previous fetch)
    if (tenantId) return

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (profile?.tenant_id) {
        cachedTenantId = profile.tenant_id
        setTenantId(profile.tenant_id)
      }
    })
  }, [tenantId])

  return tenantId
}
