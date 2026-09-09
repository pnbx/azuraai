'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Menu, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NAV_ITEMS } from './sidebar'

interface TopbarProps {
  onMobileMenuOpen: () => void
}

function Topbar({ onMobileMenuOpen }: TopbarProps) {
  const pathname = usePathname()

  const currentPage = NAV_ITEMS.find((item) => {
    if (item.href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(item.href)
  })

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-topbar-border bg-topbar/80 backdrop-blur-sm px-4 sm:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMobileMenuOpen}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Page title */}
      <div className="flex-1">
        <h1 className="text-sm font-medium text-foreground">
          {currentPage?.label ?? 'Dashboard'}
        </h1>
      </div>

      {/* User indicator */}
      <div className="flex items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User className="h-4 w-4" />
        </div>
      </div>
    </header>
  )
}

export { Topbar }
