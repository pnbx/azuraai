'use client'

/**
 * ConversationsDrawer — ChatGPT/Grok-style history rail.
 *
 * Desktop: collapsible sidebar column. Mobile: slide-over opened by the
 * hamburger, closable by scrim tap or swipe-left on the handle.
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  MessageSquarePlus,
  Search,
  Pin,
  PinOff,
  Trash2,
  X,
  PanelLeft,
  Settings,
} from 'lucide-react'
import type { Conversation } from './conversations'
import { groupByRecency } from './conversations'
import { useI18n, type I18nKey } from './i18n-provider'

const spring = { type: 'spring' as const, stiffness: 380, damping: 32 }

/** Maps groupByRecency's stable ids onto i18n keys. */
const GROUP_LABEL_KEYS: Record<string, I18nKey> = {
  pinned: 'drawer.pinned',
  today: 'drawer.groupToday',
  yesterday: 'drawer.groupYesterday',
  week: 'drawer.groupWeek',
  month: 'drawer.groupMonth',
  older: 'drawer.groupOlder',
}

/** Relative timestamp for rows — Today/Yesterday handled by group labels. */
function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onTogglePin: (id: string) => void
  onRename: (id: string, title: string) => void
  collapsed?: boolean
  onCollapsedChange?: (c: boolean) => void
}

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex-1 text-muted-foreground">{t('drawer.deleteChat')}</span>
      <button
        onClick={onConfirm}
        className="rounded-md bg-destructive px-2 py-1 font-medium text-destructive-foreground"
      >
        {t('drawer.delete')}
      </button>
      <button onClick={onCancel} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted">
        {t('drawer.cancel')}
      </button>
    </div>
  )
}

function ConversationRow({
  conv,
  active,
  onSelect,
  onDelete,
  onTogglePin,
  onRename,
}: {
  conv: Conversation
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onTogglePin: () => void
  onRename: (title: string) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [renaming, setRenaming] = React.useState(false)
  const [draft, setDraft] = React.useState(conv.title)

  return (
    <div
      className={`group/row relative rounded-xl transition-colors ${
        active ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/60'
      }`}
    >
      {renaming ? (
        <form
          className="px-2 py-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            onRename(draft.trim() || conv.title)
            setRenaming(false)
          }}
        >
          <input
            autoFocus
            defaultValue={conv.title}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onBlur={(e) => {
              onRename((e.target as HTMLInputElement).value.trim() || conv.title)
              setRenaming(false)
            }}
            className="w-full rounded-lg border border-border-strong bg-background px-2 py-1.5 text-sm outline-none"
          />
        </form>
      ) : confirmDelete ? (
        <div className="px-3 py-2.5">
          <DeleteConfirm
            onConfirm={() => {
              onDelete()
              setConfirmDelete(false)
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </div>
      ) : (
        <button
          onClick={onSelect}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        >
          {conv.pinned ? <Pin className="h-3 w-3 shrink-0 text-brand-strong" /> : null}
          <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
            {conv.title}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {relTime(conv.updatedAt)}
          </span>
        </button>
      )}

      {!renaming && !confirmDelete ? (
        <div
          className={`absolute right-1 top-1/2 -translate-y-1/2 items-center gap-0.5 ${
            menuOpen ? 'flex' : 'hidden group-hover/row:flex'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(false)
              onTogglePin()
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar text-muted-foreground shadow-sm hover:text-foreground"
            aria-label={conv.pinned ? 'Unpin conversation' : 'Pin conversation'}
          >
            {conv.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setDraft(conv.title)
              setRenaming(true)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar text-muted-foreground shadow-sm hover:text-foreground"
            aria-label="Rename conversation"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(true)
              setConfirmDelete(true)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar text-muted-foreground shadow-sm hover:text-destructive"
            aria-label="Delete conversation"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function ConversationsDrawer(props: DrawerProps) {
  const {
    open,
    onOpenChange,
    conversations,
    activeId,
    onSelect,
    onNew,
    onDelete,
    onTogglePin,
    onRename,
    collapsed = false,
    onCollapsedChange,
  } = props

  const { t, dir } = useI18n()
  const [query, setQuery] = React.useState('')
  const searchRef = React.useRef<HTMLInputElement>(null)
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    )
  }, [conversations, query])

  const groups = groupByRecency(filtered)

  const content = (
    <div className="flex h-full flex-col bg-sidebar" dir={dir}>
      {/* New chat */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3 pt-safe">
        <button
          onClick={onNew}
          className="flex flex-1 items-center gap-2 rounded-xl border border-sidebar-border bg-card px-3 py-2.5 text-sm font-medium shadow-sm transition-colors hover:border-border-strong"
        >
          <MessageSquarePlus className="h-4 w-4 text-brand-strong" />
          {t('chat.newChat')}
        </button>
        {/* Mobile close */}
        <button
          onClick={() => onOpenChange(false)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-sidebar-accent lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-xl border border-sidebar-border bg-card/60 px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            // Uncontrolled: keeps Persian/Arabic IME composition intact.
            defaultValue=""
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder={t('drawer.searchPlaceholder')}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery('')
                if (searchRef.current) searchRef.current.value = ''
              }}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ) : null}
        </div>
      </div>

      {/* History */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {query ? 'No chats match your search.' : 'Your conversations will appear here.'}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(GROUP_LABEL_KEYS[g.label] ?? 'drawer.groupOlder')}
              </p>
              <div className="space-y-0.5">
                {g.items.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conv={c}
                    active={c.id === activeId}
                    onSelect={() => onSelect(c.id)}
                    onDelete={() => onDelete(c.id)}
                    onTogglePin={() => onTogglePin(c.id)}
                    onRename={(title) => onRename(c.id, title)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-3 py-2.5 pb-safe">
        <a
          href="/app/settings"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Settings
        </a>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop: docked column */}
      <aside
        className={`relative hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 lg:block ${
          collapsed ? 'w-0 overflow-hidden' : 'w-72'
        }`}
      >
        {content}
      </aside>
      {!collapsed ? (
        <button
          onClick={() => onCollapsedChange?.(true)}
          className="absolute left-[17.5rem] top-[4.2rem] z-30 hidden h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground lg:flex"
          aria-label="Collapse sidebar"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {/* Mobile: slide-over */}
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => onOpenChange(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={spring}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.6, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -80) onOpenChange(false)
              }}
              className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-80 border-r border-sidebar-border sidebar-transition lg:hidden"
            >
              {content}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
