import React from 'react'

export interface SocialIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

export function InstagramIcon({ className = 'w-4 h-4', ...props }: SocialIconProps) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

export function FacebookIcon({ className = 'w-4 h-4', ...props }: SocialIconProps) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M9.19795 21.5H13.198V13.4901H16.8021L17.198 9.50985H13.198V7.5C13.198 6.94772 13.6457 6.5 14.198 6.5H17.198V2.5H14.198C11.4365 2.5 9.19795 4.73858 9.19795 7.5V9.50985H7.19795L6.80206 13.4901H9.19795V21.5Z" />
    </svg>
  )
}

export function TikTokIcon({ className = 'w-4 h-4', ...props }: SocialIconProps) {
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
