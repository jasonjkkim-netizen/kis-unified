import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("ko-KR");
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}조`;
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(0)}억`;
  if (Math.abs(n) >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return formatNumber(n);
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function getChangeColor(change: number | null | undefined): string {
  if (!change) return "text-gray-500";
  return change > 0 ? "text-red-500" : change < 0 ? "text-blue-500" : "text-gray-500";
}

export function formatTime(ts: string | null | undefined): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
