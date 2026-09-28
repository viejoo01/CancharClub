import { cn } from '@/lib/utils'

interface PageSkeletonProps {
  variant?: 'dashboard' | 'table' | 'cards' | 'pos' | 'default'
  title?: string
  description?: string
  className?: string
}

export function PageSkeleton({
  variant = 'default',
  title,
  description,
  className,
}: PageSkeletonProps) {
  return (
    <div className={cn('w-full max-w-7xl mx-auto space-y-6 animate-pulse p-4 sm:p-6', className)}>
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="space-y-2">
          {title ? (
            <h1 className="text-xl sm:text-2xl font-black text-slate-200 tracking-tight">{title}</h1>
          ) : (
            <div className="h-7 w-48 bg-slate-800/80 rounded-xl" />
          )}
          {description ? (
            <p className="text-xs text-slate-400">{description}</p>
          ) : (
            <div className="h-4 w-72 bg-slate-800/50 rounded-lg" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-slate-800/70 rounded-xl" />
          <div className="h-9 w-28 bg-emerald-950/40 border border-emerald-500/20 rounded-xl" />
        </div>
      </div>

      {/* DASHBOARD VARIANT */}
      {variant === 'dashboard' && (
        <div className="space-y-6">
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-3.5 w-24 bg-slate-800 rounded" />
                  <div className="w-8 h-8 rounded-xl bg-slate-800" />
                </div>
                <div className="h-7 w-28 bg-slate-800/90 rounded-lg" />
                <div className="h-3 w-36 bg-slate-800/60 rounded" />
              </div>
            ))}
          </div>

          {/* Calendar Court Grid Placeholder */}
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex gap-2">
                <div className="h-8 w-20 bg-slate-800 rounded-lg" />
                <div className="h-8 w-24 bg-slate-800 rounded-lg" />
                <div className="h-8 w-20 bg-slate-800 rounded-lg" />
              </div>
              <div className="h-8 w-32 bg-slate-800 rounded-lg" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl bg-slate-800/40 border border-slate-800/60 p-3 space-y-2 flex flex-col justify-between"
                >
                  <div className="h-3 w-16 bg-slate-800 rounded" />
                  <div className="h-4 w-20 bg-slate-800/80 rounded" />
                  <div className="h-2.5 w-12 bg-slate-800/50 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* POS / CANTINA VARIANT */}
      {variant === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Product Catalog (7 or 8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-10 flex-1 bg-slate-900 border border-slate-800 rounded-xl" />
              <div className="h-10 w-28 bg-slate-900 border border-slate-800 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-3"
                >
                  <div className="w-full h-24 rounded-xl bg-slate-800/60" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-24 bg-slate-800 rounded" />
                    <div className="h-4 w-16 bg-emerald-950/60 rounded" />
                  </div>
                  <div className="h-8 w-full bg-slate-800/60 rounded-xl" />
                </div>
              ))}
            </div>
          </div>

          {/* Right: Cart / Order Ticket (4 cols) */}
          <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="h-5 w-28 bg-slate-800 rounded" />
              <div className="h-4 w-12 bg-slate-800 rounded" />
            </div>
            <div className="space-y-2 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-slate-800/50">
                  <div className="space-y-1">
                    <div className="h-3.5 w-24 bg-slate-800 rounded" />
                    <div className="h-3 w-16 bg-slate-800/50 rounded" />
                  </div>
                  <div className="h-4 w-12 bg-slate-800 rounded" />
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-14 bg-slate-800 rounded" />
                <div className="h-5 w-20 bg-emerald-900/60 rounded" />
              </div>
              <div className="h-11 w-full bg-emerald-600/30 rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* TABLE VARIANT (Fijos, Clientes, Reportes) */}
      {variant === 'table' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="h-9 w-64 bg-slate-900 border border-slate-800 rounded-xl" />
            <div className="flex gap-2">
              <div className="h-9 w-20 bg-slate-900 border border-slate-800 rounded-xl" />
              <div className="h-9 w-24 bg-slate-900 border border-slate-800 rounded-xl" />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/80 border border-slate-800/80 overflow-hidden">
            <div className="h-10 bg-slate-950/60 border-b border-slate-800/80 px-4 flex items-center justify-between">
              <div className="h-3.5 w-32 bg-slate-800 rounded" />
              <div className="h-3.5 w-20 bg-slate-800 rounded" />
              <div className="h-3.5 w-24 bg-slate-800 rounded" />
              <div className="h-3.5 w-16 bg-slate-800 rounded" />
            </div>
            <div className="divide-y divide-slate-800/60">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800/80" />
                    <div className="space-y-1">
                      <div className="h-3.5 w-28 bg-slate-800 rounded" />
                      <div className="h-2.5 w-20 bg-slate-800/50 rounded" />
                    </div>
                  </div>
                  <div className="h-4 w-20 bg-slate-800/70 rounded" />
                  <div className="h-5 w-16 bg-slate-800 rounded-full" />
                  <div className="h-8 w-16 bg-slate-800/80 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CARDS / METRICAS VARIANT */}
      {variant === 'cards' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-3">
                <div className="h-3.5 w-24 bg-slate-800 rounded" />
                <div className="h-8 w-32 bg-slate-800/90 rounded-lg" />
                <div className="h-3 w-40 bg-slate-800/50 rounded" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="h-4 w-36 bg-slate-800 rounded" />
              <div className="h-64 bg-slate-800/30 rounded-xl flex items-center justify-center">
                <div className="h-10 w-10 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="h-4 w-36 bg-slate-800 rounded" />
              <div className="h-64 bg-slate-800/30 rounded-xl flex items-center justify-center">
                <div className="h-10 w-10 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEFAULT VARIANT */}
      {variant === 'default' && (
        <div className="space-y-4">
          <div className="h-36 rounded-2xl bg-slate-900/80 border border-slate-800 p-6 flex flex-col justify-between">
            <div className="h-5 w-44 bg-slate-800 rounded" />
            <div className="h-4 w-72 bg-slate-800/60 rounded" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-2">
                <div className="h-4 w-20 bg-slate-800 rounded" />
                <div className="h-6 w-28 bg-slate-800/80 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
