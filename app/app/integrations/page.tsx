import type { Metadata } from 'next'
import { AppIntegrationsPanel } from '@/components/app/integrations-panel'
import { getServerUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Integrations — Azura',
  description: 'Connect Google for Gmail and Calendar superpowers',
}

export default async function AppIntegrationsPage() {
  let authed = false
  try {
    await getServerUser()
    authed = true
  } catch {
    authed = false
  }
  if (!authed) redirect('/auth/login?redirect=/app/integrations')

  return <AppIntegrationsPanel />
}
