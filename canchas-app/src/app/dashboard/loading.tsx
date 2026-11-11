export default function DashboardLoading() {
  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-pulse select-none" aria-busy="true">
      {/* Header Shimmer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200/90 dark:bg-slate-800 rounded-xl" />
          <div className="h-4 w-72 bg-slate-200/60 dark:bg-slate-800/50 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-slate-200/70 dark:bg-slate-800/70 rounded-xl" />
          <div className="h-9 w-28 bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/20 rounded-xl" />
        </div>
      </div>

      {/* KPI Cards Shimmer */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 space-y-3 shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="w-8 h-8 rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
            </div>
            <div className="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
            <div className="h-3 w-36 bg-slate-200/60 dark:bg-slate-800/60 rounded" />
          </div>
        ))}
      </div>

      {/* Main Content Shimmer */}
      <div className="h-80 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 p-6 flex flex-col items-center justify-center space-y-3 shadow-2xs">
        <div className="w-6 h-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Cargando datos en tiempo real...
        </span>
      </div>
    </div>
  )
}

