'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Cpu,
  Server,
  CreditCard,
  Wallet,
  BarChart3,
  ScrollText,
  LogOut,
  ChevronLeft,
  X,
  Shield,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const PRIMARY_NAV: NavItem[] = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
]

const MANAGEMENT_NAV: NavItem[] = [
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Models', href: '/admin/models', icon: Cpu },
  { label: 'Providers', href: '/admin/providers', icon: Server },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Wallets', href: '/admin/wallets', icon: Wallet },
  { label: 'Usage', href: '/admin/usage', icon: BarChart3 },
]

const SYSTEM_NAV: NavItem[] = [
  { label: 'Audit Log', href: '/admin/audit', icon: ScrollText },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const Icon = item.icon
      const active = isActive(item.href)
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active
              ? 'bg-sidebar-accent text-sidebar-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? item.label : undefined}
          onClick={onMobileClose}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </Link>
      )
    })

  const navContent = (
    <nav className="flex h-full flex-col">
      {/* Header */}
      <div className={cn('flex h-12 items-center border-b border-sidebar-border px-4', collapsed && 'justify-center')}>
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </span>
          </div>
        ) : (
          <Shield className="h-4 w-4 text-primary" />
        )}
      </div>

      {/* Primary */}
      <div className="space-y-1 px-3 py-2">{renderNav(PRIMARY_NAV)}</div>

      {/* Management */}
      {!collapsed && (
        <div className="px-6 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Management
          </span>
        </div>
      )}
      <div className="space-y-1 px-3 py-1">{renderNav(MANAGEMENT_NAV)}</div>

      {/* System */}
      {!collapsed && (
        <div className="px-6 py-1 mt-2 border-t border-sidebar-border pt-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            System
          </span>
        </div>
      )}
      {collapsed && <div className="border-t border-sidebar-border mx-3 my-2" />}
      <div className="space-y-1 px-3 py-1">{renderNav(SYSTEM_NAV)}</div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom actions */}
      <div className="space-y-1 border-t border-sidebar-border px-3 py-3">
        <Link
          href="/dashboard"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground',
            'hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Back to Dashboard' : undefined}
          onClick={onMobileClose}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Back to Dashboard</span>}
        </Link>

        <button
          onClick={async () => {
            await fetch('/api/auth/signout', { method: 'POST' })
            router.push('/auth/login')
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground',
            'hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </nav>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen border-r border-sidebar-border bg-sidebar transition-all duration-200',
          collapsed ? 'w-14' : 'w-56'
        )}
      >
        {navContent}
      </aside>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="hidden lg:flex fixed top-3 z-30 items-center justify-center h-6 w-6 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
        style={{ left: collapsed ? '44px' : '212px' }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform', collapsed && 'rotate-180')} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="fixed inset-y-0 left-0 z-50 w-56 bg-sidebar border-r border-sidebar-border sidebar-transition">
            <button
              onClick={onMobileClose}
              className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}

export { Sidebar }
