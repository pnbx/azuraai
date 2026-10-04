import type { Metadata } from "next";

/**
 * The chat screen is an application surface, not content.
 *
 * `app/chat/page.tsx` is a client component and cannot export metadata, so the
 * opt-out lives here. robots.txt already disallows `/chat`; this covers the
 * answer engines that fetch a URL before consulting robots.txt.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}