import Link from "next/link";
import Icon from "@/components/Icon";
import { getServerUser } from "@/lib/auth/server";
import { isAdmin } from "@/lib/auth/admin";

const nav = [
  { href: "/account", label: "نمای کلی", icon: "chart" },
  { href: "/account/subscription", label: "اشتراک و پلن", icon: "spark" },
  { href: "/account/profile", label: "پروفایل", icon: "chat" },
  { href: "/account/settings", label: "تنظیمات", icon: "shield" },
  { href: "/account/security", label: "امنیت", icon: "lock" },
  { href: "/account/wallet", label: "کیف پول", icon: "key" },
  { href: "/account/usage", label: "مصرف", icon: "chart" },
  { href: "/account/api-keys", label: "کلیدهای API", icon: "key" },
  { href: "/account/notifications", label: "اعلان‌ها", icon: "chat" },
  { href: "/account/data", label: "داده و حریم خصوصی", icon: "shield" },
] as const;

const adminNav = [
  { href: "/admin/members", label: "پنل مدیریت", icon: "spark" },
] as const;

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // Admins get an extra sidebar entry; everyone else never sees the link.
  let showAdminLink = false;
  try {
    const user = await getServerUser();
    showAdminLink = await isAdmin(user.id);
  } catch {
    showAdminLink = false;
  }

  return (
    <div className="container-site flex gap-6 py-8">
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-24 space-y-1">
          <Link href="/chat" className="mb-4 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs text-mist-400 transition hover:text-white">
            <Icon name="arrow-left" size={13} />
            بازگشت به چت
          </Link>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-xs font-medium text-mist-300 transition-all duration-300 hover:bg-white/[0.05] hover:text-white"
            >
              <Icon name={n.icon} size={14} />
              {n.label}
            </Link>
          ))}
          {showAdminLink && (
            <>
              <div className="my-3 border-t border-white/5" />
              {adminNav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-xs font-medium text-mist-300 transition-all duration-300 hover:bg-white/[0.05] hover:text-white"
                >
                  <Icon name={n.icon} size={14} />
                  {n.label}
                </Link>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* mobile nav */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/90 backdrop-blur-xl md:hidden">
        <div className="nav-safe-bottom flex overflow-x-auto px-2 py-2">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[9px] text-mist-400 transition hover:text-white"
            >
              <Icon name={n.icon} size={15} />
              {n.label}
            </Link>
          ))}
        </div>
      </div>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  );
}
