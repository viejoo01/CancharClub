import React from 'react'

interface CancharClubIconProps {
  className?: string
  withBadge?: boolean
}

/**
 * Ícono oficial de Canchar Club:
 * Representa la "C" de Canchar y Club fusionada con la geometría de una cancha deportiva
 * (líneas de juego de pádel/fútbol/tenis, red central y pelota deportiva en movimiento).
 */
export function CancharClubIcon({ className = 'w-10 h-10', withBadge = false }: CancharClubIconProps) {
  const svgContent = (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Gradiente de fondo del badge */}
        <linearGradient id="cancharBgGrad" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        {/* Borde deportivo sutil */}
        <linearGradient id="cancharBorderGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#059669" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
        </linearGradient>

        {/* Gradiente de la C atlética */}
        <linearGradient id="cancharCGrad" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>

        {/* Gradiente césped / pista deportiva */}
        <linearGradient id="cancharTurfGrad" x1="20" y1="20" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#065f46" />
          <stop offset="100%" stopColor="#022c22" />
        </linearGradient>

        {/* Pelota atlética neón */}
        <radialGradient id="cancharBallGrad" cx="44" cy="18" r="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#bef264" />
          <stop offset="50%" stopColor="#84cc16" />
          <stop offset="100%" stopColor="#65a30d" />
        </radialGradient>

        {/* Resplandor suave */}
        <filter id="cancharGlow" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#10b981" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Contenedor Badge redondeado */}
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="17"
        fill="url(#cancharBgGrad)"
        stroke="url(#cancharBorderGrad)"
        strokeWidth="1.5"
      />

      {/* Halo de luz deportivo */}
      <circle cx="32" cy="32" r="16" fill="#10b981" fillOpacity="0.08" />

      {/* Trazo Curvo "C" Dinámico (Crest / Canchar) */}
      <path
        d="M45 18C41.5 14 36.2 12.5 30.5 12.5C19.5 12.5 12 20.8 12 32C12 43.2 19.5 51.5 30.5 51.5C37 51.5 42.2 49 46 44.5"
        stroke="url(#cancharCGrad)"
        strokeWidth="4.5"
        strokeLinecap="round"
        filter="url(#cancharGlow)"
      />

      {/* Pista de juego / Cancha interior */}
      <rect
        x="22"
        y="21"
        width="22"
        height="22"
        rx="4"
        fill="url(#cancharTurfGrad)"
        stroke="#34d399"
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />

      {/* Línea de Red / División central de la cancha */}
      <line
        x1="33"
        y1="21"
        x2="33"
        y2="43"
        stroke="#f8fafc"
        strokeWidth="1.4"
        strokeDasharray="2 1.5"
        strokeOpacity="0.9"
      />

      {/* Línea horizontal central (área de saque / mitad de campo) */}
      <line
        x1="22"
        y1="32"
        x2="44"
        y2="32"
        stroke="#a7f3d0"
        strokeWidth="1.2"
        strokeOpacity="0.75"
      />

      {/* Punto de servicio / centro */}
      <circle cx="33" cy="32" r="1.5" fill="#f8fafc" />

      {/* Pelota Neón en movimiento con estela sutil */}
      <path
        d="M37 15C40 16 42 17 44 18"
        stroke="#bef264"
        strokeWidth="1"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />
      <circle cx="44" cy="18" r="4" fill="url(#cancharBallGrad)" stroke="#14532d" strokeWidth="0.8" />
      {/* Costura de la pelota de tenis/pádel */}
      <path
        d="M42.5 16C43.5 17.2 44.5 17.5 45.8 17.2"
        stroke="#ffffff"
        strokeWidth="0.75"
        strokeLinecap="round"
      />
    </svg>
  )

  if (!withBadge) {
    return svgContent
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      {svgContent}
    </div>
  )
}

interface CancharClubLogoProps {
  className?: string
  iconSize?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  subtitle?: string
}

export function CancharClubLogo({
  className = '',
  iconSize = 'md',
  showText = true,
  subtitle,
}: CancharClubLogoProps) {
  const sizeMap = {
    sm: { icon: 'w-7 h-7', title: 'text-base', sub: 'text-[10px]' },
    md: { icon: 'w-10 h-10', title: 'text-xl', sub: 'text-xs' },
    lg: { icon: 'w-14 h-14', title: 'text-2xl sm:text-3xl', sub: 'text-sm' },
    xl: { icon: 'w-20 h-20', title: 'text-4xl sm:text-5xl', sub: 'text-base' },
  }[iconSize]

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <CancharClubIcon className={`${sizeMap.icon} shrink-0 drop-shadow-md`} />
      {showText && (
        <div className="flex flex-col text-left">
          <div className="flex items-baseline gap-1 leading-none">
            <span className={`font-black tracking-tight text-slate-900 dark:text-white ${sizeMap.title}`}>
              Canchar<span className="text-emerald-500 font-black">Club</span>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          {subtitle && (
            <span className={`text-slate-400 font-medium mt-0.5 tracking-normal ${sizeMap.sub}`}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
