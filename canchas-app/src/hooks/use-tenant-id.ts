// src/hooks/use-tenant-id.ts
// Hook para obtener el tenant_id del usuario autenticado de forma síncrona y reactiva.
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  useTenantContext,
  useUserRoleContext,
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

export function useUserRole(): { role: string; isOwner: boolean } {
  const contextRole = useUserRoleContext()
  const [asyncRole, setAsyncRole] = useState<string | null>(null)

  useEffect(() => {
    if (contextRole) return
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role) {
        setAsyncRole(profile.role)
      }
    })
  }, [contextRole])

  const cookieRole = typeof document !== 'undefined'
    ? (() => {
        const match = document.cookie.match(/(?:^|;\s*)demo_user_role=([^;]+)/)
        return match && match[1] ? decodeURIComponent(match[1]) : null
      })()
    : null

  const role = contextRole || asyncRole || cookieRole || 'TENANT_ADMIN'
  const isOwner = role === 'TENANT_ADMIN' || role === 'SUPERADMIN' || role === 'ADMIN'
  return { role, isOwner }
}
