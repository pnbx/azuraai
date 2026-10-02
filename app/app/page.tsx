import type { Metadata, Viewport } from 'next'
import { AppChatScreen } from '@/components/app/chat-screen'
import { I18nProvider } from '@/components/app/i18n-provider'
import { getServerUser } from '@/lib/auth/server'

export const metadata: Metadata = {
  title: 'Chat',
  description: 'Free AI chat with deep thinking and research modes',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default async function AppChatPage() {
  // No sign-in in the app: everyone lands in chat. A session is only a bonus —
  // it turns on long-term memory for whoever happens to be logged in on the
  // web — so this never blocks rendering.
  const authed = await getServerUser()
    .then(() => true)
    .catch(() => false)

  return (
    <div className="h-dvh">
      {/* The locale itself is resolved by the pre-paint script in the root
          layout head; this only supplies the store. */}
      <I18nProvider>
        <AppChatScreen authed={authed} />
      </I18nProvider>
    </div>
  )
}