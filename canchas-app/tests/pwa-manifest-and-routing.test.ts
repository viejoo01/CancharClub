import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/manifest/route'

describe('PWA Dynamic Manifest & Profile Routing Tests', () => {
  it('generates a dedicated manifest for Players with start_url pointing to player entry', async () => {
    const req = new NextRequest('http://localhost:3000/api/manifest?role=player')
    const res = await GET(req)
    
    expect(res.status).toBe(200)
    const json = await res.json()
    
    expect(json.start_url).toBe('/app?role=player')
    expect(json.name).toContain('Reservas')
    expect(json.short_name).toBe('Canchar Reservas')
    expect(json.id).toBe('https://cancharclub.com.ar/app?role=player')
    expect(json.shortcuts.some((s: { url: string }) => s.url === '/app?role=player')).toBe(true)
  })

  it('generates a dedicated manifest for Clubs with start_url pointing to club dashboard entry', async () => {
    const req = new NextRequest('http://localhost:3000/api/manifest?role=club')
    const res = await GET(req)
    
    expect(res.status).toBe(200)
    const json = await res.json()
    
    expect(json.start_url).toBe('/app?role=club')
    expect(json.name).toContain('Gestión de Clubes')
    expect(json.short_name).toBe('Canchar Club')
    expect(json.id).toBe('https://cancharclub.com.ar/app?role=club')
    expect(json.shortcuts.some((s: { url: string }) => s.url === '/app?role=club')).toBe(true)
  })

  it('generates a neutral smart dispatcher manifest when no role is specified', async () => {
    const req = new NextRequest('http://localhost:3000/api/manifest')
    const res = await GET(req)
    
    expect(res.status).toBe(200)
    const json = await res.json()
    
    expect(json.start_url).toBe('/app')
    expect(json.id).toBe('https://cancharclub.com.ar/app')
    expect(json.display).toBe('standalone')
  })
})
