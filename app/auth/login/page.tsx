'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AzuraLogo } from '@/components/brand/logo'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const redirectUrl = new URL(window.location.href).searchParams.get('redirect') || '/dashboard'

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          redirectUrl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      // Redirect to dashboard or the originally requested page
      router.push(data.redirectTo || '/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const inputClasses =
    'block w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-input-focus focus:outline-none focus:ring-2 focus:ring-ring/40'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      {/* Subtle brand glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(600px 300px at 50% -10%, var(--brand-soft), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-md fade-up">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <AzuraLogo size={64} rounded="rounded-2xl" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to Azura</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your AI platform</p>
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className={inputClasses}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className={`${inputClasses} pr-11`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-colors hover:bg-brand-strong disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <a href="/auth/signup" className="font-medium text-brand-strong hover:underline">
            Register
          </a>
        </p>
      </div>
    </div>
  )
}
