'use client'

/**
 * Brand marks for Azura.
 *
 * The real identity is a figure-8 infinity fused with an "A" — supplied as a
 * logo system and shipped as transparent PNGs by
 * `scripts/build-logo-assets.js`. These components wrap it so the mark is
 * used consistently everywhere instead of an ad-hoc "A" or sparkle glyph.
 *
 * `AzuraMark` is the animated variant: the mark wipes in, breathes, and gets
 * a shine that sweeps across it. It is used on the app's empty state and
 * while the first response is generating, where it does the job a spinner
 * can't — it looks alive rather than stuck.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

/** True-light variant of the mark, for use on dark surfaces. */
const LIGHT_SRC = '/brand/logo-mark-white.png'
/** True-dark variant, for light surfaces. */
const DARK_SRC = '/brand/logo-mark.png'

export interface AzuraMarkProps {
  size?: number
  /** Renders the light mark (for dark backgrounds). */
  light?: boolean
  className?: string
  /** Accessible label; omit for decorative use. */
  title?: string
}

/**
 * The static Azura logo. Keeps a consistent aspect ratio and uses
 * `next/image`-free markup deliberately: these are tiny inline marks inside a
 * WebView, where the image optimizer adds latency for no benefit.
 */
export function AzuraMark({
  size = 32,
  light = true,
  className,
  title,
}: AzuraMarkProps) {
  return (
    // The source artwork is wider than it is tall (3:2), so the box reserves
    // that ratio and centres the mark rather than squashing it.
    <span
      className={cn('inline-flex items-center justify-center', className)}
      style={{ width: size * 1.5, height: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={light ? LIGHT_SRC : DARK_SRC}
        alt=""
        width={size * 1.5}
        height={size}
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </span>
  )
}

/**
 * The animated Azura logo.
 *
 * Three layers, all pure CSS so it costs no JS and keeps animating even when
 * the main thread is busy streaming tokens:
 *  - a wipe-in reveal using a clipped container
 *  - a continuous shine band travelling across the mark
 *  - a slow breathing scale, so the screen never looks frozen
 *
 * Honours `prefers-reduced-motion`: the animation collapses to a static mark
 * rather than removing it, which would leave an empty gap in the layout.
 */
export function AzuraLogoAnimated({
  size = 96,
  light = true,
  className,
}: AzuraMarkProps) {
  const src = light ? LIGHT_SRC : DARK_SRC
  const w = size * 1.5

  return (
    <span
      className={cn('azura-logo relative inline-flex items-center justify-center', className)}
      style={{ width: w, height: size }}
      aria-hidden
    >
      <span className="azura-logo__mark relative block h-full w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={w}
          height={size}
          draggable={false}
          className="azura-logo__img h-full w-full select-none object-contain"
        />
        {/* Shine sweep — sits above the mark and is masked to its silhouette
            by the same clip, so it never washes out the background. */}
        <span className="azura-logo__shine" />
      </span>
    </span>
  )
}

/**
 * AzuraWordmark — the text wordmark used in the dashboard sidebar.
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
 * AzuraLogo — a compact plate for dense chrome (sidebar, headers).
 *
 * Falls back to the previous "A" plate on light surfaces so contrast holds
 * even where the raster mark would disappear.
 */
export function AzuraLogo({
  size = 32,
  className,
  rounded = 'rounded-xl',
  light = true,
}: {
  size?: number
  className?: string
  rounded?: string
  light?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex select-none items-center justify-center',
        light ? 'bg-brand text-primary-foreground' : 'bg-foreground text-background',
        'shadow-sm ring-1 ring-border',
        rounded,
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <AzuraMark size={size * 0.62} light={light} />
    </span>
  )
}