"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  role: string;
  balance: number;
  plan: string | null;
  planStatus: string | null;
  planEndsAt: string | null;
  usage: { messages: number; inputTokens: number; outputTokens: number } | null;
  createdAt: string;
};

type Pagination = { page: number; limit: number; total: number; totalPages: number };

const PLAN_FA: Record<string, string> = {
  basic: "پایه",
  plus: "پلاس",
  scale: "سازمانی",
};

const PLAN_BADGE: Record<string, string> = {
  basic: "border-white/15 bg-white/[0.06] text-mist-200",
  plus: "border-white/25 bg-white/[0.1] text-white",
  scale: "border-white/40 bg-white/[0.14] text-white",
};

const fa = (n: number) => n.toLocaleString("fa-IR");

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState("all");

  const load = useCallback((page: number, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (q) params.set("search", q);
    fetch(`/api/admin/users?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setMembers(d.users);
          setPagination(d.pagination);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1, "");
  }, [load]);

  const filtered = useMemo(
    () => (planFilter === "all" ? members : members.filter((m) => m.plan === planFilter)),
    [members, planFilter]
  );

  function go(page: number) {
    if (page < 1 || page > pagination.totalPages) return;
    load(page, search);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    load(1, search);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">اعضا</h1>
        <p className="mt-1 text-xs text-mist-400">
          {fa(pagination.total)} کاربر — پلن، مصرف دوره جاری و موجودی کیف پول.
        </p>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={submitSearch} className="relative min-w-56 flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی ایمیل یا نام…"
            className="w-full rounded-2xl border border-white/10 bg-ink-900 py-2.5 pe-11 ps-4 text-sm text-white placeholder:text-mist-400 transition-colors focus:border-white/40 focus:outline-none"
          />
          <button type="submit" className="absolute end-3 top-1/2 -translate-y-1/2 text-mist-400 hover:text-white">
            🔍
          </button>
        </form>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="rounded-2xl border border-white/10 bg-ink-900 px-4 py-2.5 text-sm text-white focus:border-white/40 focus:outline-none"
        >
          <option value="all">همه پلن‌ها</option>
          <option value="basic">پایه</option>
          <option value="plus">پلاس</option>
          <option value="scale">سازمانی</option>
          <option value="none">بدون اشتراک</option>
        </select>
      </div>

      {/* table */}
      <div className="card overflow-x-auto p-6">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-start text-mist-400">
              <th className="pb-3 text-start font-medium">کاربر</th>
              <th className="pb-3 text-start font-medium">پلن</th>
              <th className="pb-3 text-start font-medium">تمدید</th>
              <th className="pb-3 text-start font-medium">پیام‌ها</th>
              <th className="pb-3 text-start font-medium">توکن ورودی</th>
              <th className="pb-3 text-start font-medium">توکن خروجی</th>
              <th className="pb-3 text-start font-medium">موجودی (تومان)</th>
              <th className="pb-3 text-start font-medium">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-mist-400">در حال بارگذاری…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-mist-400">کاربری پیدا نشد.</td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3">
                    <p className="font-bold text-white" dir="ltr">{m.email}</p>
                    {m.fullName && <p className="mt-0.5 text-[10px] text-mist-400">{m.fullName}</p>}
                  </td>
                  <td className="py-3">
                    {m.plan ? (
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${PLAN_BADGE[m.plan] ?? PLAN_BADGE.basic}`}>
                        {PLAN_FA[m.plan] ?? m.plan}
                      </span>
                    ) : (
                      <span className="text-[10px] text-mist-400">رایگان</span>
                    )}
                  </td>
                  <td className="py-3 text-mist-300">
                    {m.planEndsAt ? new Date(m.planEndsAt).toLocaleDateString("fa-IR") : "—"}
                  </td>
                  <td className="py-3 text-white">{m.usage ? fa(m.usage.messages) : "—"}</td>
                  <td className="py-3 text-white">{m.usage ? fa(m.usage.inputTokens) : "—"}</td>
                  <td className="py-3 text-white">{m.usage ? fa(m.usage.outputTokens) : "—"}</td>
                  <td className="py-3 font-bold text-white">{fa(m.balance)}</td>
                  <td className="py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        m.isActive ? "bg-white/10 text-white" : "bg-red-500/20 text-red-200"
                      }`}
                    >
                      {m.isActive ? "فعال" : "غیرفعال"}
                    </span>
                    {m.role === "admin" && (
                      <span className="ms-1 inline-block rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-black">
                        مدیر
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button
            onClick={() => go(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-mist-300 transition hover:text-white disabled:opacity-30"
          >
            قبلی
          </button>
          <span className="text-mist-400">
            صفحه {fa(pagination.page)} از {fa(pagination.totalPages)}
          </span>
          <button
            onClick={() => go(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-mist-300 transition hover:text-white disabled:opacity-30"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
