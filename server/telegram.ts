/**
 * Unified Telegram Alert Module
 * Consolidated from: kis-stock-scanner, kis-trading
 * Added: turtle strategy alerts, single bot for everything
 * 
 * Sends all alerts through ONE Telegram bot with category tags:
 * [스캐너] for scanner alerts
 * [트레이딩] for trading engine alerts
 * [터틀] for turtle strategy alerts
 * [시그널] for day trading signals
 */

import { db } from "./db";
import { settings } from "../shared/schema";
import type { TradingSignal, StockQuote, PlaybookData } from "../shared/schema";
import { sleep } from "./utils";

// ─── Core Telegram Functions ─────────────────────────────────────

function cleanTelegramToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length > 60) {
    const half = Math.floor(trimmed.length / 2);
    const first = trimmed.substring(0, half);
    const second = trimmed.substring(half);
    if (first === second) return first;
  }
  return trimmed;
}

export async function getTelegramConfig(): Promise<{ token: string; chatId: string } | null> {
  try {
    const [s] = await db.select().from(settings).limit(1);
    const token = s?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const chatId = s?.telegramChatId || process.env.TELEGRAM_CHAT_ID || "";
    if (!token || !chatId) return null;
    return { token: cleanTelegramToken(token), chatId };
  } catch {
    const token = process.env.TELEGRAM_BOT_TOKEN || "";
    const chatId = process.env.TELEGRAM_CHAT_ID || "";
    if (!token || !chatId) return null;
    return { token: cleanTelegramToken(token), chatId };
  }
}

export async function sendTelegramMessage(
  token: string, chatId: string, message: string
): Promise<boolean> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
          }),
        }
      );

      if (res.ok) return true;

      const data = await res.json().catch(() => ({}));
      // Flood control: retry after wait
      if (data?.parameters?.retry_after) {
        const wait = data.parameters.retry_after * 1000;
        console.log(`[Telegram] Flood wait ${wait}ms, retrying...`);
        await sleep(wait + 500);
        continue;
      }
      
      if (res.status === 429) {
        await sleep(2000 * Math.pow(2, attempt));
        continue;
      }

      console.error(`[Telegram] Send failed: ${res.status}`, data);
      return false;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) {
        console.error("[Telegram] Send error after retries:", err);
        return false;
      }
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  return false;
}

export async function sendAlert(message: string): Promise<boolean> {
  const config = await getTelegramConfig();
  if (!config) {
    console.log("[Telegram] No config available, skipping alert");
    return false;
  }
  return sendTelegramMessage(config.token, config.chatId, message);
}

// ─── Auto-detect Chat ID ────────────────────────────────────────

export async function autoDetectChatId(token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cleanTelegramToken(token)}/getUpdates?limit=100`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const updates = data?.result || [];
    
    for (const update of updates) {
      const chat = update?.message?.chat;
      if (chat?.id) return String(chat.id);
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Startup Notification ────────────────────────────────────────

export async function sendStartupNotification(): Promise<void> {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  await sendAlert(
    `🟢 <b>[시스템] KIS 통합 트레이딩 시작</b>\n\n` +
    `시간: ${now}\n` +
    `모듈: 스캐너 + 트레이딩 + 터틀\n` +
    `텔레그램 알림: 활성화`
  );
}

// ─── Scanner Alert Formatters ────────────────────────────────────

export function formatScanSummary(
  totalScanned: number, candidatesFound: number, scanId: string, source: string
): string {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const tag = source === "turtle" ? "터틀" : source === "trading" ? "트레이딩" : "스캐너";
  return (
    `📊 <b>[${tag}] 스캔 완료</b>\n\n` +
    `시간: ${now}\n` +
    `총 스캔: ${totalScanned}종목\n` +
    `후보: <b>${candidatesFound}종목</b>\n` +
    `ID: ${scanId.substring(0, 8)}`
  );
}

export function formatStockAlert(stock: Partial<StockQuote>, source: string = "scanner"): string {
  const tag = source === "turtle" ? "터틀" : source === "trading" ? "트레이딩" : "스캐너";
  const price = Number(stock.price || 0).toLocaleString();
  const change = Number(stock.changePercent || 0).toFixed(2);
  const changeEmoji = (stock.changePercent || 0) >= 0 ? "🔴" : "🔵";
  const vol = (Number(stock.tradingValue || 0) / 100000000).toFixed(0);
  
  const maStatus = (stock.ma5 && stock.ma20 && stock.ma60 && 
    stock.ma5 > stock.ma20 && stock.ma20 > stock.ma60) 
    ? "✅ 정배열" : "⬜ 비정배열";

  let msg = `${changeEmoji} <b>[${tag}] ${stock.name}</b> (${stock.code})\n\n`;
  msg += `💰 현재가: ${price}원 (${change}%)\n`;
  msg += `📈 거래대금: ${vol}억원\n`;
  
  if (stock.rsi) msg += `📊 RSI: ${stock.rsi.toFixed(1)}\n`;
  if (stock.ma5 && stock.ma20 && stock.ma60) {
    msg += `📉 MA: ${maStatus}\n`;
    msg += `   5일: ${Math.round(stock.ma5).toLocaleString()} / 20일: ${Math.round(stock.ma20).toLocaleString()} / 60일: ${Math.round(stock.ma60).toLocaleString()}\n`;
  }
  if (stock.atr) msg += `📐 ATR: ${stock.atr.toFixed(0)}\n`;
  if (stock.volumeRatio) msg += `🔊 거래량비: ${stock.volumeRatio.toFixed(1)}x\n`;

  return msg;
}

// ─── Signal Alert Formatter (momentum/breakout/reversal/turtle) ──

const STRATEGY_LABELS: Record<string, string> = {
  momentum: "🚀 모멘텀",
  breakout: "💥 돌파",
  reversal: "🔄 반전",
  turtle_breakout: "🐢 터틀 돌파",
};

export function formatSignalAlert(signal: TradingSignal): string {
  const stratLabel = STRATEGY_LABELS[signal.strategy] || signal.strategy;
  const actionEmoji = signal.action === "BUY" ? "🟢 매수" : "🔴 매도";
  const price = Number(signal.price).toLocaleString();
  const target = Number(signal.targetPrice).toLocaleString();
  const sl = Number(signal.stopLoss).toLocaleString();

  let msg = `📡 <b>[시그널] ${stratLabel}</b>\n\n`;
  msg += `종목: <b>${signal.stockName}</b> (${signal.stockCode})\n`;
  msg += `방향: ${actionEmoji}\n`;
  msg += `현재가: ${price}원\n`;
  msg += `목표가: ${target}원\n`;
  msg += `손절가: ${sl}원\n`;
  msg += `신뢰도: ${signal.confidence}%\n`;
  if (signal.rsi) msg += `RSI: ${signal.rsi.toFixed(1)}\n`;
  if (signal.volumeRatio) msg += `거래량비: ${signal.volumeRatio.toFixed(1)}x\n`;
  if (signal.atr) msg += `ATR: ${signal.atr.toFixed(0)}\n`;
  msg += `\n💡 ${signal.reasoning}`;

  return msg;
}

// ─── Turtle Playbook Alert ──────────────────────────────────────

export function formatPlaybookAlert(pb: PlaybookData): string {
  let msg = `🐢 <b>[터틀] 트레이딩 플레이북</b>\n\n`;
  msg += `종목: <b>${pb.signal.stockName}</b> (${pb.signal.stockCode})\n`;
  msg += `전략: ${pb.strategy.name}\n\n`;
  msg += `📍 진입: ${Number(pb.entry.price).toLocaleString()}원\n`;
  msg += `   조건: ${pb.entry.trigger}\n`;
  msg += `🛑 손절: ${Number(pb.stopLoss.price).toLocaleString()}원 (${pb.stopLoss.method})\n`;
  msg += `🎯 목표: +${((pb.exitRules.profitTarget - 1) * 100).toFixed(1)}%\n\n`;
  msg += `💰 포지션:\n`;
  msg += `   계좌: ${Number(pb.positionSizing.accountSize).toLocaleString()}원\n`;
  msg += `   리스크: ${(pb.positionSizing.riskPerTrade * 100).toFixed(1)}%\n`;
  msg += `   수량: ${pb.positionSizing.shareCount}주\n`;
  msg += `   금액: ${Number(pb.positionSizing.positionValue).toLocaleString()}원`;

  return msg;
}

// ─── Trading Engine Alerts ──────────────────────────────────────

export function formatTradingAlert(
  action: "scan" | "buy" | "sell",
  details: { stockName?: string; stockCode?: string; quantity?: number; price?: number; total?: number; candidates?: number }
): string {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  
  if (action === "scan") {
    return (
      `🔍 <b>[트레이딩] 자동 스캔 완료</b>\n\n` +
      `시간: ${now}\n` +
      `후보: ${details.candidates || 0}종목`
    );
  }
  if (action === "buy") {
    return (
      `🟢 <b>[트레이딩] 매수 체결</b>\n\n` +
      `종목: ${details.stockName} (${details.stockCode})\n` +
      `수량: ${details.quantity}주\n` +
      `가격: ${Number(details.price || 0).toLocaleString()}원\n` +
      `금액: ${Number(details.total || 0).toLocaleString()}원`
    );
  }
  // sell
  return (
    `🔴 <b>[트레이딩] 매도 체결</b>\n\n` +
    `종목: ${details.stockName} (${details.stockCode})\n` +
    `수량: ${details.quantity}주\n` +
    `가격: ${Number(details.price || 0).toLocaleString()}원`
  );
}

// ─── Batch Send ──────────────────────────────────────────────────

export async function sendBatchAlerts(messages: string[]): Promise<number> {
  let sent = 0;
  for (const msg of messages) {
    const ok = await sendAlert(msg);
    if (ok) sent++;
    await sleep(200); // Rate limit between messages
  }
  return sent;
}

