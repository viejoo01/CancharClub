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

export const TenantContext = createContext<string | null>(null)
export const UserRoleContext = createContext<string>('TENANT_ADMIN')

export function TenantProvider({
  value,
  role = 'TENANT_ADMIN',
  children,
}: {
  value: string | null
  role?: string | null
  children: React.ReactNode
}) {
  if (value && globalCachedTenantId !== value) {
    setGlobalCachedTenantId(value)
  }

  useEffect(() => {
    if (value && globalCachedTenantId !== value) {
      setGlobalCachedTenantId(value)
    }
  }, [value])

  return (
    <TenantContext.Provider value={value}>
      <UserRoleContext.Provider value={role || 'TENANT_ADMIN'}>
        {children}
      </UserRoleContext.Provider>
    </TenantContext.Provider>
  )
}

export function useTenantContext(): string | null {
  return useContext(TenantContext)
}

export function useUserRoleContext(): string {
  return useContext(UserRoleContext)
}
