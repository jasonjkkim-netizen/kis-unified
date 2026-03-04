/**
 * Unified Signal Detection Engine
 * Consolidated strategies: momentum, breakout, reversal (from scanner/trading)
 * + turtle_breakout (from kospi-turtle)
 * 
 * All strategies generate TradingSignal objects and optionally send Telegram alerts
 */

import { v4 as uuidv4 } from "uuid";
import type { TradingSignal, StrategyType, SignalConfig, StockQuote } from "../shared/schema";
import { calculateMA, calculateRSI, calculateATR, calculateMACD, getDailyPrices, getStockPrice } from "./kisApi";
import { formatSignalAlert, sendAlert } from "./telegram";

// ─── Signal State ────────────────────────────────────────────────

let activeSignals: TradingSignal[] = [];
let signalHistory: TradingSignal[] = [];
const cooldownMap = new Map<string, number>(); // stockCode -> timestamp

const DEFAULT_CONFIG: SignalConfig = {
  enabled: true,
  strategies: { momentum: true, breakout: true, reversal: true, turtle: true },
  telegramAlerts: true,
  maxSignalsPerStock: 2,
  cooldownMinutes: 5,
};

let config: SignalConfig = { ...DEFAULT_CONFIG };

// ─── Config Management ───────────────────────────────────────────

export function getSignalConfig(): SignalConfig { return config; }
export function updateSignalConfig(updates: Partial<SignalConfig>): SignalConfig {
  config = { ...config, ...updates };
  return config;
}
export function getActiveSignals(): TradingSignal[] { return activeSignals; }
export function getSignalHistory(): TradingSignal[] { return signalHistory; }

// ─── Cooldown Check ──────────────────────────────────────────────

function canEmitSignal(stockCode: string): boolean {
  const last = cooldownMap.get(stockCode);
  if (!last) return true;
  return Date.now() - last > config.cooldownMinutes * 60 * 1000;
}

function recordSignal(stockCode: string): void {
  cooldownMap.set(stockCode, Date.now());
}

// ─── Core Signal Scanner ─────────────────────────────────────────

export async function runSignalScan(
  stocks: Partial<StockQuote>[],
  sendAlerts: boolean = true
): Promise<TradingSignal[]> {
  const newSignals: TradingSignal[] = [];

  for (const stock of stocks) {
    if (!stock.code || !stock.name) continue;
    if (!canEmitSignal(stock.code)) continue;

    const detected: TradingSignal[] = [];

    // Get price history for advanced strategies
    let dailyPrices: number[] = [];
    let highs: number[] = [];
    let lows: number[] = [];
    let closes: number[] = [];
    
    try {
      const history = await getDailyPrices(stock.code);
      if (history && history.length > 0) {
        dailyPrices = history.map((d: any) => Number(d.stck_clpr)).filter(Boolean);
        highs = history.map((d: any) => Number(d.stck_hgpr)).filter(Boolean);
        lows = history.map((d: any) => Number(d.stck_lwpr)).filter(Boolean);
        closes = dailyPrices;
      }
    } catch {}

    // ─── Strategy 1: Momentum ────────────────────────
    if (config.strategies.momentum) {
      const sig = detectMomentum(stock, dailyPrices);
      if (sig) detected.push(sig);
    }

    // ─── Strategy 2: Breakout ────────────────────────
    if (config.strategies.breakout) {
      const sig = detectBreakout(stock, dailyPrices);
      if (sig) detected.push(sig);
    }

    // ─── Strategy 3: Reversal ────────────────────────
    if (config.strategies.reversal) {
      const sig = detectReversal(stock, dailyPrices);
      if (sig) detected.push(sig);
    }

    // ─── Strategy 4: Turtle Breakout ─────────────────
    if (config.strategies.turtle && highs.length >= 20) {
      const sig = detectTurtleBreakout(stock, highs, lows, closes);
      if (sig) detected.push(sig);
    }

    // Sort by confidence, take top signals
    detected.sort((a, b) => b.confidence - a.confidence);
    const toEmit = detected.slice(0, config.maxSignalsPerStock);
    
    for (const sig of toEmit) {
      recordSignal(stock.code);
      activeSignals.push(sig);
      newSignals.push(sig);

      if (sendAlerts && config.telegramAlerts) {
        await sendAlert(formatSignalAlert(sig));
      }
    }
  }

  return newSignals;
}

// ─── Momentum Strategy ───────────────────────────────────────────
// Triggers: Price > MA5 > MA20, RSI 40-65, volume ratio >= 1.3

function detectMomentum(stock: Partial<StockQuote>, prices: number[]): TradingSignal | null {
  const { price, ma5, ma20, ma60, rsi, volumeRatio, code, name, market } = stock;
  if (!price || !ma5 || !ma20 || !rsi || !code || !name) return null;

  const maAligned = ma5 > ma20 && (ma60 ? ma20 > ma60 : true);
  const rsiInRange = rsi >= 40 && rsi <= 65;
  const volOk = (volumeRatio || 0) >= 1.3;
  const rsiTrending = prices.length >= 2 ? calculateRSI(prices.slice(0, 7)) > calculateRSI(prices.slice(1, 8)) : true;

  if (!maAligned || !rsiInRange || !volOk) return null;

  let confidence = 50;
  if (ma60 && ma5 > ma20 && ma20 > ma60) confidence += 15;
  if ((volumeRatio || 0) >= 2.0) confidence += 10;
  if (rsi >= 45 && rsi <= 60) confidence += 10;
  if (rsiTrending) confidence += 5;
  confidence = Math.min(confidence, 90);

  return {
    id: uuidv4(),
    strategy: "momentum",
    stockCode: code,
    stockName: name,
    market: market || "",
    action: "BUY",
    price,
    targetPrice: Math.round(price * 1.03),
    stopLoss: Math.round(price * 0.985),
    confidence,
    reasoning: `MA 정배열 + RSI ${rsi.toFixed(0)} + 거래량 ${(volumeRatio || 0).toFixed(1)}x`,
    rsi, volumeRatio,
    status: "pending",
    timestamp: new Date().toISOString(),
  };
}

// ─── Breakout Strategy ───────────────────────────────────────────
// Triggers: Price breaks 20-day high, volume spike >= 1.8x

function detectBreakout(stock: Partial<StockQuote>, prices: number[]): TradingSignal | null {
  const { price, volumeRatio, code, name, market, rsi, ma5, ma20 } = stock;
  if (!price || !code || !name || prices.length < 20) return null;

  const high20 = Math.max(...prices.slice(0, 20));
  const nearHigh = price >= high20 * 0.99;
  const volSpike = (volumeRatio || 0) >= 1.8;

  if (!nearHigh || !volSpike) return null;

  let confidence = 55;
  if (price > high20) confidence += 10;
  if ((volumeRatio || 0) >= 3.0) confidence += 15;
  if (rsi && rsi < 70) confidence += 5;
  if (ma5 && ma20 && ma5 > ma20) confidence += 5;
  confidence = Math.min(confidence, 90);

  return {
    id: uuidv4(),
    strategy: "breakout",
    stockCode: code,
    stockName: name,
    market: market || "",
    action: "BUY",
    price,
    targetPrice: Math.round(price * 1.04),
    stopLoss: Math.round(high20 * 0.98),
    confidence,
    reasoning: `20일 고가 돌파 (${high20.toLocaleString()}원) + 거래량 ${(volumeRatio || 0).toFixed(1)}x`,
    rsi, volumeRatio,
    status: "pending",
    timestamp: new Date().toISOString(),
  };
}

// ─── Reversal Strategy ───────────────────────────────────────────
// Triggers: RSI <= 35, near MA60 support, or bounce pattern

function detectReversal(stock: Partial<StockQuote>, prices: number[]): TradingSignal | null {
  const { price, rsi, ma60, volumeRatio, code, name, market } = stock;
  if (!price || !rsi || !code || !name) return null;

  const oversold = rsi <= 35;
  const nearMA60 = ma60 ? Math.abs(price - ma60) / ma60 <= 0.05 : false;
  const bounce = prices.length >= 3 && prices[0] > prices[1] && prices[1] > prices[2];

  if (!oversold && !nearMA60 && !bounce) return null;

  let confidence = 45;
  if (oversold && nearMA60) confidence += 10;
  if (bounce) confidence += 15;
  if ((volumeRatio || 0) >= 1.5) confidence += 10;
  if (rsi <= 25) confidence += 5;
  confidence = Math.min(confidence, 85);

  return {
    id: uuidv4(),
    strategy: "reversal",
    stockCode: code,
    stockName: name,
    market: market || "",
    action: "BUY",
    price,
    targetPrice: Math.round(price * 1.025),
    stopLoss: Math.round(price * 0.98),
    confidence,
    reasoning: `RSI ${rsi.toFixed(0)} 과매도${nearMA60 ? " + MA60 지지" : ""}${bounce ? " + 반등패턴" : ""}`,
    rsi, volumeRatio,
    status: "pending",
    timestamp: new Date().toISOString(),
  };
}

// ─── Turtle Breakout Strategy (from kospi-turtle) ────────────────
// Triggers: Price breaks N-day high/low, ATR-based stops

function detectTurtleBreakout(
  stock: Partial<StockQuote>,
  highs: number[], lows: number[], closes: number[]
): TradingSignal | null {
  const { price, code, name, market, rsi, volumeRatio } = stock;
  if (!price || !code || !name || highs.length < 20) return null;

  const period = 20;
  const high20 = Math.max(...highs.slice(0, period));
  const low20 = Math.min(...lows.slice(0, period));
  const atr = calculateATR(highs, lows, closes, 14);
  
  if (atr <= 0) return null;

  const isBuyBreakout = price >= high20;
  const isSellBreakout = price <= low20;

  if (!isBuyBreakout && !isSellBreakout) return null;

  const action = isBuyBreakout ? "BUY" : "SELL";
  const stopMultiple = 2;
  const stopLoss = isBuyBreakout 
    ? Math.round(price - atr * stopMultiple)
    : Math.round(price + atr * stopMultiple);
  const targetPrice = isBuyBreakout
    ? Math.round(price + atr * 3)
    : Math.round(price - atr * 3);

  let confidence = 55;
  if ((volumeRatio || 0) >= 1.5) confidence += 10;
  if (rsi && rsi > 50 && rsi < 70 && isBuyBreakout) confidence += 10;
  if (rsi && rsi < 50 && rsi > 30 && isSellBreakout) confidence += 10;
  confidence = Math.min(confidence, 85);

  return {
    id: uuidv4(),
    strategy: "turtle_breakout",
    stockCode: code,
    stockName: name,
    market: market || "",
    action,
    price,
    targetPrice,
    stopLoss,
    confidence,
    reasoning: `${period}일 ${isBuyBreakout ? "고가" : "저가"} 돌파 | ATR: ${atr.toFixed(0)} | 손절: ${stopMultiple}x ATR`,
    rsi, volumeRatio, atr,
    status: "pending",
    timestamp: new Date().toISOString(),
  };
}

// ─── Signal Lifecycle ────────────────────────────────────────────

export function confirmSignal(signalId: string): TradingSignal | null {
  const idx = activeSignals.findIndex(s => s.id === signalId);
  if (idx === -1) return null;
  const signal = activeSignals.splice(idx, 1)[0];
  signal.status = "confirmed";
  signalHistory.push(signal);
  return signal;
}

export function dismissSignal(signalId: string): boolean {
  const idx = activeSignals.findIndex(s => s.id === signalId);
  if (idx === -1) return false;
  const signal = activeSignals.splice(idx, 1)[0];
  signal.status = "dismissed";
  signalHistory.push(signal);
  return true;
}

export function clearSignals(): void {
  activeSignals = [];
}
