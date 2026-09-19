// src/hooks/use-tenant-id.ts
// Hook para obtener el tenant_id del usuario autenticado de forma síncrona y reactiva.
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  useTenantContext,
  getGlobalCachedTenantId,
  setGlobalCachedTenantId,
  TenantProvider,
} from '@/providers/tenant-provider'

export { TenantProvider }

export function useTenantId(): string | null {
  const contextTenantId = useTenantContext()
  const [fallbackTenantId, setFallbackTenantId] = useState<string | null>(() => getGlobalCachedTenantId())

  useEffect(() => {
    if (contextTenantId || fallbackTenantId) return

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (profile?.tenant_id) {
        setGlobalCachedTenantId(profile.tenant_id)
        setFallbackTenantId(profile.tenant_id)
      }
    })
  }, [contextTenantId, fallbackTenantId])

  return contextTenantId || fallbackTenantId
}
