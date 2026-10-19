'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  RotateCcw,
  Check,
  Loader2,
  Info
} from 'lucide-react'
import { toast } from 'sonner'
import { updateClubSidebarPreferences, type SidebarNavPreferences } from '@/actions/club.actions'

export interface CustomizableNavItem {
  href: string
  title: string
  icon: React.ElementType
}

interface CustomizeMenuModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId?: string | null
  availableItems: CustomizableNavItem[]
  currentPreferences: SidebarNavPreferences
  onSavePreferences: (prefs: SidebarNavPreferences) => void
}

function computeInitialItems(
  availableItems: CustomizableNavItem[],
  currentPreferences: SidebarNavPreferences
): CustomizableNavItem[] {
  const itemMap = new Map(availableItems.map((item) => [item.href, item]))
  const newOrdered: CustomizableNavItem[] = []

  // 1. Agregar según el orden configurado previamente
  for (const href of currentPreferences.order || []) {
    const found = itemMap.get(href)
    if (found) {
      newOrdered.push(found)
      itemMap.delete(href)
    }
  }

  // 2. Agregar cualquier ítem disponible restante que no estuviese en la lista
  for (const remaining of itemMap.values()) {
    newOrdered.push(remaining)
  }

  return newOrdered
}

function CustomizeMenuModalBody({
  onClose,
  tenantId,
  availableItems,
  currentPreferences,
  onSavePreferences,
}: Omit<CustomizeMenuModalProps, 'isOpen'>) {
  const [orderedItems, setOrderedItems] = useState<CustomizableNavItem[]>(() =>
    computeInitialItems(availableItems, currentPreferences)
  )
  const [hiddenHrefs, setHiddenHrefs] = useState<string[]>(
    () => currentPreferences.hidden || []
  )
  const [saving, setSaving] = useState(false)

  const moveUp = (index: number) => {
    if (index <= 0) return
    setOrderedItems((prev) => {
      const copy = [...prev]
      const temp = copy[index - 1]
      copy[index - 1] = copy[index]
      copy[index] = temp
      return copy
    })
  }

  const moveDown = (index: number) => {
    if (index >= orderedItems.length - 1) return
    setOrderedItems((prev) => {
      const copy = [...prev]
      const temp = copy[index + 1]
      copy[index + 1] = copy[index]
      copy[index] = temp
      return copy
    })
  }

  const toggleVisibility = (href: string) => {
    setHiddenHrefs((prev) => {
      if (prev.includes(href)) {
        return prev.filter((h) => h !== href)
      } else {
        // Asegurarse de no ocultar todo
        if (prev.length >= orderedItems.length - 1) {
          toast.warning('Debe quedar al menos un acceso visible en la barra lateral.')
          return prev
        }
        return [...prev, href]
      }
    })
  }

  const handleReset = () => {
    setOrderedItems(availableItems)
    setHiddenHrefs([])
    toast.info('Se restableció el orden y la visibilidad por defecto.')
  }

  const handleSave = async () => {
    setSaving(true)
    const newPrefs: SidebarNavPreferences = {
      order: orderedItems.map((item) => item.href),
      hidden: hiddenHrefs,
    }

    try {
      // 1. Aplicar en estado local y almacenamiento inmediatamente (0ms)
      onSavePreferences(newPrefs)

      // 2. Persistir en Supabase si hay tenantId
      if (tenantId) {
        const res = await updateClubSidebarPreferences(tenantId, newPrefs)
        if (!res.success) {
          console.warn('[CustomizeMenuModal] Guardado en servidor notice:', res.error)
        }
      }

      toast.success('Menú lateral personalizado guardado correctamente.')
      onClose()
    } catch (err) {
      console.error('[CustomizeMenuModal] Error saving:', err)
      toast.error('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  const visibleCount = orderedItems.length - hiddenHrefs.length

  return (
    <>
      <DialogHeader className="p-5 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2 text-emerald-400">
          <SlidersHorizontal className="w-5 h-5" />
          <DialogTitle className="text-lg font-bold text-white">
            Personalizar Barra Lateral
          </DialogTitle>
        </div>
        <DialogDescription className="text-xs text-slate-400 mt-1 leading-relaxed">
          Reorganizá los accesos con las flechas o desactivá los botones que no utilices en tu club
          (ej. Torneos o Control de Luces) para mantener tu panel despejado.
        </DialogDescription>
      </DialogHeader>

      <div className="px-5 py-2.5 bg-slate-900/50 border-b border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            Visibles: <strong className="text-white">{visibleCount}</strong> de {orderedItems.length}
          </span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer text-[11px]"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Restablecer por defecto</span>
        </button>
      </div>

      {/* Lista de Accesos Reordenables */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 custom-scrollbar">
        {orderedItems.map((item, index) => {
          const isHidden = hiddenHrefs.includes(item.href)
          const Icon = item.icon
          const isFirst = index === 0
          const isLast = index === orderedItems.length - 1

          return (
            <div
              key={item.href}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                isHidden
                  ? 'bg-slate-950/40 border-slate-800/50 opacity-60'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700/80'
              }`}
            >
              {/* Icono y Nombre */}
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isHidden ? 'bg-slate-900 text-slate-600' : 'bg-slate-800/80 text-emerald-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-xs font-semibold truncate ${
                      isHidden ? 'text-slate-500 line-through' : 'text-slate-200'
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {isHidden ? (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-700 text-slate-500">
                        Oculto
                      </Badge>
                    ) : (
                      <span className="text-emerald-400/80 text-[10px]">Visible en panel</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Controles: Reordenar y Ocultar/Mostrar */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isFirst || saving}
                  onClick={() => moveUp(index)}
                  className="w-7 h-7 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                  title="Mover hacia arriba"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isLast || saving}
                  onClick={() => moveDown(index)}
                  className="w-7 h-7 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                  title="Mover hacia abajo"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={saving}
                  onClick={() => toggleVisibility(item.href)}
                  className={`w-7 h-7 ml-1 cursor-pointer transition-colors ${
                    isHidden
                      ? 'text-slate-600 hover:text-emerald-400 hover:bg-emerald-950/20'
                      : 'text-emerald-400 hover:text-rose-400 hover:bg-rose-950/20'
                  }`}
                  title={isHidden ? 'Mostrar en barra lateral' : 'Ocultar de la barra lateral'}
                >
                  {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <DialogFooter className="p-4 border-t border-slate-800/80 bg-slate-950/80 flex sm:justify-between items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={saving}
          className="text-xs text-slate-400 hover:text-white h-9"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-lg shadow-emerald-950/30"
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Guardando...</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Guardar Menú</span>
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  )
}

export function CustomizeMenuModal(props: CustomizeMenuModalProps) {
  const { isOpen, onClose } = props

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 gap-0 bg-slate-950 border border-slate-800 text-slate-100 shadow-2xl">
        {isOpen && <CustomizeMenuModalBody key={isOpen ? 'open' : 'closed'} {...props} />}
      </DialogContent>
    </Dialog>
  )
}
