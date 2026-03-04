/**
 * KIS Unified - Storage Layer (Database Operations)
 */
import { db } from "./db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  users, stocks, scanResults, scanHistory, settings, screeningRuns, screeningResults,
  type User, type InsertUser, type Stock, type InsertStock,
  type ScanResult, type InsertScanResult, type ScanHistory, type InsertScanHistory,
  type Settings, type InsertSettings, type ScreeningRun, type ScreeningResult,
} from "../shared/schema";

// ─── Users ──────────────────────────────────────────────────────

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  return user;
}

export async function createUser(data: InsertUser): Promise<User> {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

// ─── Stocks ─────────────────────────────────────────────────────

export async function upsertStock(data: InsertStock): Promise<Stock> {
  const existing = await db.select().from(stocks).where(eq(stocks.code, data.code!));
  if (existing.length > 0) {
    const [updated] = await db.update(stocks).set({ ...data, updatedAt: new Date() }).where(eq(stocks.code, data.code!)).returning();
    return updated;
  }
  const [created] = await db.insert(stocks).values(data).returning();
  return created;
}

export async function getStocks(market?: string): Promise<Stock[]> {
  if (market) {
    return db.select().from(stocks).where(eq(stocks.market, market)).orderBy(desc(stocks.tradingValue));
  }
  return db.select().from(stocks).orderBy(desc(stocks.tradingValue));
}

export async function getStockByCode(code: string): Promise<Stock | undefined> {
  const [stock] = await db.select().from(stocks).where(eq(stocks.code, code));
  return stock;
}

// ─── Scan Results ───────────────────────────────────────────────

export async function createScanResult(data: InsertScanResult): Promise<ScanResult> {
  const [result] = await db.insert(scanResults).values(data).returning();
  return result;
}

export async function createScanResults(data: InsertScanResult[]): Promise<ScanResult[]> {
  if (data.length === 0) return [];
  return db.insert(scanResults).values(data).returning();
}

export async function getScanResults(scanId?: string, source?: string): Promise<ScanResult[]> {
  const conditions = [];
  if (scanId) conditions.push(eq(scanResults.scanId, scanId));
  if (source) conditions.push(eq(scanResults.source, source));

  if (conditions.length > 0) {
    return db.select().from(scanResults).where(and(...conditions)).orderBy(desc(scanResults.createdAt)).limit(200);
  }
  return db.select().from(scanResults).orderBy(desc(scanResults.createdAt)).limit(200);
}

export async function getLatestScanResults(limit = 50): Promise<ScanResult[]> {
  return db.select().from(scanResults).orderBy(desc(scanResults.createdAt)).limit(limit);
}

// ─── Scan History ───────────────────────────────────────────────

export async function createScanHistory(data: InsertScanHistory): Promise<ScanHistory> {
  const [history] = await db.insert(scanHistory).values(data).returning();
  return history;
}

export async function getScanHistoryList(limit = 50, source?: string): Promise<ScanHistory[]> {
  if (source) {
    return db.select().from(scanHistory).where(eq(scanHistory.source, source)).orderBy(desc(scanHistory.createdAt)).limit(limit);
  }
  return db.select().from(scanHistory).orderBy(desc(scanHistory.createdAt)).limit(limit);
}

// ─── Settings ───────────────────────────────────────────────────

export async function getSettings(): Promise<Settings | undefined> {
  const [s] = await db.select().from(settings).limit(1);
  return s;
}

export async function upsertSettings(data: InsertSettings): Promise<Settings> {
  const existing = await db.select().from(settings).limit(1);
  if (existing.length > 0) {
    const [updated] = await db.update(settings).set({ ...data, updatedAt: new Date() }).where(eq(settings.id, existing[0].id)).returning();
    return updated;
  }
  const [created] = await db.insert(settings).values(data).returning();
  return created;
}

// ─── Screening Runs (Turtle) ────────────────────────────────────

export async function createScreeningRun(data: { mode: string; market: string; inputParams: string; resultCount: number }): Promise<ScreeningRun> {
  const [run] = await db.insert(screeningRuns).values(data).returning();
  return run;
}

export async function getScreeningRuns(limit = 20): Promise<ScreeningRun[]> {
  return db.select().from(screeningRuns).orderBy(desc(screeningRuns.createdAt)).limit(limit);
}

// ─── Screening Results (Turtle) ─────────────────────────────────

export async function createScreeningResults(data: Array<{
  runId: number; stockCode: string; stockName: string; market: string;
  signal?: string; strategy?: string; price?: number; targetPrice?: number;
  stopLoss?: number; confidence?: number; atr?: number; rsi?: number;
  macd?: number; entryTrigger?: string; reasoning?: string;
}>): Promise<ScreeningResult[]> {
  if (data.length === 0) return [];
  return db.insert(screeningResults).values(data).returning();
}

export async function getScreeningResults(runId: number): Promise<ScreeningResult[]> {
  return db.select().from(screeningResults).where(eq(screeningResults.runId, runId)).orderBy(desc(screeningResults.confidence));
}

export async function getLatestScreeningResults(limit = 50): Promise<ScreeningResult[]> {
  return db.select().from(screeningResults).orderBy(desc(screeningResults.createdAt)).limit(limit);
}

// ─── Stats ──────────────────────────────────────────────────────

export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalStocks] = await db.select({ count: sql<number>`count(*)` }).from(stocks);
  const [todayScans] = await db.select({ count: sql<number>`count(*)` }).from(scanHistory).where(gte(scanHistory.createdAt, today));
  const [todayCandidates] = await db.select({ count: sql<number>`count(*)` }).from(scanResults).where(gte(scanResults.createdAt, today));
  const [totalAlerts] = await db.select({ count: sql<number>`count(*)` }).from(scanResults).where(eq(scanResults.alertSent, true));

  return {
    totalStocks: Number(totalStocks?.count || 0),
    todayScans: Number(todayScans?.count || 0),
    todayCandidates: Number(todayCandidates?.count || 0),
    totalAlerts: Number(totalAlerts?.count || 0),
  };
}
