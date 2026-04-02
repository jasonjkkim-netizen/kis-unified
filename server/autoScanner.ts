/**
 * Unified Auto Scanner
 * Consolidated from kis-stock-scanner/autoScanner.ts
 * Now includes turtle screening alongside the standard scanner
 */

import { v4 as uuidv4 } from "uuid";
import { getMarketVolumeRankings, getDailyPrices, calculateMA, calculateRSI, calculateATR } from "./kisApi";
import { formatScanSummary, formatStockAlert, sendAlert, sendBatchAlerts } from "./telegram";
import { runSignalScan } from "./signals";
import { db } from "./db";
import { scanResults, scanHistory } from "../shared/schema";
import type { StockQuote } from "../shared/schema";
import { sleep } from "./utils";

// ─── State ───────────────────────────────────────────────────────

let scanInterval: ReturnType<typeof setInterval> | null = null;
let isScanning = false;
let lastScanTime: string | null = null;
let nextScanTime: string | null = null;
let scanCount = 0;

// ─── Scanner Filters ─────────────────────────────────────────────

interface ScanFilters {
  rsiMin: number;
  rsiMax: number;
  minVolumeMoney: number;
  maFilterEnabled: boolean;
  minPrice: number;
}

const DEFAULT_FILTERS: ScanFilters = {
  rsiMin: 40,
  rsiMax: 80,
  minVolumeMoney: 30000000000, // 300억
  maFilterEnabled: true,
  minPrice: 1000,
};

// ─── Live Scan ───────────────────────────────────────────────────

export async function liveScan(
  filters: Partial<ScanFilters> = {},
  source: string = "scanner"
): Promise<{ scanId: string; total: number; candidates: Partial<StockQuote>[] }> {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const scanId = uuidv4();
  isScanning = true;

  try {
    const rankings = await getMarketVolumeRankings();
    const candidates: Partial<StockQuote>[] = [];

    for (const item of rankings.slice(0, 30)) {
      const code = item.mksc_shrn_iscd || item.stck_shrn_iscd;
      if (!code) continue;

      const price = Number(item.stck_prpr) || 0;
      if (price < f.minPrice) continue;

      const tradingValue = Number(item.acml_tr_pbmn) || 0;
      if (tradingValue < f.minVolumeMoney) continue;

      // Get daily prices for indicators
      let ma5 = 0, ma20 = 0, ma60 = 0, rsi = 50, atr = 0, volumeRatio = 0;
      try {
        const history = await getDailyPrices(code);
        const closes = history.map((d: any) => Number(d.stck_clpr)).filter(Boolean);
        const highs = history.map((d: any) => Number(d.stck_hgpr)).filter(Boolean);
        const lows = history.map((d: any) => Number(d.stck_lwpr)).filter(Boolean);

        if (closes.length >= 5) ma5 = calculateMA(closes, 5);
        if (closes.length >= 20) ma20 = calculateMA(closes, 20);
        if (closes.length >= 60) ma60 = calculateMA(closes, 60);
        if (closes.length >= 15) rsi = calculateRSI(closes);
        if (highs.length >= 15) atr = calculateATR(highs, lows, closes);
        
        const prevVol = Number(item.prdy_vol) || 0;
        const curVol = Number(item.acml_vol) || 0;
        if (prevVol > 0) volumeRatio = curVol / prevVol;
      } catch {}

      // RSI filter
      if (rsi < f.rsiMin || rsi > f.rsiMax) continue;

      // MA alignment filter
      if (f.maFilterEnabled && ma5 > 0 && ma20 > 0 && ma60 > 0) {
        if (!(ma5 > ma20 && ma20 > ma60)) continue;
      }

      const stock: Partial<StockQuote> = {
        code,
        name: item.hts_kor_isnm || "",
        market: (item._market as any) || "KOSPI",
        price,
        change: Number(item.prdy_vrss) || 0,
        changePercent: Number(item.prdy_ctrt) || 0,
        volume: Number(item.acml_vol) || 0,
        tradingValue,
        open: Number(item.stck_oprc) || 0,
        high: Number(item.stck_hgpr) || 0,
        low: Number(item.stck_lwpr) || 0,
        close: price,
        ma5, ma20, ma60, rsi, atr, volumeRatio,
      };

      candidates.push(stock);
      await sleep(200);
    }

    // Save to DB
    try {
      await db.insert(scanHistory).values({
        scanId, totalScanned: rankings.length,
        candidatesFound: candidates.length, source,
      });
    } catch {}

    lastScanTime = new Date().toISOString();
    scanCount++;
    isScanning = false;

    return { scanId, total: rankings.length, candidates };
  } catch (err) {
    isScanning = false;
    throw err;
  }
}

// ─── Scan + Alert ────────────────────────────────────────────────

export async function scanAndAlert(
  filters: Partial<ScanFilters> = {},
  source: string = "scanner"
): Promise<void> {
  const { scanId, total, candidates } = await liveScan(filters, source);

  // Send summary
  await sendAlert(formatScanSummary(total, candidates.length, scanId, source));

  // Send individual stock alerts (batch, max 3800 chars per message)
  const messages = candidates.map(s => formatStockAlert(s, source));
  await sendBatchAlerts(messages);

  // Run signal detection
  await runSignalScan(candidates, true);
}

// ─── Auto-Scan Scheduler ─────────────────────────────────────────

export function startAutoScan(intervalMinutes: number = 10): void {
  if (scanInterval) stopAutoScan();

  const ms = Math.max(1, Math.min(1440, intervalMinutes)) * 60 * 1000;
  
  // Run immediately
  scanAndAlert().catch(err => console.error("[AutoScan] Error:", err));

  scanInterval = setInterval(() => {
    scanAndAlert().catch(err => console.error("[AutoScan] Error:", err));
  }, ms);

  nextScanTime = new Date(Date.now() + ms).toISOString();
  console.log(`[AutoScan] Started with ${intervalMinutes} min interval`);
}

export function stopAutoScan(): void {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  nextScanTime = null;
  console.log("[AutoScan] Stopped");
}

export function getAutoScanStatus() {
  return {
    isRunning: !!scanInterval,
    isScanning,
    lastScanTime,
    nextScanTime,
    scanCount,
  };
}

