import type { Metadata, Viewport } from 'next'
import { AppChatScreen } from '@/components/app/chat-screen'
import { getServerUser } from '@/lib/auth/server'

export const metadata: Metadata = {
  title: 'Azura Chat',
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
  // Publicly viewable: unauthenticated visitors get demo mode (the chat
  // routes 401 and the client falls back to the simulated demo stream).
  // All real features remain server-side auth-protected.
  let authed = false
  try {
    await getServerUser()
    authed = true
  } catch {
    authed = false
  }

  return (
    <div className="h-dvh">
      <AppChatScreen authed={authed} />
    </div>
  )
}
