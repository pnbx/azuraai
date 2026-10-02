"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

type Overview = {
  email?: string;
  createdAt?: string;
  balanceCents?: number;
  plan?: string;
  totalRequests?: number;
  totalTokens?: number;
  totalCostCents?: number;
  activeKeys?: number;
  messages?: number;
};

function Card({ title, value, sub, icon }: { title: string; value: string; sub?: string; icon: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <div className="card card-hover p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-mist-400">{title}</span>
        <span className="text-mist-400"><Icon name={icon} size={15} /></span>
      </div>
      <p className="mt-3 text-2xl font-black text-white" dir="ltr">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-mist-400">{sub}</p>}
    </div>
  );
}

export default function AccountOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/user").then((r) => r.json()),
      fetch("/api/wallet").then((r) => r.json()),
      fetch("/api/usage/summary?days=30").then((r) => r.json()),
      fetch("/api/api-keys").then((r) => r.json()),
      fetch("/api/usage").then((r) => r.json()),
    ]).then(([user, wallet, usage, keys, estimate]) => {
      const o: Overview = {};
      if (user.status === "fulfilled" && user.value.success) {
        o.email = user.value.user.email;
        o.createdAt = user.value.user.createdAt;
      }
      if (wallet.status === "fulfilled" && wallet.value.success) {
        o.balanceCents = wallet.value.balance.amount;
      }
      if (usage.status === "fulfilled" && usage.value.success) {
        const s = usage.value.summary;
        o.totalRequests = s.totalRequests;
        o.totalTokens = s.totalTokens;
        o.totalCostCents = s.totalCost;
      }
      if (keys.status === "fulfilled" && keys.value.success) {
        o.activeKeys = keys.value.keys.filter((k: { revokedAt: string | null }) => !k.revokedAt).length;
      }
      if (estimate.status === "fulfilled" && estimate.value.success) {
        o.messages = estimate.value.usage?.monthly_messages ?? 0;
      }
      setData(o);
      setLoading(false);
    });
  }, []);

  const fmt = (n?: number) => (n ?? 0).toLocaleString("fa-IR");

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-white/5" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/5" />)}
        </div>
      </div>
    );
  }

  if (error || !data?.email) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-mist-400">برای مشاهده حساب کاربری، ابتدا وارد شوید.</p>
        <Link href="/auth/login?redirect=/account" className="btn-primary mt-5">ورود</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">نمای کلی حساب</h1>
        <p className="mt-1 text-xs text-mist-400">{data.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="موجودی کیف پول"
          value={`${fmt(data.balanceCents ?? 0)} تومان`}
          sub="اعتبار قابل استفاده"
          icon="key"
        />
        <Card title="درخواست‌های ۳۰ روز" value={fmt(data.totalRequests)} sub="تماس‌های AI و API" icon="chart" />
        <Card title="توکن‌های مصرفی" value={fmt(data.totalTokens)} sub="ورودی + خروجی" icon="spark" />
        <Card
          title="هزینه تخمینی"
          value={`${fmt(data.totalCostCents ?? 0)} تومان`}
          sub="۳۰ روز گذشته"
          icon="bolt"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-sm font-bold text-white">اقدامات سریع</h2>
          <div className="mt-4 grid gap-2">
            <Link href="/chat" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-mist-200 transition hover:border-white/25 hover:text-white">
              <Icon name="chat" size={14} /> شروع گفتگوی جدید
            </Link>
            <Link href="/account/api-keys" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-mist-200 transition hover:border-white/25 hover:text-white">
              <Icon name="key" size={14} /> مدیریت کلیدهای API ({fmt(data.activeKeys)} فعال)
            </Link>
            <Link href="/account/wallet" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-mist-200 transition hover:border-white/25 hover:text-white">
              <Icon name="bolt" size={14} /> افزایش اعتبار کیف پول
            </Link>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-bold text-white">وضعیت حساب</h2>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex justify-between">
              <dt className="text-mist-400">ایمیل</dt>
              <dd className="text-white" dir="ltr">{data.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist-400">تاریخ عضویت</dt>
              <dd className="text-white" dir="ltr">{data.createdAt ? new Date(data.createdAt).toLocaleDateString("fa-IR") : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist-400">وضعیت</dt>
              <dd><span className="badge !text-[10px]">فعال</span></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mist-400">پلن</dt>
              <dd className="text-white">رایگان</dd>
            </div>
          </dl>
          <Link href="/account/security" className="mt-5 flex items-center gap-1.5 text-[11px] text-white hover:underline">
            <Icon name="lock" size={12} /> بررسی تنظیمات امنیتی
          </Link>
        </div>
      </div>
    </div>
  );
}
