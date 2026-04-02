/**
 * Unified Trading Engine
 * From kis-trading: scheduled auto-trading at 15:15/15:20/09:05 KST
 * Now integrated with unified Telegram alerts
 */

import type { TradeOrder, TradingPosition, TradingStatus, TradingLog } from "../shared/schema";
import { getMarketVolumeRankings, placeBuyOrder, placeSellOrder, calculateMA, calculateRSI, getDailyPrices } from "./kisApi";
import { formatTradingAlert, sendAlert } from "./telegram";
import { runSignalScan } from "./signals";
import { sleep } from "./utils";

// ─── State ───────────────────────────────────────────────────────

let isAutoTrading = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const tradingLogs: TradingLog[] = [];
const tradeOrders: TradeOrder[] = [];
const tradingPositions: TradingPosition[] = [];
let lastScanTime: string | null = null;
const INVESTMENT_PER_STOCK = 1000000; // 100만원

// ─── KST Time Helper ────────────────────────────────────────────

function getKSTTime(): { hours: number; minutes: number; day: number } {
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return { hours: kst.getHours(), minutes: kst.getMinutes(), day: kst.getDay() };
}

function isWeekday(): boolean {
  const { day } = getKSTTime();
  return day >= 1 && day <= 5;
}

// ─── 6-Step Filter ───────────────────────────────────────────────

interface FilterCandidate {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  tradingValue: number;
  prevVolume: number;
  high: number;
  ma5: number;
  ma20: number;
  ma60: number;
}

function applyFilters(candidates: FilterCandidate[]): FilterCandidate[] {
  return candidates.filter(c => {
    // 1. Price >= 1,000원
    if (c.price < 1000) return false;
    // 2. Daily change +5% ~ +25%
    if (c.changePercent < 5 || c.changePercent > 25) return false;
    // 3. Trading volume >= 500억
    if (c.tradingValue < 50000000000) return false;
    // 4. Volume increase >= 200%
    if (c.prevVolume > 0 && (c.volume / c.prevVolume) < 2.0) return false;
    // 5. Price within 3% of daily high
    if (c.high > 0 && (c.high - c.price) / c.high > 0.03) return false;
    // 6. MA alignment: MA5 > MA20 > MA60
    if (!(c.ma5 > c.ma20 && c.ma20 > c.ma60)) return false;
    return true;
  });
}

// ─── Scan & Trade ────────────────────────────────────────────────

async function scanAndTrade(): Promise<void> {
  log("scan", "자동 스캔 시작 (15:15 KST)");
  
  try {
    const rankings = await getMarketVolumeRankings();
    const candidates: FilterCandidate[] = [];
    
    for (const item of rankings.slice(0, 50)) {
      const code = item.mksc_shrn_iscd || item.stck_shrn_iscd;
      if (!code) continue;
      
      try {
        const prices = await getDailyPrices(code);
        const dailyCloses = prices.map((p: any) => Number(p.stck_clpr)).filter(Boolean);
        
        candidates.push({
          code,
          name: item.hts_kor_isnm || "",
          price: Number(item.stck_prpr) || 0,
          change: Number(item.prdy_vrss) || 0,
          changePercent: Number(item.prdy_ctrt) || 0,
          volume: Number(item.acml_vol) || 0,
          tradingValue: Number(item.acml_tr_pbmn) || 0,
          prevVolume: Number(item.prdy_vol) || 0,
          high: Number(item.stck_hgpr) || 0,
          ma5: dailyCloses.length >= 5 ? calculateMA(dailyCloses, 5) : 0,
          ma20: dailyCloses.length >= 20 ? calculateMA(dailyCloses, 20) : 0,
          ma60: dailyCloses.length >= 60 ? calculateMA(dailyCloses, 60) : 0,
        });
        
        await sleep(200);
      } catch {}
    }

    const filtered = applyFilters(candidates);
    log("scan", `스캔 완료: ${candidates.length}종목 중 ${filtered.length}종목 통과`);
    lastScanTime = new Date().toISOString();

    // Send Telegram alert
    await sendAlert(formatTradingAlert("scan", { candidates: filtered.length }));

    // Also run signal detection on filtered candidates
    const stockQuotes = filtered.map(c => ({
      code: c.code, name: c.name, price: c.price,
      ma5: c.ma5, ma20: c.ma20, ma60: c.ma60,
      changePercent: c.changePercent,
      tradingValue: c.tradingValue,
      volumeRatio: c.prevVolume > 0 ? c.volume / c.prevVolume : 0,
    }));
    await runSignalScan(stockQuotes as any, true);

    // Schedule buy at 15:20
    setTimeout(() => executeBuys(filtered), 5 * 60 * 1000);
  } catch (err: any) {
    log("error", `스캔 실패: ${err.message}`);
  }
}

async function executeBuys(candidates: FilterCandidate[]): Promise<void> {
  log("buy", `매수 실행: ${candidates.length}종목`);
  
  for (const c of candidates) {
    try {
      const quantity = Math.floor(INVESTMENT_PER_STOCK / c.price);
      if (quantity <= 0) continue;

      const result = await placeBuyOrder(c.code, quantity);
      
      const order: TradeOrder = {
        id: `buy-${Date.now()}-${c.code}`,
        stockCode: c.code, stockName: c.name,
        type: "BUY", quantity, price: c.price,
        status: "executed",
        timestamp: new Date().toISOString(),
      };
      tradeOrders.push(order);
      trimOrders();

      tradingPositions.push({
        stockCode: c.code, stockName: c.name,
        quantity, avgPrice: c.price, currentPrice: c.price,
        pnl: 0, pnlPercent: 0,
      });

      await sendAlert(formatTradingAlert("buy", {
        stockName: c.name, stockCode: c.code,
        quantity, price: c.price, total: quantity * c.price,
      }));

      log("buy", `${c.name} ${quantity}주 매수 완료`);
    } catch (err: any) {
      log("error", `${c.name} 매수 실패: ${err.message}`);
    }
  }
}

async function executeSellAll(): Promise<void> {
  log("sell", "전량 매도 시작 (09:05 KST)");
  
  for (const pos of [...tradingPositions]) {
    try {
      await placeSellOrder(pos.stockCode, pos.quantity);
      
      await sendAlert(formatTradingAlert("sell", {
        stockName: pos.stockName, stockCode: pos.stockCode,
        quantity: pos.quantity, price: pos.currentPrice,
      }));

      log("sell", `${pos.stockName} ${pos.quantity}주 매도 완료`);
    } catch (err: any) {
      log("error", `${pos.stockName} 매도 실패: ${err.message}`);
    }
  }
  tradingPositions.length = 0;
}

// ─── Scheduler ───────────────────────────────────────────────────

let lastTriggeredMinute: string | null = null;

function checkSchedule(): void {
  if (!isAutoTrading || !isWeekday()) return;
  const { hours, minutes } = getKSTTime();
  const minuteKey = `${hours}:${minutes}`;
  if (minuteKey === lastTriggeredMinute) return;

  if (hours === 15 && minutes === 15) {
    lastTriggeredMinute = minuteKey;
    scanAndTrade();
  }
  if (hours === 9 && minutes === 5 && tradingPositions.length > 0) {
    lastTriggeredMinute = minuteKey;
    executeSellAll();
  }
}

// ─── Public API ──────────────────────────────────────────────────

export function startAutoTrading(): void {
  if (isAutoTrading) return;
  isAutoTrading = true;
  schedulerInterval = setInterval(checkSchedule, 5000);
  log("scan", "자동 트레이딩 시작");
}

export function stopAutoTrading(): void {
  isAutoTrading = false;
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  log("scan", "자동 트레이딩 중지");
}

export function getTradingStatus(): TradingStatus {
  return {
    isRunning: isAutoTrading,
    mode: isAutoTrading ? "auto" : "manual",
    lastScanTime,
    nextScanTime: isAutoTrading ? getNextScanTime() : null,
    positionCount: tradingPositions.length,
    todayPnl: tradingPositions.reduce((sum, p) => sum + p.pnl, 0),
  };
}

export function getTradingLogs(): TradingLog[] { return tradingLogs.slice(-100); }
export function getTradeOrders(): TradeOrder[] { return tradeOrders; }
export function getTradingPositions(): TradingPosition[] { return tradingPositions; }
export { scanAndTrade as manualScan, executeSellAll as manualSellAll, executeBuys as manualBuy };

function getNextScanTime(): string {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  kst.setHours(15, 15, 0, 0);
  if (kst <= now) kst.setDate(kst.getDate() + 1);
  return kst.toISOString();
}

const MAX_LOG_SIZE = 200;
const MAX_ORDER_SIZE = 500;

function log(type: TradingLog["type"], message: string): void {
  tradingLogs.push({ timestamp: new Date().toISOString(), type, message });
  if (tradingLogs.length > MAX_LOG_SIZE) tradingLogs.splice(0, tradingLogs.length - MAX_LOG_SIZE);
  console.log(`[Trading:${type}] ${message}`);
}

function trimOrders(): void {
  if (tradeOrders.length > MAX_ORDER_SIZE) tradeOrders.splice(0, tradeOrders.length - MAX_ORDER_SIZE);
}

