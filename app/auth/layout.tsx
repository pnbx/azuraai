import type { Metadata } from 'next'

/**
 * Auth screens opt out of indexing.
 *
 * A login form is not content, and letting one into the index produces the
 * worst kind of search result: a page that looks like Azura to a stranger and
 * is a password field underneath. This lives in a layout because
 * `app/auth/login/page.tsx` is a client component and cannot export metadata.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}