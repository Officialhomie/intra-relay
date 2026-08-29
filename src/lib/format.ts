const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 minutes ago" / "in 2 hours" / "just now". Accepts Date or ISO string. */
export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 45_000) return "just now";
  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return RELATIVE.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Quote money — the amount comes from the API as a decimal string. */
export function formatMoney(amount: string | number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function isExpired(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime() < Date.now();
}
