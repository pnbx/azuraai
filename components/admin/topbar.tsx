'use client'

import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Overview',
  '/admin/users': 'Users',
  '/admin/models': 'Models',
  '/admin/providers': 'Providers',
  '/admin/payments': 'Payments',
  '/admin/wallets': 'Wallets',
  '/admin/usage': 'Usage',
  '/admin/audit': 'Audit Log',
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path + '/')) return title
  }
  return 'Admin'
}

interface TopbarProps {
  onMobileMenuOpen: () => void
}

function Topbar({ onMobileMenuOpen }: TopbarProps) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-4 border-b border-border bg-topbar/80 backdrop-blur-sm px-4 lg:px-6">
      <button
        onClick={onMobileMenuOpen}
        className="lg:hidden p-1 rounded-md text-muted-foreground hover:text-foreground"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
        <span
          className={cn(
            'inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary'
          )}
        >
          ADMIN
        </span>
      </div>
    </header>
  )
}

export { Topbar }
