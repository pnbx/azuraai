'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * AzuraLogo — the real mark from "AZURA AI logo system.png".
 *
 * The master logo is a horizontal lockup on a dark plate, so we render it
 * inside a rounded tile. If the image is missing, a CSS brand orb with the
 * four-point spark takes its place.
 */

export function AzuraLogo({
  size = 32,
  className,
  rounded = 'rounded-xl',
}: {
  size?: number
  className?: string
  rounded?: string
}) {
  const [failed, setFailed] = React.useState(false)

  if (failed) {
    return (
      <span
        className={cn('brand-orb inline-flex items-center justify-center text-white', rounded, className)}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg
          width={size * 0.55}
          height={size * 0.55}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l1.9 5.8L20 12l-6.1 3.2L12 21l-1.9-5.8L4 12l6.1-3.2L12 3z" />
        </svg>
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/azura-logo-system.png"
      alt="Azura"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn('object-cover shadow-sm ring-1 ring-border', rounded, className)}
      style={{ width: size, height: size }}
    />
  )
}

export function AzuraWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <AzuraLogo size={30} />
      <span className="text-[15px] font-semibold tracking-tight">AzuraAI</span>
    </span>
  )
}
