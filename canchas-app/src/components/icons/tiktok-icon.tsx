import React from 'react'

export interface TikTokIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

export function TikTokIcon({ className = 'w-4 h-4', ...props }: TikTokIconProps) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-2.891 2.891 2.896 2.896 0 0 1-2.892-2.891 2.896 2.896 0 0 1 2.892-2.892c.307 0 .602.046.88.132V9.418a6.34 6.34 0 0 0-.88-.063 6.342 6.342 0 0 0-6.337 6.34 6.342 6.342 0 0 0 6.337 6.34 6.342 6.342 0 0 0 6.337-6.34V8.756a8.21 8.21 0 0 0 4.769 1.516v-3.45a4.768 4.768 0 0 1-.99-.136z" />
    </svg>
  )
}
