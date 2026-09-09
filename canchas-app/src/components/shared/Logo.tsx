import React from 'react'
import Link from 'next/link'
import { siteConfig } from '@/config/site'
import { CancharClubIcon } from './canchar-club-logo'

interface LogoProps {
  className?: string
  iconSize?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  href?: string
}

export function Logo({
  className = '',
  iconSize = 'md',
  showTagline = false,
  href = '/',
}: LogoProps) {
  const sizeClasses = {
    sm: {
      icon: 'w-7 h-7',
      text: 'text-base',
      tagline: 'text-[9px]',
    },
    md: {
      icon: 'w-9 h-9',
      text: 'text-xl',
      tagline: 'text-[10px]',
    },
    lg: {
      icon: 'w-12 h-12',
      text: 'text-2xl sm:text-3xl',
      tagline: 'text-xs',
    },
  }[iconSize]

  const content = (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Icono Isotipo Canchar */}
      <CancharClubIcon className={`${sizeClasses.icon} shrink-0 drop-shadow-md transition-transform hover:scale-105`} />

      {/* Logotipo Tipográfico */}
      <div className="flex flex-col">
        <div className="flex items-baseline">
          <span className={`font-black tracking-tight text-white ${sizeClasses.text}`}>
            Canchar<span className="text-emerald-400 font-black">Club</span>
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5 animate-pulse" />
        </div>
        {showTagline && (
          <span className={`text-slate-400 font-medium tracking-tight -mt-0.5 ${sizeClasses.tagline}`}>
            {siteConfig.tagline}
          </span>
        )}
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="inline-block transition-opacity hover:opacity-90">
        {content}
      </Link>
    )
  }

  return content
}
