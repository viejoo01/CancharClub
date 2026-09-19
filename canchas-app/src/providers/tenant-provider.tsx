'use client'

import React, { createContext, useContext, useEffect } from 'react'

let globalCachedTenantId: string | null = null

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
        globalCachedTenantId = local
        return local
      }
    } catch {}
  }
  return null
}

export function setGlobalCachedTenantId(val: string | null) {
  if (val) {
    globalCachedTenantId = val
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('canchar_cached_tenant_id', val)
      } catch {}
    }
  }
}

export const TenantContext = createContext<string | null>(null)

export function TenantProvider({
  value,
  children,
}: {
  value: string | null
  children: React.ReactNode
}) {
  if (value && !globalCachedTenantId) {
    setGlobalCachedTenantId(value)
  }

  useEffect(() => {
    if (value) {
      setGlobalCachedTenantId(value)
    }
  }, [value])

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenantContext(): string | null {
  return useContext(TenantContext)
}
