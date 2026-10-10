'use client'

import React, { createContext, useContext, useEffect } from 'react'

let globalCachedTenantId: string | null = null

export function clearGlobalCachedTenantId() {
  globalCachedTenantId = null
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('canchar_cached_tenant_id')
    } catch {}
  }
}

export function getGlobalCachedTenantId(): string | null {
  if (globalCachedTenantId) return globalCachedTenantId

  if (typeof document !== 'undefined') {
    try {
      const match = document.cookie.match(/(?:^|;\s*)(?:canchar_tenant_id|demo_tenant_id)=([^;]+)/)
      if (match && match[1]) {
        globalCachedTenantId = decodeURIComponent(match[1])
        return globalCachedTenantId
      }
      const local = localStorage.getItem('canchar_cached_tenant_id')
      if (local) {
        const hasSession = document.cookie.includes('demo_user_role') || document.cookie.includes('sb-')
        if (hasSession) {
          globalCachedTenantId = local
          return local
        } else {
          localStorage.removeItem('canchar_cached_tenant_id')
        }
      }
    } catch {}
  }
  return null
}

export function setGlobalCachedTenantId(val: string | null) {
  if (!val) {
    clearGlobalCachedTenantId()
    return
  }
  globalCachedTenantId = val
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('canchar_cached_tenant_id', val)
    } catch {}
  }
  if (typeof document !== 'undefined') {
    try {
      document.cookie = `canchar_tenant_id=${val}; path=/; max-age=2592000; SameSite=Lax`
      document.cookie = `demo_tenant_id=${val}; path=/; max-age=2592000; SameSite=Lax`
    } catch {}
  }
}

let globalCachedTenantSlug: string | null = null

export function clearGlobalCachedTenantSlug() {
  globalCachedTenantSlug = null
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('canchar_cached_tenant_slug')
    } catch {}
  }
}

export function getGlobalCachedTenantSlug(): string | null {
  if (globalCachedTenantSlug) return globalCachedTenantSlug

  if (typeof document !== 'undefined') {
    try {
      const match = document.cookie.match(/(?:^|;\s*)(?:canchar_tenant_slug|demo_tenant_slug)=([^;]+)/)
      if (match && match[1]) {
        globalCachedTenantSlug = decodeURIComponent(match[1])
        return globalCachedTenantSlug
      }
      const local = localStorage.getItem('canchar_cached_tenant_slug')
      if (local) {
        globalCachedTenantSlug = local
        return local
      }
    } catch {}
  }
  return null
}

export function setGlobalCachedTenantSlug(val: string | null) {
  if (!val) {
    clearGlobalCachedTenantSlug()
    return
  }
  globalCachedTenantSlug = val
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('canchar_cached_tenant_slug', val)
    } catch {}
  }
  if (typeof document !== 'undefined') {
    try {
      document.cookie = `canchar_tenant_slug=${encodeURIComponent(val)}; path=/; max-age=2592000; SameSite=Lax`
      document.cookie = `demo_tenant_slug=${encodeURIComponent(val)}; path=/; max-age=2592000; SameSite=Lax`
    } catch {}
  }
}

import type { SaaSPlanId } from '@/config/saas-plans'

export const TenantContext = createContext<string | null>(null)
export const TenantSlugContext = createContext<string | null>(null)
export const UserRoleContext = createContext<string>('TENANT_ADMIN')
export const TenantPlanContext = createContext<SaaSPlanId>('MEDIANO_2')

export function TenantProvider({
  value,
  role = 'TENANT_ADMIN',
  planId = 'MEDIANO_2',
  slug = null,
  children,
}: {
  value: string | null
  role?: string | null
  planId?: SaaSPlanId
  slug?: string | null
  children: React.ReactNode
}) {
  if (value && globalCachedTenantId !== value) {
    setGlobalCachedTenantId(value)
  }

  if (slug && globalCachedTenantSlug !== slug) {
    setGlobalCachedTenantSlug(slug)
  }

  useEffect(() => {
    if (value && globalCachedTenantId !== value) {
      setGlobalCachedTenantId(value)
    }
  }, [value])

  useEffect(() => {
    if (slug && globalCachedTenantSlug !== slug) {
      setGlobalCachedTenantSlug(slug)
    }
  }, [slug])

  return (
    <TenantContext.Provider value={value}>
      <TenantSlugContext.Provider value={slug || null}>
        <UserRoleContext.Provider value={role || 'TENANT_ADMIN'}>
          <TenantPlanContext.Provider value={planId || 'MEDIANO_2'}>
            {children}
          </TenantPlanContext.Provider>
        </UserRoleContext.Provider>
      </TenantSlugContext.Provider>
    </TenantContext.Provider>
  )
}

export function useTenantContext(): string | null {
  return useContext(TenantContext)
}

export function useTenantSlugContext(): string | null {
  return useContext(TenantSlugContext)
}

export function useUserRoleContext(): string {
  return useContext(UserRoleContext)
}

export function useTenantPlanContext(): SaaSPlanId {
  return useContext(TenantPlanContext)
}
