/**
 * KIS Unified Trading Platform - Shared Schema & Types
 * Consolidated from: kis-stock-scanner, kis-trading, kospi-turtle
 */

import { pgTable, text, serial, integer, boolean, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Database Tables ─────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  market: text("market").notNull(), // KOSPI, KOSDAQ, ETF, ETN
  price: real("price"),
  change: real("change"),
  changePercent: real("change_percent"),
  volume: real("volume"),
  tradingValue: real("trading_value"),
  open: real("open"),
  high: real("high"),
  low: real("low"),
  close: real("close"),
  prevClose: real("prev_close"),
  ma5: real("ma5"),
  ma20: real("ma20"),
  ma60: real("ma60"),
  rsi: real("rsi"),
  macd: real("macd"),
  atr: real("atr"),
  volumeRatio: real("volume_ratio"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scanResults = pgTable("scan_results", {
  id: serial("id").primaryKey(),
  scanId: text("scan_id").notNull(),
  stockCode: text("stock_code").notNull(),
  stockName: text("stock_name").notNull(),
  market: text("market").notNull(),
  price: real("price"),
  change: real("change"),
  changePercent: real("change_percent"),
  volume: real("volume"),
  tradingValue: real("trading_value"),
  ma5: real("ma5"),
  ma20: real("ma20"),
  ma60: real("ma60"),
  rsi: real("rsi"),
  maAligned: boolean("ma_aligned"),
  passedFilter: boolean("passed_filter").default(false),
  alertSent: boolean("alert_sent").default(false),
  // Scanner source: "scanner" | "trading" | "turtle"
  source: text("source").default("scanner"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scanHistory = pgTable("scan_history", {
  id: serial("id").primaryKey(),
  scanId: text("scan_id").notNull(),
  totalScanned: integer("total_scanned").default(0),
  candidatesFound: integer("candidates_found").default(0),
  alertsSent: integer("alerts_sent").default(0),
  source: text("source").default("scanner"), // "scanner" | "trading" | "turtle"
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: text("telegram_chat_id"),
  autoAlertEnabled: boolean("auto_alert_enabled").default(false),
  // Scanner settings
  rsiMin: real("rsi_min").default(40),
  rsiMax: real("rsi_max").default(80),
  minVolumeMoney: real("min_volume_money").default(30000000000), // 300억
  maFilterEnabled: boolean("ma_filter_enabled").default(true),
  // Trading engine settings
  tradingEnabled: boolean("trading_enabled").default(false),
  investmentPerStock: real("investment_per_stock").default(1000000),
  // Turtle settings
  turtleBreakoutPeriod: integer("turtle_breakout_period").default(20),
  turtleAtrPeriod: integer("turtle_atr_period").default(14),
  accountSize: real("account_size").default(10000000),
  riskPerTrade: real("risk_per_trade").default(0.02),
  // KIS API
  kisAppKey: text("kis_app_key"),
  kisAppSecret: text("kis_app_secret"),
  kisAccountNo: text("kis_account_no"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Turtle-specific: screening runs
export const screeningRuns = pgTable("screening_runs", {
  id: serial("id").primaryKey(),
  mode: text("mode").default("daily"), // "daily" | "5m"
  market: text("market").default("kospi"), // "kospi" | "kospi_kosdaq"
  inputParams: text("input_params"), // JSON string
  resultCount: integer("result_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const screeningResults = pgTable("screening_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  stockCode: text("stock_code").notNull(),
  stockName: text("stock_name").notNull(),
  market: text("market").notNull(),
  signal: text("signal"), // "BUY" | "SELL" | "SKIP"
  strategy: text("strategy"), // "turtle_breakout" | "momentum" | "breakout" | "reversal"
  price: real("price"),
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  confidence: real("confidence"),
  atr: real("atr"),
  rsi: real("rsi"),
  macd: real("macd"),
  entryTrigger: text("entry_trigger"),
  reasoning: text("reasoning"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Zod Schemas ─────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export const insertStockSchema = createInsertSchema(stocks).omit({ id: true });
export const insertScanResultSchema = createInsertSchema(scanResults).omit({ id: true, createdAt: true });
export const insertScanHistorySchema = createInsertSchema(scanHistory).omit({ id: true, createdAt: true });
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true, updatedAt: true });
export const insertScreeningRunSchema = createInsertSchema(screeningRuns).omit({ id: true, createdAt: true });
export const insertScreeningResultSchema = createInsertSchema(screeningResults).omit({ id: true, createdAt: true });

// ─── TypeScript Types ────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Stock = typeof stocks.$inferSelect;
export type InsertStock = z.infer<typeof insertStockSchema>;
export type ScanResult = typeof scanResults.$inferSelect;
export type InsertScanResult = z.infer<typeof insertScanResultSchema>;
export type ScanHistory = typeof scanHistory.$inferSelect;
export type InsertScanHistory = z.infer<typeof insertScanHistorySchema>;
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type ScreeningRun = typeof screeningRuns.$inferSelect;
export type ScreeningResult = typeof screeningResults.$inferSelect;

// ─── Market Types ────────────────────────────────────────────────

export type MarketType = "KOSPI" | "KOSDAQ" | "ETF" | "ETN";

export const MARKET_LABELS: Record<MarketType, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  ETF: "ETF",
  ETN: "ETN",
};

// ─── Sector Definitions ──────────────────────────────────────────

export const SECTOR_SEMICONDUCTOR = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "042700", name: "한미반도체" },
  { code: "403870", name: "HPSP" },
  { code: "035900", name: "JYP Ent." },
  { code: "005935", name: "삼성전자우" },
  { code: "034730", name: "SK" },
  { code: "006400", name: "삼성SDI" },
  { code: "066570", name: "LG전자" },
];

export const SECTOR_BATTERY = [
  { code: "373220", name: "LG에너지솔루션" },
  { code: "006400", name: "삼성SDI" },
  { code: "247540", name: "에코프로비엠" },
  { code: "086520", name: "에코프로" },
  { code: "003670", name: "포스코퓨처엠" },
  { code: "012450", name: "한화에어로스페이스" },
  { code: "051910", name: "LG화학" },
  { code: "068270", name: "셀트리온" },
];

// ─── Stock Quote (unified real-time data) ────────────────────────

export interface StockQuote {
  code: string;
  name: string;
  market: MarketType;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  volume: number;
  tradingValue: number;
  ma5: number;
  ma20: number;
  ma60: number;
  rsi: number;
  macd?: number;
  atr?: number;
  volumeRatio: number;
}

// ─── Trading Types (from kis-trading) ────────────────────────────

export interface TradeOrder {
  id: string;
  stockCode: string;
  stockName: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "pending" | "executed" | "failed";
  timestamp: string;
}

export interface TradingPosition {
  stockCode: string;
  stockName: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface TradingStatus {
  isRunning: boolean;
  mode: "auto" | "manual";
  lastScanTime: string | null;
  nextScanTime: string | null;
  positionCount: number;
  todayPnl: number;
}

export interface TradingLog {
  timestamp: string;
  type: "scan" | "buy" | "sell" | "alert" | "error";
  message: string;
  details?: string;
}

// ─── Signal Types (unified across all strategies) ────────────────

export type StrategyType =
  | "momentum"
  | "breakout"
  | "reversal"
  | "turtle_breakout";

export interface TradingSignal {
  id: string;
  strategy: StrategyType;
  stockCode: string;
  stockName: string;
  market: string;
  action: "BUY" | "SELL";
  price: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  reasoning: string;
  rsi?: number;
  volumeRatio?: number;
  atr?: number;
  status: "pending" | "confirmed" | "dismissed";
  timestamp: string;
}

export interface SignalConfig {
  enabled: boolean;
  strategies: {
    momentum: boolean;
    breakout: boolean;
    reversal: boolean;
    turtle: boolean;
  };
  telegramAlerts: boolean;
  maxSignalsPerStock: number;
  cooldownMinutes: number;
}

// ─── Turtle Playbook (from kospi-turtle) ─────────────────────────

export interface PlaybookData {
  signal: TradingSignal;
  strategy: {
    name: string;
    description: string;
    parameters: Record<string, number | string>;
  };
  entry: {
    trigger: string;
    price: number;
    confirmation: string[];
  };
  stopLoss: {
    price: number;
    method: string;
    atrMultiple?: number;
  };
  positionSizing: {
    accountSize: number;
    riskPerTrade: number;
    riskAmount: number;
    shareCount: number;
    positionValue: number;
  };
  exitRules: {
    profitTarget: number;
    trailingStop?: string;
    timeStop?: string;
  };
}

// ─── Screening Input Schema (from kospi-turtle) ─────────────────

export const screeningInputsSchema = z.object({
  market: z.enum(["kospi", "kospi_kosdaq"]).default("kospi_kosdaq"),
  mode: z.enum(["daily", "5m"]).default("daily"),
  // Liquidity
  minPrice: z.number().default(1000),
  minVolumeMoney: z.number().default(30000000000),
  // Breakout
  breakoutPeriod: z.number().default(20),
  breakoutConfirmVolume: z.number().default(1.5),
  // Indicators
  rsiPeriod: z.number().default(14),
  rsiOverbought: z.number().default(70),
  rsiOversold: z.number().default(30),
  macdFast: z.number().default(12),
  macdSlow: z.number().default(26),
  macdSignal: z.number().default(9),
  atrPeriod: z.number().default(14),
  // Risk
  accountSize: z.number().default(10000000),
  riskPerTrade: z.number().default(0.02),
});

export type ScreeningInputs = z.infer<typeof screeningInputsSchema>;
