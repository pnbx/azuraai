import type { Metadata } from 'next'
import { AppSettingsPanel } from '@/components/app/settings-panel'
import { getServerUser } from '@/lib/auth/server'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Theme, integrations and local data controls',
}

export default async function AppSettingsPage() {
  let authed = false
  try {
    await getServerUser()
    authed = true
  } catch {
    authed = false
  }

  return <AppSettingsPanel authed={authed} />
}
