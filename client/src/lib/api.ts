/**
 * API Client for KIS Unified
 */

const BASE = "";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Stats
  getStats: () => request<any>("/api/stats"),

  // Stocks
  getStocks: (market?: string) => request<any[]>(`/api/stocks${market ? `?market=${market}` : ""}`),
  getStockPrice: (code: string) => request<any>(`/api/stocks/${code}/price`),
  getStockDaily: (code: string) => request<any>(`/api/stocks/${code}/daily`),

  // Rankings
  getVolumeRanking: (market = "KOSPI") => request<any[]>(`/api/rankings/volume?market=${market}`),
  getAllRankings: () => request<any[]>("/api/rankings/all"),

  // Scanner
  runScan: () => request<any>("/api/scan/run", { method: "POST" }),
  startAutoScan: (interval = 10) => request<any>("/api/scan/auto/start", { method: "POST", body: JSON.stringify({ interval }) }),
  stopAutoScan: () => request<any>("/api/scan/auto/stop", { method: "POST" }),
  getAutoScanStatus: () => request<any>("/api/scan/auto/status"),
  getScanResults: (source?: string) => request<any[]>(`/api/scan/results${source ? `?source=${source}` : ""}`),
  getScanHistory: (limit = 50) => request<any[]>(`/api/scan/history?limit=${limit}`),

  // Signals
  getSignals: () => request<any[]>("/api/signals"),
  runSignalScan: () => request<any>("/api/signals/scan", { method: "POST" }),
  confirmSignal: (id: string) => request<any>(`/api/signals/${id}/confirm`, { method: "POST" }),
  dismissSignal: (id: string) => request<any>(`/api/signals/${id}/dismiss`, { method: "POST" }),

  // Trading
  startTrading: () => request<any>("/api/trading/start", { method: "POST" }),
  stopTrading: () => request<any>("/api/trading/stop", { method: "POST" }),
  getTradingStatus: () => request<any>("/api/trading/status"),
  getPositions: () => request<any[]>("/api/trading/positions"),
  getOrders: () => request<any[]>("/api/trading/orders"),
  getLogs: () => request<any[]>("/api/trading/logs"),
  manualScan: () => request<any>("/api/trading/scan", { method: "POST" }),
  manualBuy: (data: any) => request<any>("/api/trading/buy", { method: "POST", body: JSON.stringify(data) }),
  sellAll: () => request<any>("/api/trading/sell-all", { method: "POST" }),

  // Turtle Screening
  runScreen: (params?: any) => request<any>("/api/screen", { method: "POST", body: JSON.stringify(params || {}) }),
  getScreenHistory: () => request<any[]>("/api/screen/history"),
  getScreenResults: (runId: number) => request<any[]>(`/api/screen/results/${runId}`),
  getLatestScreenResults: () => request<any[]>("/api/screen/results"),
  getPlaybook: (signal: any) => request<any>("/api/playbook", { method: "POST", body: JSON.stringify({ signal }) }),

  // Telegram
  testTelegram: () => request<any>("/api/telegram/test", { method: "POST" }),
  detectChatId: () => request<any>("/api/telegram/detect-chat", { method: "POST" }),

  // Settings
  getSettings: () => request<any>("/api/settings"),
  saveSettings: (data: any) => request<any>("/api/settings", { method: "POST", body: JSON.stringify(data) }),

  // KIS
  getKisStatus: () => request<any>("/api/kis/status"),
  getBalance: () => request<any>("/api/kis/balance"),
};
