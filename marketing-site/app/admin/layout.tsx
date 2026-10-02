import Link from "next/link";
import Icon from "@/components/Icon";
import { getServerUser } from "@/lib/auth/server";
import { isAdmin } from "@/lib/auth/admin";

const nav = [
  { href: "/admin/members", label: "اعضا", icon: "chart" },
  { href: "/admin/pricing", label: "قیمت‌گذاری مدل‌ها", icon: "spark" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let admin = false;
  try {
    const user = await getServerUser();
    admin = await isAdmin(user.id);
  } catch {
    admin = false;
  }

  if (!admin) {
    return (
      <div className="container-site flex min-h-[60vh] items-center justify-center py-16">
        <div className="card max-w-md p-10 text-center">
          <Icon name="lock" size={28} className="mx-auto text-mist-300" />
          <h1 className="mt-4 text-lg font-black text-white">دسترسی محدود</h1>
          <p className="mt-2 text-xs leading-6 text-mist-400">
            این بخش فقط برای مدیران سیستم در دسترس است.
          </p>
          <Link href="/auth/login?redirect=/admin" className="btn-primary mt-6 !rounded-full !px-6 !py-2.5 !text-xs">
            ورود
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-site flex gap-6 py-8">
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-24 space-y-1">
          <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-widest text-mist-400">
            پنل مدیریت
          </p>
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
          <div className="my-3 border-t border-white/5" />
          <Link
            href="/account"
            className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs text-mist-400 transition hover:text-white"
          >
            <Icon name="arrow-left" size={13} />
            حساب کاربری
          </Link>
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
