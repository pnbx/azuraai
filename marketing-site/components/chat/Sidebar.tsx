"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";

export type ConversationItem = {
  id: string;
  title: string;
  model: string;
  pinned: boolean;
  archived: boolean;
  folder_id: string | null;
  updated_at: string;
};

export type FolderItem = { id: string; name: string };

export default function Sidebar({
  conversations,
  folders,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  onPin,
  onArchive,
  onMoveToFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  temporary,
  onToggleTemporary,
  user,
  onSignOut,
  accountHref = "/account",
}: {
  conversations: ConversationItem[];
  folders: FolderItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMoveToFolder: (id: string, folderId: string | null) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  temporary: boolean;
  onToggleTemporary: () => void;
  user: { email?: string } | null;
  onSignOut: () => void;
  accountHref?: string;
}) {
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (c.archived !== showArchived) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q);
    });
  }, [conversations, query, showArchived]);

  const pinned = filtered.filter((c) => c.pinned);
  const rest = filtered.filter((c) => !c.pinned);

  function ConversationRow({ c }: { c: ConversationItem }) {
    const active = c.id === activeId;
    return (
      <div key={c.id} className="relative">
        {renaming?.id === c.id ? (
          <input
            value={renaming.value}
            onChange={(e) => setRenaming({ id: c.id, value: e.target.value })}
            onBlur={() => {
              if (renaming.value.trim()) onRename(c.id, renaming.value.trim());
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(null);
            }}
            autoFocus
            className="w-full rounded-2xl border border-white/25 bg-ink-800 px-3 py-2 text-xs text-white focus:outline-none"
          />
        ) : (
          <button
            onClick={() => onSelect(c.id)}
            className={`group flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-start transition-all duration-300 ${
              active ? "bg-white/[0.09] text-white" : "text-mist-300 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            <Icon name="chat" size={13} className="shrink-0 opacity-60" />
            <span className="flex-1 truncate text-xs">{c.title}</span>
            {c.pinned && <Icon name="lock" size={11} className="shrink-0 text-mist-400" />}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setMenuFor(menuFor === c.id ? null : c.id);
              }}
              onKeyDown={(e) => e.key === "Enter" && setMenuFor(menuFor === c.id ? null : c.id)}
              className={`shrink-0 rounded-lg p-1 transition ${menuFor === c.id ? "text-white" : "text-mist-400 opacity-0 group-hover:opacity-100"}`}
            >
              <Icon name="plus" size={12} className="rotate-45" />
            </span>
          </button>
        )}

        {menuFor === c.id && (
          <div className="absolute end-2 top-9 z-30 w-44 rounded-2xl border border-white/10 bg-ink-850 p-1 shadow-card">
            <MenuItem icon="plus" label="تغییر نام" onClick={() => { setRenaming({ id: c.id, value: c.title }); setMenuFor(null); }} />
            <MenuItem icon="lock" label={c.pinned === true ? "برداشتن سنجاق" : "سنجاق کردن"} onClick={() => { onPin(c.id, !c.pinned); setMenuFor(null); }} />
            <MenuItem
              icon="chat"
              label={c.archived ? "خروج از بایگانی" : "بایگانی"}
              onClick={() => { onArchive(c.id, !c.archived); setMenuFor(null); }}
            />
            {folders.length > 0 && (
              <>
                <div className="my-1 border-t border-white/5" />
                <div className="px-3 pb-1 pt-1.5 text-[9px] text-mist-400">انتقال به پوشه</div>
                <MenuItem icon="chat" label="بدون پوشه" onClick={() => { onMoveToFolder(c.id, null); setMenuFor(null); }} />
                {folders.map((f) => (
                  <MenuItem key={f.id} icon="chat" label={f.name} onClick={() => { onMoveToFolder(c.id, f.id); setMenuFor(null); }} />
                ))}
              </>
            )}
            <div className="my-1 border-t border-white/5" />
            <MenuItem icon="close" label="حذف گفتگو" danger onClick={() => { onDelete(c.id); setMenuFor(null); }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-e border-white/5 bg-black/60">
      <div className="space-y-3 p-3">
        <button onClick={onNewChat} className="btn-primary w-full !rounded-2xl !py-2.5 !text-xs">
          <Icon name="plus" size={14} />
          گفتگوی جدید
        </button>

        {/* temporary chat toggle */}
        <button
          onClick={onToggleTemporary}
          className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-xs transition-all duration-300 ${
            temporary
              ? "border-white/30 bg-white/[0.1] text-white"
              : "border-white/10 bg-white/[0.03] text-mist-300 hover:text-white"
          }`}
        >
          <Icon name="shield" size={13} />
          <span className="flex-1 text-start">چت موقت</span>
          <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${temporary ? "bg-white" : "bg-white/15"}`}>
            <span className={`block h-3 w-3 rounded-full bg-black transition-transform duration-300 ${temporary ? "-translate-x-3" : ""}`} />
          </span>
        </button>

        {/* search */}
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی گفتگوها…"
            className="input-dark w-full !rounded-2xl !py-2 !text-xs"
          />
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-mist-400">
            <Icon name="search" size={13} />
          </span>
        </div>
      </div>

      {/* folders */}
      <div className="border-t border-white/5 px-3 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-mist-400">پوشه‌ها</span>
          <button onClick={() => setNewFolder((v) => !v)} className="rounded-lg p-1 text-mist-400 transition hover:text-white" title="پوشه جدید">
            <Icon name="plus" size={12} />
          </button>
        </div>
        {newFolder && (
          <input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && folderName.trim()) {
                onCreateFolder(folderName.trim());
                setFolderName("");
                setNewFolder(false);
              }
              if (e.key === "Escape") setNewFolder(false);
            }}
            onBlur={() => {
              if (folderName.trim()) {
                onCreateFolder(folderName.trim());
                setFolderName("");
              }
              setNewFolder(false);
            }}
            placeholder="نام پوشه…"
            autoFocus
            className="input-dark mt-2 w-full !rounded-xl !py-1.5 !text-[11px]"
          />
        )}
        <div className="mt-1.5 space-y-0.5 pb-2">
          {folders.map((f) => (
            <div key={f.id} className="group relative flex items-center">
              <span className="flex flex-1 items-center gap-2 truncate rounded-xl px-3 py-1.5 text-[11px] text-mist-300">
                <Icon name="chat" size={11} className="opacity-50" />
                {f.name}
              </span>
              <button
                onClick={() => setFolderMenuFor(folderMenuFor === f.id ? null : f.id)}
                className="rounded-lg p-1 text-mist-400 opacity-0 transition hover:text-white group-hover:opacity-100"
              >
                <Icon name="plus" size={10} className="rotate-45" />
              </button>
              {folderMenuFor === f.id && (
                <div className="absolute end-0 top-6 z-30 w-36 rounded-xl border border-white/10 bg-ink-850 p-1 shadow-card">
                  <MenuItem
                    icon="plus"
                    label="تغییر نام"
                    onClick={() => {
                      const name = prompt("نام جدید پوشه:", f.name);
                      if (name?.trim()) onRenameFolder(f.id, name.trim());
                      setFolderMenuFor(null);
                    }}
                  />
                  <MenuItem icon="close" label="حذف پوشه" danger onClick={() => { onDeleteFolder(f.id); setFolderMenuFor(null); }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* conversations */}
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
        {pinned.length > 0 && (
          <>
            <div className="px-3 pb-1 pt-2 text-[10px] font-bold text-mist-400">سنجاق‌شده</div>
            {pinned.map((c) => <ConversationRow key={c.id} c={c} />)}
          </>
        )}
        {rest.length > 0 && (
          <div className="px-3 pb-1 pt-2 text-[10px] font-bold text-mist-400">
            {showArchived ? "بایگانی‌شده" : "گفتگوها"}
          </div>
        )}
        {rest.map((c) => <ConversationRow key={c.id} c={c} />)}
        {filtered.length === 0 && (
          <p className="px-3 py-8 text-center text-[11px] leading-6 text-mist-400">
            {query ? "گفتگویی با این نام پیدا نشد." : "هنوز گفتگویی ندارید."}
          </p>
        )}
      </div>

      {/* footer */}
      <div className="space-y-2 border-t border-white/5 p-3">
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-[11px] text-mist-400 transition hover:text-white"
        >
          <Icon name="chat" size={12} />
          {showArchived ? "بازگشت به گفتگوها" : "مشاهده بایگانی"}
        </button>
        <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] p-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-xs font-black text-black">
            {(user?.email ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold text-white">{user?.email ?? "مهمان"}</p>
            <a href={accountHref} className="text-[10px] text-mist-400 transition hover:text-white">
              حساب کاربری
            </a>
          </div>
          <button onClick={onSignOut} className="rounded-lg p-1.5 text-mist-400 transition hover:text-white" title="خروج">
            <Icon name="arrow-left" size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-[11px] transition ${
        danger ? "text-white hover:bg-white hover:text-black" : "text-mist-200 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );
}
