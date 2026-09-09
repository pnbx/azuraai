'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatToman, formatDate } from '@/lib/utils'

interface WalletDetail {
  wallet: {
    id: string
    userId: string
    email: string
    fullName: string | null
    balance: number
    currency: string
    updatedAt: string
  }
  transactions: Array<{
    id: string
    type: string
    amount: number
    balanceBefore: number
    balanceAfter: number
    referenceId: string | null
    status: string
    metadata: Record<string, unknown> | null
    createdAt: string
  }>
}

export default function AdminWalletDetailPage() {
  const params = useParams()
  const walletId = params.id as string
  const [data, setData] = React.useState<WalletDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [action, setAction] = React.useState<'credit' | 'debit'>('credit')
  const [amount, setAmount] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState('')

  const loadData = React.useCallback(() => {
    fetch(`/api/admin/wallets/${walletId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d)
        else setError(d.error || 'Failed to load')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [walletId])

  React.useEffect(() => { loadData() }, [loadData])

  const handleAdjust = async () => {
    const parsedAmount = parseInt(amount, 10)
    if (!parsedAmount || parsedAmount <= 0) {
      setResult('Amount must be a positive integer')
      return
    }
    if (reason.trim().length < 3) {
      setResult('Reason is required (min 3 characters)')
      return
    }

    setSubmitting(true)
    setResult('')
    try {
      const res = await fetch(`/api/admin/wallets/${walletId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount: parsedAmount, reason: reason.trim() }),
      })
      const d = await res.json()
      if (d.success) {
        setResult(`Success. New balance: ${formatToman(d.newBalance)}`)
        setAmount('')
        setReason('')
        loadData()
      } else {
        setResult(d.error || 'Failed')
      }
    } catch {
      setResult('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error || !data) {
    return <EmptyState title="Error" description={error || 'Wallet not found'} />
  }

  const { wallet, transactions } = data

  const typeBadge = (t: string) => {
    const variants: Record<string, 'success' | 'destructive' | 'warning' | 'secondary' | 'info'> = {
      deposit: 'success',
      withdrawal: 'destructive',
      usage_charge: 'info',
      refund: 'warning',
      adjustment: 'secondary',
    }
    return <Badge variant={variants[t] ?? 'secondary'}>{t}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/wallets" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="text-sm font-semibold">{wallet.email}</h2>
          <p className="text-xs text-muted-foreground">{wallet.fullName || wallet.userId}</p>
        </div>
      </div>

      {/* Balance */}
      <Card>
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Current Balance</div>
          <div className="text-2xl font-semibold">{formatToman(wallet.balance)}</div>
        </CardContent>
      </Card>

      {/* Adjust Balance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider">Adjust Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-w-md">
            <div className="flex gap-2">
              <Button
                variant={action === 'credit' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAction('credit')}
              >
                Credit
              </Button>
              <Button
                variant={action === 'debit' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setAction('debit')}
              >
                Debit
              </Button>
            </div>
            <Input
              type="number"
              placeholder="Amount (Toman)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              className="h-8 text-sm"
            />
            <Textarea
              placeholder="Reason for adjustment (required, min 3 characters)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <Button
              size="sm"
              disabled={submitting || !amount || reason.trim().length < 3}
              variant={action === 'credit' ? 'default' : 'destructive'}
              onClick={handleAdjust}
            >
              {submitting ? 'Processing...' : `Confirm ${action === 'credit' ? 'Credit' : 'Debit'}`}
            </Button>
            {result && (
              <p className={`text-xs ${result.startsWith('Success') ? 'text-success' : 'text-destructive'}`}>
                {result}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider">
              Transaction History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Before</TableHead>
                    <TableHead className="hidden sm:table-cell">After</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{typeBadge(t.type)}</TableCell>
                      <TableCell className="text-sm font-medium">
                        {t.type === 'deposit' || t.type === 'refund' ? '+' : '-'}
                        {formatToman(t.amount)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {formatToman(t.balanceBefore)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {formatToman(t.balanceAfter)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.status === 'completed' ? 'success' : 'secondary'}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {formatDate(t.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
