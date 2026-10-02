import type { Metadata } from 'next'
import { AppSettingsPanel } from '@/components/app/settings-panel'
import { I18nProvider } from '@/components/app/i18n-provider'
import { getServerUser } from '@/lib/auth/server'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Theme, integrations and local data controls',
}

export default async function AppSettingsPage() {
  // A session is optional here too — memory is simply unavailable without one.
  const authed = await getServerUser()
    .then(() => true)
    .catch(() => false)

  return (
    <I18nProvider>
      <AppSettingsPanel authed={authed} />
    </I18nProvider>
  )
}
