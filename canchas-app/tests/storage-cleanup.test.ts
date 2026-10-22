import { describe, it, expect, beforeEach } from 'vitest'
import { clearClientSensitiveStorage } from '@/lib/storage-cleanup'

class MockStorage implements Storage {
  private store: Map<string, string> = new Map()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

describe('Storage Cleanup Security Engine', () => {
  let mockLocal: MockStorage
  let mockSession: MockStorage

  beforeEach(() => {
    mockLocal = new MockStorage()
    mockSession = new MockStorage()
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocal,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: mockSession,
      writable: true,
      configurable: true,
    })
  })

  it('purges all sensitive canchar_* and demo_* keys while preserving canchar_theme', () => {
    mockLocal.setItem('canchar_today_schedule_snapshot', JSON.stringify({ turnos: 15 }))
    mockLocal.setItem('canchar_cached_tenant_id', 'tenant-123')
    mockLocal.setItem('canchar_player_phone', '3816839320')
    mockLocal.setItem('demo_user_role', 'admin')
    mockLocal.setItem('canchar_theme', 'dark')
    mockLocal.setItem('other_app_key', 'safe')
    mockSession.setItem('active_session_token', 'secret123')

    expect(mockLocal.getItem('canchar_today_schedule_snapshot')).toBeTruthy()
    expect(mockSession.getItem('active_session_token')).toBeTruthy()

    clearClientSensitiveStorage()

    // Sensitive keys removed
    expect(mockLocal.getItem('canchar_today_schedule_snapshot')).toBeNull()
    expect(mockLocal.getItem('canchar_cached_tenant_id')).toBeNull()
    expect(mockLocal.getItem('canchar_player_phone')).toBeNull()
    expect(mockLocal.getItem('demo_user_role')).toBeNull()
    expect(mockSession.getItem('active_session_token')).toBeNull()

    // Non-sensitive theme preference and unrelated keys preserved
    expect(mockLocal.getItem('canchar_theme')).toBe('dark')
    expect(mockLocal.getItem('other_app_key')).toBe('safe')
  })
})
