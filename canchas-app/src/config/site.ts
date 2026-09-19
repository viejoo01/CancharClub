// src/config/site.ts
// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DEL SITIO Y BRANDING — CANCHARCLUB
// Dominio web oficial: cancharclub.com.ar
// ==============================================================================

export const siteConfig = {
  name: 'Canchar Club',
  shortName: 'Canchar',
  tagline: 'Tu predio bajo control',
  description: 'Plataforma de gestión integral y reservas online para complejos deportivos.',
  domain: 'cancharclub.com.ar',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar',
  ogImage: 'https://cancharclub.com.ar/og-cancharclub.jpg',
  supportEmail: 'soporte@cancharclub.com.ar',
  supportPhone: '+54 9 381 600-1122',
  statementDescriptor: 'CANCHARCLUB',

  // Enlaces de contacto y canales de atención
  links: {
    whatsapp: 'https://wa.me/5493816001122',
    whatsappSupport: (customMessage?: string) => {
      const base = 'https://wa.me/5493816001122'
      if (!customMessage) return base
      return `${base}?text=${encodeURIComponent(customMessage)}`
    },
    instagram: 'https://instagram.com/cancharclub',
    twitter: 'https://x.com/cancharclub',
    github: 'https://github.com/cancharclub',
  },

  // Datos bancarios para liquidación de abonos SaaS
  billing: {
    aliasCbu: 'cancharclub.mp',
    cbuNumber: '0000003100012345678901',
    accountHolder: 'CancharClub',
  },

  // Navegación principal del portal
  mainNav: [
    {
      title: 'Inicio',
      href: '/',
    },
    {
      title: 'Portal de Reservas',
      href: '/club/elite-1244',
    },
    {
      title: 'Panel Administrativo',
      href: '/dashboard',
    },
    {
      title: 'Planes SaaS',
      href: '/dashboard/plan',
    },
  ],
} as const

export type SiteConfig = typeof siteConfig
