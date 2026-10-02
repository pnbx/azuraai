"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { MIN_FUNDING_TOMAN, MAX_FUNDING_TOMAN } from "@/lib/payment/constants";

type Tx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  status: string;
  createdAt: string;
};

const TYPE_FA: Record<string, string> = {
  deposit: "شارژ حساب",
  usage_charge: "هزینه مصرف",
  refund: "بازپرداخت",
  withdrawal: "برداشت",
  adjustment: "اصلاحیه",
};

const PRESETS = [
  { toman: 100_000, label: "۱۰۰ هزار تومان" },
  { toman: 250_000, label: "۲۵۰ هزار تومان" },
  { toman: 500_000, label: "۵۰۰ هزار تومان" },
  { toman: 1_000_000, label: "۱ میلیون تومان" },
];

const fa = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
// Persian/Arabic digits → Latin, for parsing user-typed amounts
const toEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const fmt = (n: number) => n.toLocaleString("fa-IR");

export default function WalletPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>("TOMAN");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState(250_000);
  // Custom amount input (digits only after sanitizing; empty = preset value)
  const [amountText, setAmountText] = useState("");

  const customNum = amountText ? parseInt(amountText, 10) : 0;
  const amountInvalid = customNum > 0 && (customNum < MIN_FUNDING_TOMAN || customNum > MAX_FUNDING_TOMAN);

  function onAmountChange(raw: string) {
    const digits = toEn(raw).replace(/\D/g, "").slice(0, 10);
    setAmountText(digits);
    const n = parseInt(digits, 10);
    if (n > 0) setSelected(n);
  }

  const [paying, setPaying] = useState(false);
  // Return banner after coming back from the Zibal gateway
  const [gatewayMsg, setGatewayMsg] = useState<{ kind: "success" | "failed"; text: string } | null>(null);

  const fetchWallet = useCallback(() => {
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBalance(d.balance.amount);
          setCurrency(d.balance.currency ?? "TOMAN");
          setTxs(d.transactions);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load wallet + show the result banner when returning from the gateway
  useEffect(() => {
    fetchWallet();
    const sp = new URLSearchParams(window.location.search);
    const payment = sp.get("payment");
    if (!payment) return;
    if (payment === "success") {
      setGatewayMsg({ kind: "success", text: "پرداخت با موفقیت انجام شد و کیف پول شما شارژ گردید ✓" });
    } else if (payment === "failed") {
      setGatewayMsg({ kind: "failed", text: "پرداخت ناموفق بود یا لغو شد — مبلغی از حساب شما کسر نشده است." });
    } else {
      setGatewayMsg({ kind: "failed", text: "پرداخت تأیید نشد. اگر مبلغی از حساب شما کسر شده، با پشتیبانی تماس بگیرید." });
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [fetchWallet]);

  async function payWithZibal() {
    setError(null);
    setPaying(true);
    try {
      const res = await fetch("/api/payments/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountToman: selected, idempotencyKey: crypto.randomUUID() }),
      });
      const d = await res.json();
      const redirectUrl: string | undefined = d.clientSecret ?? d.intent?.clientSecret;
      if (d.success && redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      setError(d.error ?? "ایجاد پرداخت ناموفق بود.");
    } catch {
      setError("خطا در ارتباط با درگاه پرداخت.");
    }
    setPaying(false);
  }

  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-white/5" />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">کیف پول</h1>
        <p className="mt-1 text-xs text-mist-400">اعتبار حساب و تراکنش‌های شما — همه‌چیز به تومان.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* balance */}
        <div className="card p-6">
          <p className="text-xs text-mist-400">موجودی فعلی</p>
          <p className="mt-3 text-3xl font-black text-white">
            {balance != null ? fmt(balance) : "—"}{" "}
            <span className="text-sm font-bold text-mist-300">تومان</span>
          </p>
          <p className="mt-2 text-[10px] text-mist-400">اعتبار برای مصرف چت و API</p>
        </div>

        {/* top-up */}
        <div className="card space-y-4 p-6">
          <p className="text-xs font-bold text-white">افزایش اعتبار</p>
          {error && <p className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[11px] leading-6 text-white">{error}</p>}

          {/* gateway return banner */}
          {gatewayMsg && (
            <div
              className={`rounded-2xl border px-4 py-3 text-[11px] leading-5 ${
                gatewayMsg.kind === "success"
                  ? "border-emerald-400/40 bg-emerald-400/10 font-bold text-emerald-200"
                  : "border-amber-300/30 bg-amber-300/[0.07] text-amber-100"
              }`}
            >
              {gatewayMsg.text}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.toman}
                onClick={() => { setSelected(p.toman); setAmountText(""); }}
                className={`rounded-2xl border px-3 py-2.5 text-[11px] transition ${
                  selected === p.toman
                    ? "border-white/40 bg-white/[0.1] font-bold text-white"
                    : "border-white/10 text-mist-300 hover:border-white/25 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* custom amount */}
          <div>
            <div className="relative">
              <input
                inputMode="numeric"
                autoComplete="off"
                value={amountText ? fmt(customNum) : ""}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="مبلغ دلخواه (تومان)"
                aria-label="مبلغ شارژ دلخواه به تومان"
                className={`w-full rounded-2xl border bg-white/[0.04] px-4 py-2.5 pe-14 text-[12px] text-white placeholder:text-mist-400/60 focus:outline-none ${
                  amountInvalid ? "border-red-400/60" : "border-white/10 focus:border-white/30"
                }`}
              />
              <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-[10px] font-bold text-mist-400">تومان</span>
            </div>
            {amountInvalid && (
              <p className="mt-1.5 text-[10px] leading-5 text-red-300">
                {customNum < MIN_FUNDING_TOMAN
                  ? `حداقل شارژ ${fmt(MIN_FUNDING_TOMAN)} تومان است.`
                  : `حداکثر شارژ ${fmt(MAX_FUNDING_TOMAN)} تومان است.`}
              </p>
            )}
            {!amountInvalid && (
              <p className="mt-1.5 text-[9px] text-mist-400">
                مبلغ دلخواه بین {fmt(MIN_FUNDING_TOMAN)} تا {fmt(MAX_FUNDING_TOMAN)} تومان.
              </p>
            )}
          </div>

          <button onClick={payWithZibal} disabled={paying || amountInvalid} className="btn-primary w-full !rounded-2xl !py-2.5 !text-xs disabled:opacity-40">
            {paying ? "در حال انتقال به درگاه…" : "پرداخت آنلاین با زیبال"}
            {!paying && <Icon name="arrow-left" size={13} />}
          </button>
          <p className="text-center text-[9px] text-mist-400">
            پرداخت امن زیبال با همه کارت‌های شتاب — شارژ آنی کیف پول بعد از تأیید
          </p>
        </div>
      </div>

      {/* transactions */}
      <section className="card p-6">
        <h2 className="text-sm font-bold text-white">تراکنش‌ها</h2>
        {txs.length === 0 ? (
          <p className="py-10 text-center text-xs text-mist-400">هنوز تراکنشی ثبت نشده است.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-start text-[10px] text-mist-400">
                  <th className="pb-2 text-start font-medium">تاریخ</th>
                  <th className="pb-2 text-start font-medium">نوع</th>
                  <th className="pb-2 text-start font-medium">مبلغ (تومان)</th>
                  <th className="pb-2 text-start font-medium">مانده پس از</th>
                  <th className="pb-2 text-start font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-t border-white/5">
                    <td className="py-2.5 text-mist-300">{new Date(t.createdAt).toLocaleDateString("fa-IR")}</td>
                    <td className="py-2.5 text-white">{TYPE_FA[t.type] ?? t.type}</td>
                    <td className="py-2.5">
                      <span className={t.amount >= 0 ? "text-white" : "text-mist-300"}>
                        {t.amount >= 0 ? "+" : "−"}{fmt(Math.abs(t.amount))}
                      </span>
                    </td>
                    <td className="py-2.5 text-mist-300">{fmt(t.balanceAfter)}</td>
                    <td className="py-2.5"><span className="badge !text-[9px]">{t.status === "completed" ? "تکمیل" : t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {currency !== "TOMAN" && (
          <p className="mt-3 text-[9px] text-mist-400">واحد پول حساب: {currency}</p>
        )}
      </section>
    </div>
  );
}
