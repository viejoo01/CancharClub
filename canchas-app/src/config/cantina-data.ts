// src/config/cantina-data.ts
// Catálogo base y tipos de productos para Cantina & Kiosco

export interface CantinaProduct {
  id: string
  name: string
  category: 'BEBIDAS' | 'EQUIPAMIENTO' | 'SNACKS'
  price: number
  stock: number
  emoji: string
  is_active?: boolean
}

export const INITIAL_CANTINA_PRODUCTS: CantinaProduct[] = [
  { id: 'p1', name: 'Gatorade / Powerade 500ml', category: 'BEBIDAS', price: 2500, stock: 48, emoji: '⚡', is_active: true },
  { id: 'p2', name: 'Agua Mineral 500ml', category: 'BEBIDAS', price: 1500, stock: 60, emoji: '💧', is_active: true },
  { id: 'p3', name: 'Cerveza Corona / Stella 330ml', category: 'BEBIDAS', price: 3500, stock: 36, emoji: '🍺', is_active: true },
  { id: 'p4', name: 'Tubo Pelotas Pádel x3 (Bullpadel)', category: 'EQUIPAMIENTO', price: 14000, stock: 15, emoji: '🎾', is_active: true },
  { id: 'p5', name: 'Alquiler de Paleta de Pádel', category: 'EQUIPAMIENTO', price: 3500, stock: 8, emoji: '🏓', is_active: true },
  { id: 'p6', name: 'Overgrip Wilson / Bullpadel', category: 'EQUIPAMIENTO', price: 2200, stock: 25, emoji: '🏸', is_active: true },
  { id: 'p7', name: 'Barra de Cereal / Proteica', category: 'SNACKS', price: 1200, stock: 30, emoji: '🍫', is_active: true },
  { id: 'p8', name: 'Papas Fritas / Maní Snack', category: 'SNACKS', price: 1800, stock: 20, emoji: '🥜', is_active: true },
]
