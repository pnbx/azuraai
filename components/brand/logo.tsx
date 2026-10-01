'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * AzuraWordmark — the original text wordmark ("AzuraAI"), used in the
 * dashboard sidebar exactly like the pre-app site rendered it.
 */
export function AzuraWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'select-none text-sm font-semibold tracking-tight text-sidebar-foreground',
        className
      )}
    >
      AzuraAI
    </span>
  )
}

/**
 * AzuraLogo — original-design wordmark tile.
 *
 * The original Azura design (the pre-app site) used no image mark: a
 * text wordmark in the sidebar, and a bold "A" when collapsed. This
 * component reproduces that language: a monochrome plate using the
 * theme-inverting brand color with a bold "A", at any size.
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
  return (
    <span
      className={cn(
        'inline-flex select-none items-center justify-center bg-brand font-bold text-primary-foreground shadow-sm ring-1 ring-border',
        rounded,
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.5, lineHeight: 1 }}
      aria-hidden
    >
      A
    </span>
  )
}
