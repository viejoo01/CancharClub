// src/hooks/use-tenant-id.ts
// Hook para obtener el tenant_id del usuario autenticado de forma síncrona y reactiva.
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  useTenantContext,
  useUserRoleContext,
  useTenantPlanContext,
  getGlobalCachedTenantId,
  setGlobalCachedTenantId,
  TenantProvider,
} from '@/providers/tenant-provider'
import {
  SAAS_PLANS,
  isFeatureAllowedForPlan,
  type SaaSPlanId,
  type SaaSFeatureKey,
  type SaaSPlanDefinition
} from '@/config/saas-plans'

export { TenantProvider }

export function useTenantPlan(): {
  planId: SaaSPlanId
  plan: SaaSPlanDefinition
  isFeatureAllowed: (feature: SaaSFeatureKey) => boolean
} {
  const planId = useTenantPlanContext() || 'MEDIANO_2'
  const plan = SAAS_PLANS[planId] || SAAS_PLANS.MEDIANO_2
  return {
    planId,
    plan,
    isFeatureAllowed: (feature: SaaSFeatureKey) => isFeatureAllowedForPlan(planId, feature),
  }
}

export function useTenantId(): string | null {
  const contextTenantId = useTenantContext()
  const [fallbackTenantId, setFallbackTenantId] = useState<string | null>(() => getGlobalCachedTenantId())

  useEffect(() => {
    let isMounted = true
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || !isMounted) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.tenant_id && isMounted) {
        setGlobalCachedTenantId(profile.tenant_id)
        setFallbackTenantId(profile.tenant_id)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  return contextTenantId || fallbackTenantId
}

export function useUserRole(): { role: string; isOwner: boolean } {
  const contextRole = useUserRoleContext()
  const [asyncRole, setAsyncRole] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || !isMounted) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role && isMounted) {
        setAsyncRole(profile.role)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

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
