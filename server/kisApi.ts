/**
 * KIS Unified API Client
 * Consolidated from: kis-stock-scanner/kisApi.ts, kis-trading/kisApi.ts, kospi-turtle/kis-api.ts
 * 
 * Unified KIS OpenAPI wrapper with:
 * - Token management with retry + caching (60s buffer)
 * - Price data (current + historical)
 * - Volume rankings (multi-market)
 * - Trading operations (buy/sell/balance)
 * - Technical indicators (MA, RSI, MACD, ATR)
 * - Rate limiting with semaphore
 */

import { db } from "./db";
import { settings } from "../shared/schema";
import { eq } from "drizzle-orm";
import { sleep } from "./utils";

const KIS_BASE_URL = "https://openapi.koreainvestment.com:9443";

// ─── Token Cache ─────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiry: number = 0;
const TOKEN_BUFFER_SECONDS = 60;

// ─── Rate Limiter ────────────────────────────────────────────────

let activeCalls = 0;
const MAX_CONCURRENT = 10;
const callQueue: (() => void)[] = [];

async function acquireSemaphore(): Promise<void> {
  if (activeCalls < MAX_CONCURRENT) {
    activeCalls++;
    return;
  }
  return new Promise(resolve => {
    callQueue.push(() => { activeCalls++; resolve(); });
  });
}

function releaseSemaphore(): void {
  activeCalls--;
  if (callQueue.length > 0) {
    const next = callQueue.shift();
    if (next) next();
  }
}

// ─── Credentials ─────────────────────────────────────────────────

interface KISCredentials {
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountPrefix: string;
  accountSuffix: string;
}

export async function getCredentials(): Promise<KISCredentials | null> {
  // Try DB settings first, then env vars
  try {
    const [s] = await db.select().from(settings).limit(1);
    if (s?.kisAppKey && s?.kisAppSecret && s?.kisAccountNo) {
      const acct = s.kisAccountNo;
      return {
        appKey: s.kisAppKey,
        appSecret: s.kisAppSecret,
        accountNo: acct,
        accountPrefix: acct.substring(0, 8),
        accountSuffix: acct.substring(8, 10),
      };
    }
  } catch {}

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const accountNo = process.env.KIS_ACCOUNT_NO || "";
  if (!appKey || !appSecret) return null;
  return {
    appKey, appSecret, accountNo,
    accountPrefix: accountNo.substring(0, 8),
    accountSuffix: accountNo.substring(8, 10),
  };
}

export function hasKisCredentials(): boolean {
  return !!(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET);
}

// ─── Token Management ────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  return acquireTokenWithRetry();
}

async function acquireTokenWithRetry(maxRetries = 4): Promise<string | null> {
  const creds = await getCredentials();
  if (!creds) return null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey: creds.appKey,
          appsecret: creds.appSecret,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Rate limit: EGW00133
        if (data.msg_cd === "EGW00133") {
          const delay = Math.min(1000 * Math.pow(2, attempt), 65000);
          console.log(`[KIS] Token rate limited, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        throw new Error(`Token request failed: ${res.status}`);
      }

      const data = await res.json();
      cachedToken = data.access_token;
      // Use API-provided expiry or default 23h
      const expiresIn = data.expires_in || 82800;
      tokenExpiry = Date.now() + (expiresIn * 1000) - (TOKEN_BUFFER_SECONDS * 1000);
      return cachedToken;
    } catch (err) {
      if (attempt === maxRetries - 1) {
        console.error("[KIS] Token acquisition failed after retries:", err);
        return null;
      }
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  return null;
}

export function getTokenExpiry(): string | null {
  return tokenExpiry > 0 ? new Date(tokenExpiry).toISOString() : null;
}

export function isTokenValid(): boolean {
  return !!(cachedToken && Date.now() < tokenExpiry);
}

export function invalidateToken(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

// ─── Generic API Request ─────────────────────────────────────────

async function kisRequest(
  path: string,
  trId: string,
  params?: Record<string, string>,
  method: "GET" | "POST" = "GET",
  body?: any,
): Promise<any> {
  await acquireSemaphore();
  try {
    const token = await getAccessToken();
    const creds = await getCredentials();
    if (!token || !creds) throw new Error("No KIS credentials available");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
      appkey: creds.appKey,
      appsecret: creds.appSecret,
      tr_id: trId,
      custtype: "P",
    };

    let url = `${KIS_BASE_URL}${path}`;
    if (params && method === "GET") {
      url += "?" + new URLSearchParams(params).toString();
    }

    const res = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) throw new Error(`KIS API error ${res.status}: ${path}`);
    return await res.json();
  } finally {
    releaseSemaphore();
  }
}

// ─── Price Data ──────────────────────────────────────────────────

export async function getStockPrice(stockCode: string): Promise<any> {
  const data = await kisRequest(
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    "FHKST01010100",
    { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: stockCode }
  );
  return data?.output;
}

const dailyPriceCache = new Map<string, { data: any[]; expiry: number }>();
const DAILY_PRICE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getDailyPrices(stockCode: string, period: string = "D"): Promise<any[]> {
  const cacheKey = `${stockCode}:${period}`;
  const cached = dailyPriceCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) return cached.data;

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 90);

  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const data = await kisRequest(
    "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
    "FHKST03010100",
    {
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: stockCode,
      FID_INPUT_DATE_1: fmt(start),
      FID_INPUT_DATE_2: fmt(today),
      FID_PERIOD_DIV_CODE: period,
      FID_ORG_ADJ_PRC: "0",
    }
  );
  const result = data?.output2 || [];
  dailyPriceCache.set(cacheKey, { data: result, expiry: Date.now() + DAILY_PRICE_TTL });
  return result;
}

// ─── Volume Rankings ─────────────────────────────────────────────

export async function getVolumeRanking(
  marketCode: string = "J",
  belongCode: string = "0000",
): Promise<any[]> {
  const data = await kisRequest(
    "/uapi/domestic-stock/v1/quotations/volume-rank",
    "FHPST01710000",
    {
      FID_COND_MRKT_DIV_CODE: marketCode,
      FID_COND_SCR_DIV_CODE: "20101",
      FID_INPUT_ISCD: "0000",
      FID_DIV_CLS_CODE: "0",
      FID_BLNG_CLS_CODE: belongCode,
      FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "000000",
      FID_INPUT_PRICE_1: "",
      FID_INPUT_PRICE_2: "",
      FID_VOL_CNT: "",
      FID_INPUT_DATE_1: "",
    }
  );
  return data?.output || [];
}

export async function getMarketVolumeRankings(): Promise<any[]> {
  const results: any[] = [];
  const segments = [
    { market: "J", belong: "0000", label: "KOSPI" },
    { market: "Q", belong: "0000", label: "KOSDAQ" },
    { market: "J", belong: "0001", label: "ETF/ETN" },
  ];

  for (const seg of segments) {
    try {
      const items = await getVolumeRanking(seg.market, seg.belong);
      items.forEach((item: any) => { item._market = seg.label; });
      results.push(...items);
      await sleep(300);
    } catch (err) {
      console.error(`[KIS] Volume ranking failed for ${seg.label}:`, err);
    }
  }
  return results;
}

// ─── Trading Operations ──────────────────────────────────────────

export async function placeBuyOrder(
  stockCode: string, quantity: number, price: number = 0
): Promise<any> {
  const creds = await getCredentials();
  if (!creds) throw new Error("No trading credentials");

  return kisRequest(
    "/uapi/domestic-stock/v1/trading/order-cash",
    "TTTC0802U",
    undefined,
    "POST",
    {
      CANO: creds.accountPrefix,
      ACNT_PRDT_CD: creds.accountSuffix,
      PDNO: stockCode,
      ORD_DVSN: price === 0 ? "01" : "00", // 01=market, 00=limit
      ORD_QTY: String(quantity),
      ORD_UNPR: String(price),
    }
  );
}

export async function placeSellOrder(
  stockCode: string, quantity: number, price: number = 0
): Promise<any> {
  const creds = await getCredentials();
  if (!creds) throw new Error("No trading credentials");

  return kisRequest(
    "/uapi/domestic-stock/v1/trading/order-cash",
    "TTTC0801U",
    undefined,
    "POST",
    {
      CANO: creds.accountPrefix,
      ACNT_PRDT_CD: creds.accountSuffix,
      PDNO: stockCode,
      ORD_DVSN: price === 0 ? "01" : "00",
      ORD_QTY: String(quantity),
      ORD_UNPR: String(price),
    }
  );
}

export async function getAccountBalance(): Promise<any> {
  const creds = await getCredentials();
  if (!creds) throw new Error("No trading credentials");

  return kisRequest(
    "/uapi/domestic-stock/v1/trading/inquire-balance",
    "TTTC8434R",
    {
      CANO: creds.accountPrefix,
      ACNT_PRDT_CD: creds.accountSuffix,
      AFHR_FLPR_YN: "N",
      OFL_YN: "",
      INQR_DVSN: "02",
      UNPR_DVSN: "01",
      FUND_STTL_ICLD_YN: "N",
      FNCG_AMT_AUTO_RDPT_YN: "N",
      PRCS_DVSN: "00",
      CTX_AREA_FK100: "",
      CTX_AREA_NK100: "",
    }
  );
}

// ─── Connection Test ─────────────────────────────────────────────

export async function checkConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const token = await getAccessToken();
    if (!token) return { success: false, message: "Failed to acquire token" };

    // Test with Samsung Electronics price
    const price = await getStockPrice("005930");
    if (!price) return { success: false, message: "Failed to fetch stock data" };

    return {
      success: true,
      message: `Connected. 삼성전자: ${Number(price.stck_prpr).toLocaleString()}원`
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Connection failed" };
  }
}

// ─── Technical Indicators ────────────────────────────────────────

export function calculateMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(0, period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i - 1] - prices[i]; // newest first
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

export function calculateMACD(
  prices: number[],
  fastPeriod = 12, slowPeriod = 26, signalPeriod = 9
): { macd: number; signal: number; histogram: number } {
  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);
  const macdLine = emaFast - emaSlow;
  // Simplified signal line
  return { macd: macdLine, signal: 0, histogram: macdLine };
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[0] || 0;
  const k = 2 / (period + 1);
  let ema = prices[prices.length - 1]; // start from oldest
  for (let i = prices.length - 2; i >= 0; i--) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateATR(
  highs: number[], lows: number[], closes: number[], period: number = 14
): number {
  if (highs.length < period + 1) return 0;
  let atrSum = 0;
  for (let i = 0; i < period; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i + 1]),
      Math.abs(lows[i] - closes[i + 1])
    );
    atrSum += tr;
  }
  return atrSum / period;
}

