import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET } from '@/app/auth/logout/route'

const mockSignOut = vi.fn().mockResolvedValue({ error: null })
const mockGetUser = vi.fn().mockResolvedValue({
  data: {
    user: {
      id: 'test-user-id-123',
      email: 'owner@club.com',
    },
  },
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      signOut: mockSignOut,
      getUser: mockGetUser,
    },
  })),
  createServiceClient: vi.fn().mockImplementation(async () => ({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([
      { name: 'sb-project-auth-token', value: 'secret' },
      { name: 'canchar_tenant_id', value: 'tenant-456' },
      { name: 'demo_user_role', value: 'TENANT_ADMIN' },
    ]),
    delete: vi.fn(),
    set: vi.fn(),
  }),
}))

describe('Server Logout Route Handler (/auth/logout)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('revokes server session via Supabase Auth signOut({ scope: "global" })', async () => {
    const request = new Request('http://localhost:3000/auth/logout', {
      method: 'POST',
      headers: {
        cookie: 'sb-project-auth-token=secret; canchar_tenant_id=tenant-456',
      },
    })

    const response = await POST(request)

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('emits Set-Cookie expiration headers for Supabase tokens and tenant cookies', async () => {
    const request = new Request('http://localhost:3000/auth/logout', {
      method: 'POST',
      headers: {
        cookie: 'sb-custom-auth-token=secret123; canchar_tenant_id=tenant-789; demo_user_role=admin',
      },
    })

    const response = await POST(request)
    const setCookieHeaders = response.headers.getSetCookie?.() || []

    // Verificar que se destruyan las cookies de Supabase y de tenant
    const hasSbDestroy = setCookieHeaders.some(
      (header) => header.includes('sb-custom-auth-token') && (header.includes('Max-Age=0') || header.includes('1970'))
    )
    const hasTenantDestroy = setCookieHeaders.some(
      (header) => header.includes('canchar_tenant_id') && (header.includes('Max-Age=0') || header.includes('1970'))
    )

    expect(hasSbDestroy).toBe(true)
    expect(hasTenantDestroy).toBe(true)
  })

  it('sets strict anti-cache headers and Clear-Site-Data: "cookies"', async () => {
    const request = new Request('http://localhost:3000/auth/logout', {
      method: 'GET',
    })

    const response = await GET(request)

    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(response.headers.get('Clear-Site-Data')).toBe('"cookies"')
  })
})
