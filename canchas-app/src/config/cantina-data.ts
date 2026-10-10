// src/config/cantina-data.ts
// Catálogo base y tipos de productos para Cantina & Kiosco

export interface CantinaProduct {
  id: string
  name: string
  category: 'BEBIDAS' | 'EQUIPAMIENTO' | 'SNACKS'
  price: number
  stock: number
  emoji?: string
  is_active?: boolean
}

export const INITIAL_CANTINA_PRODUCTS: CantinaProduct[] = []

export interface CantinaSupplier {
  id: string
  name: string
  category: 'ALL' | 'BEBIDAS' | 'EQUIPAMIENTO' | 'SNACKS'
  phone: string
  notes?: string
}

export const DEFAULT_CANTINA_SUPPLIERS: CantinaSupplier[] = [
  { id: 'sup_bebidas', name: 'Distribuidor Bebidas', category: 'BEBIDAS', phone: '' },
  { id: 'sup_equipamiento', name: 'Proveedor Equipamiento', category: 'EQUIPAMIENTO', phone: '' },
  { id: 'sup_snacks', name: 'Distribuidor Snacks & Kiosco', category: 'SNACKS', phone: '' },
]

