import * as React from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  description?: string
  icon?: React.ReactNode
  className?: string
}

function StatCard({ label, value, description, icon, className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-5', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-xl font-semibold tracking-tight text-card-foreground truncate">
            {value}
          </p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {icon && (
          <div className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

export { StatCard, type StatCardProps }
