'use client'

/**
 * Image attachments for the chat composer.
 *
 * Azura can now *see*. The user picks photos from the gallery or snaps one
 * with the camera; we downscale them in-browser before they ever hit the
 * network or localStorage, then send them to the model as multimodal parts.
 *
 * Downscaling matters: a modern phone photo is 3-8 MB, which would blow the
 * request budget and permanently eat the localStorage quota. We cap the long
 * edge and re-encode as JPEG so each attachment lands around 60-90 KB — small
 * enough to keep recent ones in conversation history.
 *
 * GIFs are passed through untouched (re-encoding would drop animation), and
 * PNGs are only kept as PNG when they carry transparency.
 */

import * as React from 'react'
import { ImagePlus, Camera, X, Loader2 } from 'lucide-react'
import { useI18n } from './i18n-provider'
import { MAX_IMAGES_PER_MESSAGE } from './conversations'

/** Longest edge after downscale — enough for reading text in a screenshot. */
const MAX_EDGE = 1280
/** JPEG quality. 0.72 keeps small text legible at a fraction of the bytes. */
const JPEG_QUALITY = 0.72
/** Don't re-encode images already tiny enough to send as-is. */
const PASSTHROUGH_BYTES = 180_000

export interface Attachment {
  /** `data:image/...;base64,...` — ready for fetch and localStorage. */
  dataUrl: string
  /** Object URL for cheap <img> rendering without re-parsing the data URL. */
  previewUrl: string
  name: string
  /** Decoded byte size, shown in the strip tooltip. */
  bytes: number
}

export const MAX_ATTACHMENTS = MAX_IMAGES_PER_MESSAGE

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Downscales an image file and returns an Attachment, or throws.
 * Runs entirely on-device — no upload until the message is sent.
 */
export async function buildAttachment(file: File): Promise<Attachment> {
  const dataUrl = await downscale(file)
  const bytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
  return {
    dataUrl,
    // Reuse the data URL as the preview src — avoids leaking a second blob
    // handle per image and works identically in the WebView.
    previewUrl: dataUrl,
    name: file.name || 'image',
    bytes,
  }
}

/**
 * Produces a compact `data:` URL for an image file.
 * Falls back to the original bytes when canvas is unavailable (very old
 * WebViews / SSR) rather than failing the attachment outright.
 */
async function downscale(file: File): Promise<string> {
  const gif = file.type === 'image/gif'
  const isPng = file.type === 'image/png'

  if (typeof document === 'undefined') throw new Error('no_dom')

  const bitmap = await loadBitmap(file)

  // GIFs: keep as-is to preserve animation (canvas would flatten it).
  if (gif || !bitmap) return await readAsDataUrl(file)

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  // Small enough already and not huge in pixels? Send the original bytes.
  if (scale === 1 && file.size <= PASSTHROUGH_BYTES) {
    return await readAsDataUrl(file)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return await readAsDataUrl(file)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h)
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

  // PNG transparency must survive → keep PNG, otherwise JPEG is far smaller.
  const mime = isPng ? 'image/png' : 'image/jpeg'
  const url = canvas.toDataURL(mime, JPEG_QUALITY)

  // If re-encoding somehow grew the payload, keep the original.
  if (url.length > PASSTHROUGH_BYTES * 1.4 && file.size <= PASSTHROUGH_BYTES) {
    return await readAsDataUrl(file)
  }
  return url
}

/**
 * Decodes via createImageBitmap when available (fast, off-thread), otherwise
 * falls back to an <img> element for WebViews without it.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // HEIC or an unsupported codec — caller falls back to raw bytes.
      return null
    }
  }

  try {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('decode_failed'))
        el.src = url
      })
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}

// ─── Composer strip ──────────────────────────────────────────────────────────

export interface AttachmentBarProps {
  attachments: Attachment[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  busy: boolean
  error: string | null
}

/**
 * The row of thumbnails above the composer, plus the two picker buttons.
 * Rendered only when attachments exist or the composer is idle — keeps the
 * default chat screen exactly as clean as before.
 */
export function AttachmentBar({
  attachments,
  onAdd,
  onRemove,
  busy,
  error,
}: AttachmentBarProps) {
  const galleryRef = React.useRef<HTMLInputElement>(null)
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const { tf } = useI18n()

  const full = attachments.length >= MAX_ATTACHMENTS

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) onAdd(files)
    // Reset so re-picking the same file still fires a change event.
    e.target.value = ''
  }

  return (
    <div className="pb-2">
      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2 pb-2">
          {attachments.map((a, i) => (
            <div
              key={a.dataUrl.slice(-24) + i}
              className="group/att relative h-16 w-16 overflow-hidden rounded-xl border border-border bg-muted"
            >
              <img
                src={a.previewUrl}
                alt={a.name}
                className="h-full w-full object-cover"
              />
              <button
                onClick={() => onRemove(i)}
                disabled={busy}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
                aria-label={`Remove ${a.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[9px] tabular-nums text-white">
                {formatBytes(a.bytes)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <input
          ref={galleryRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFiles}
          className="hidden"
        />
        <button
          onClick={() => galleryRef.current?.click()}
          disabled={busy || full}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          aria-label={tf('composer.attach')}
          title={full ? tf('composer.attachmentsFull', { n: MAX_ATTACHMENTS }) : tf('composer.attach')}
        >
          {busy && attachments.length > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={busy || full}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          aria-label={tf('composer.camera')}
          title={full ? tf('composer.attachmentsFull', { n: MAX_ATTACHMENTS }) : tf('composer.camera')}
        >
          <Camera className="h-4 w-4" />
        </button>
        {attachments.length > 0 ? (
          <span className="ml-1 text-[10px] text-muted-foreground">
            {tf('composer.attachmentsCount', { n: attachments.length, max: MAX_ATTACHMENTS })}
          </span>
        ) : null}
        {error ? (
          <span className="ml-auto text-[10px] text-destructive">{error}</span>
        ) : null}
      </div>
    </div>
  )
}

// ─── Message thumbnails ──────────────────────────────────────────────────────

/** Inline image row shown inside a sent user message bubble. */
export function MessageImages({ images }: { images: string[] }) {
  if (!images || images.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap justify-end gap-1.5">
      {images.map((src, i) => (
        <img
          key={src.slice(-24) + i}
          src={src}
          alt=""
          className="h-16 w-16 rounded-lg border border-white/20 object-cover"
        />
      ))}
    </div>
  )
}