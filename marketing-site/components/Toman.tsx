// Format a number with Persian digits and thousand separators.
export function formatToman(n: number): string {
  const fa = (n.toLocaleString("fa-IR"));
  return fa;
}

export default function Toman({
  value,
  suffix,
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="font-extrabold text-white">{formatToman(value)}</span>
      {suffix ? <span className="ms-1 text-sm font-medium text-slate-400">{suffix}</span> : null}
    </span>
  );
}
