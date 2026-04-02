/**
 * KIS Unified - API Routes
 * Merges endpoints from: kis-stock-scanner, kis-trading, kospi-turtle
 */
import { Router, type Request, type Response } from "express";
import * as storage from "./storage";
import {
  getStockPrice,
  getDailyPrices as kisGetDailyPrices,
  getVolumeRanking,
  getMarketVolumeRankings,
  getAccountBalance,
  checkConnection,
  calculateMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
} from "./kisApi";
import {
  getTelegramConfig,
  sendTelegramMessage,
  sendAlert,
  autoDetectChatId,
} from "./telegram";
import {
  getActiveSignals,
  runSignalScan,
  confirmSignal,
  dismissSignal,
} from "./signals";
import {
  startAutoTrading,
  stopAutoTrading,
  getTradingStatus,
  getTradingLogs,
  getTradeOrders,
  getTradingPositions,
  manualScan,
  manualSellAll,
  manualBuy,
} from "./tradingEngine";
import {
  scanAndAlert,
  startAutoScan,
  stopAutoScan,
  getAutoScanStatus,
} from "./autoScanner";
import type { TradingSignal, PlaybookData, ScreeningInputs } from "../shared/schema";
import { screeningInputsSchema } from "../shared/schema";

function extractPriceSeries(dailyData: any[]) {
  return {
    closes: dailyData.map((d: any) => Number(d.stck_clpr)).filter(Boolean),
    highs: dailyData.map((d: any) => Number(d.stck_hgpr)).filter(Boolean),
    lows: dailyData.map((d: any) => Number(d.stck_lwpr)).filter(Boolean),
    volumes: dailyData.map((d: any) => Number(d.acml_vol)).filter(Boolean),
  };
}

export function createRouter() {
  const router = Router();

  // ═══════════════════════════════════════════════════════════════
  // Dashboard / Stats
  // ═══════════════════════════════════════════════════════════════

  router.get("/api/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Stocks
  // ═══════════════════════════════════════════════════════════════

  router.get("/api/stocks", async (req: Request, res: Response) => {
    try {
      const market = req.query.market as string | undefined;
      const list = await storage.getStocks(market);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/stocks/:code", async (req: Request, res: Response) => {
    try {
      const stock = await storage.getStockByCode(req.params.code);
      if (!stock) return res.status(404).json({ error: "Stock not found" });
      res.json(stock);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/stocks/:code/price", async (req: Request, res: Response) => {
    try {
      const price = await getStockPrice(req.params.code);
      res.json(price);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/stocks/:code/daily", async (req: Request, res: Response) => {
    try {
      const dailyData = await kisGetDailyPrices(req.params.code);
      const { closes, highs, lows } = extractPriceSeries(dailyData);
      const indicators = {
        ma5: calculateMA(closes, 5),
        ma20: calculateMA(closes, 20),
        ma60: calculateMA(closes, 60),
        rsi: calculateRSI(closes, 14),
        macd: calculateMACD(closes),
        atr: calculateATR(highs, lows, closes, 14),
      };
      res.json({ daily: dailyData, indicators });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Market Rankings
  // ═══════════════════════════════════════════════════════════════

  router.get("/api/rankings/volume", async (req: Request, res: Response) => {
    try {
      const market = (req.query.market as string) || "J";
      const rankings = await getVolumeRanking(market);
      res.json(rankings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/rankings/all", async (req: Request, res: Response) => {
    try {
      const data = await getMarketVolumeRankings();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Scanner
  // ═══════════════════════════════════════════════════════════════

  router.post("/api/scan/run", async (_req: Request, res: Response) => {
    try {
      await scanAndAlert();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/scan/auto/start", async (req: Request, res: Response) => {
    try {
      const interval = parseInt(req.body?.interval) || 10;
      startAutoScan(interval);
      res.json({ success: true, message: `Auto-scan started (${interval}min interval)` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/scan/auto/stop", async (_req: Request, res: Response) => {
    try {
      stopAutoScan();
      res.json({ success: true, message: "Auto-scan stopped" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/scan/auto/status", async (_req: Request, res: Response) => {
    res.json(getAutoScanStatus());
  });

  router.get("/api/scan/results", async (req: Request, res: Response) => {
    try {
      const scanId = req.query.scanId as string | undefined;
      const source = req.query.source as string | undefined;
      const results = await storage.getScanResults(scanId, source);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/scan/history", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const source = req.query.source as string | undefined;
      const history = await storage.getScanHistoryList(limit, source);
      res.json(history);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Signals
  // ═══════════════════════════════════════════════════════════════

  router.get("/api/signals", async (_req: Request, res: Response) => {
    try {
      res.json(getActiveSignals());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/signals/scan", async (_req: Request, res: Response) => {
    try {
      const allStocks = await getMarketVolumeRankings();
      const stockQuotes: any[] = [];
      for (const stock of allStocks.slice(0, 30)) {
        try {
          const code = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
          if (!code) continue;
          const dailyData = await kisGetDailyPrices(code);
          if (dailyData.length < 20) continue;
          const { closes, highs, lows } = extractPriceSeries(dailyData);
          stockQuotes.push({
            code,
            name: stock.hts_kor_isnm || "",
            market: stock._market || "KOSPI",
            price: Number(stock.stck_prpr) || 0,
            change: Number(stock.prdy_vrss) || 0,
            changePercent: Number(stock.prdy_ctrt) || 0,
            volume: Number(stock.acml_vol) || 0,
            tradingValue: Number(stock.acml_tr_pbmn) || 0,
            ma5: calculateMA(closes, 5),
            ma20: calculateMA(closes, 20),
            ma60: calculateMA(closes, 60),
            rsi: calculateRSI(closes, 14),
            macd: calculateMACD(closes).macd,
            atr: calculateATR(highs, lows, closes, 14),
            volumeRatio: Number(stock.prdy_vol) > 0 ?
              Number(stock.acml_vol) / Number(stock.prdy_vol) : 1,
          });
        } catch { /* skip failed stocks */ }
      }
      const signals = await runSignalScan(stockQuotes, true);
      res.json({ success: true, count: signals.length, signals });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/signals/:id/confirm", async (req: Request, res: Response) => {
    try {
      confirmSignal(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/signals/:id/dismiss", async (req: Request, res: Response) => {
    try {
      dismissSignal(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Trading Engine
  // ═══════════════════════════════════════════════════════════════

  router.post("/api/trading/start", async (_req: Request, res: Response) => {
    try {
      startAutoTrading();
      res.json({ success: true, message: "Trading engine started" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/trading/stop", async (_req: Request, res: Response) => {
    try {
      stopAutoTrading();
      res.json({ success: true, message: "Trading engine stopped" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/trading/status", async (_req: Request, res: Response) => {
    try {
      res.json(getTradingStatus());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/trading/positions", async (_req: Request, res: Response) => {
    try {
      res.json(getTradingPositions());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/trading/orders", async (_req: Request, res: Response) => {
    try {
      res.json(getTradeOrders());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/trading/logs", async (_req: Request, res: Response) => {
    try {
      res.json(getTradingLogs());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/trading/scan", async (_req: Request, res: Response) => {
    try {
      await manualScan();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/trading/buy", async (req: Request, res: Response) => {
    try {
      const { stockCode, stockName, price } = req.body;
      await manualBuy([{
        code: stockCode,
        name: stockName,
        price: Number(price),
        change: 0,
        changePercent: 0,
        volume: 0,
        tradingValue: 0,
        prevVolume: 0,
        high: Number(price),
        ma5: 0,
        ma20: 0,
        ma60: 0,
      }]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/trading/sell-all", async (_req: Request, res: Response) => {
    try {
      await manualSellAll();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Turtle Screening
  // ═══════════════════════════════════════════════════════════════

  router.post("/api/screen", async (req: Request, res: Response) => {
    try {
      const parsed = screeningInputsSchema.safeParse(req.body);
      const inputs: ScreeningInputs = parsed.success ? parsed.data : screeningInputsSchema.parse({});

      const rankings = await getMarketVolumeRankings();

      // Filter by market
      let candidates = rankings;
      if (inputs.market === "kospi") {
        candidates = rankings.filter((s: any) => (s._market || "KOSPI") === "KOSPI");
      }

      // Filter by liquidity
      candidates = candidates.filter((s: any) => {
        const price = Number(s.stck_prpr) || 0;
        const tradingValue = Number(s.acml_tr_pbmn) || 0;
        return price >= inputs.minPrice && tradingValue >= inputs.minVolumeMoney;
      });

      const results: any[] = [];

      for (const stock of candidates.slice(0, 50)) {
        try {
          const code = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
          if (!code) continue;
          const dailyData = await kisGetDailyPrices(code);
          if (dailyData.length < inputs.breakoutPeriod) continue;

          const { closes, highs, lows, volumes } = extractPriceSeries(dailyData);

          const rsi = calculateRSI(closes, inputs.rsiPeriod);
          const macdResult = calculateMACD(closes, inputs.macdFast, inputs.macdSlow, inputs.macdSignal);
          const atr = calculateATR(highs, lows, closes, inputs.atrPeriod);

          // Breakout detection
          const recentHighs = highs.slice(0, inputs.breakoutPeriod);
          const recentLows = lows.slice(0, inputs.breakoutPeriod);
          const highestHigh = Math.max(...recentHighs);
          const lowestLow = Math.min(...recentLows);

          let signal: "BUY" | "SELL" | "SKIP" = "SKIP";
          const strategy = "turtle_breakout";
          let confidence = 50;
          let reasoning = "";
          let entryTrigger = "";

          const currentPrice = Number(stock.stck_prpr) || closes[0];
          const currentVolume = Number(stock.acml_vol) || 0;

          // Buy signal: price breaks above N-day high
          if (currentPrice >= highestHigh * 0.98) {
            signal = "BUY";
            entryTrigger = `${inputs.breakoutPeriod}일 신고가 돌파 (${highestHigh.toLocaleString()}원)`;
            confidence = 55;
            reasoning = `터틀 브레이크아웃: 현재가 ${currentPrice.toLocaleString()}원이 ${inputs.breakoutPeriod}일 최고가 ${highestHigh.toLocaleString()}원 부근`;

            if (rsi > inputs.rsiOversold && rsi < inputs.rsiOverbought) confidence += 10;
            if (macdResult.macd > macdResult.signal) confidence += 10;
            const avgVolume5 = volumes.slice(0, 5).reduce((s, v) => s + v, 0) / 5;
            if (currentVolume > avgVolume5 * inputs.breakoutConfirmVolume) {
              confidence += 15;
              reasoning += ` | 거래량 확인 완료`;
            }
          }
          // Sell signal: price breaks below N-day low
          else if (currentPrice <= lowestLow * 1.02) {
            signal = "SELL";
            entryTrigger = `${inputs.breakoutPeriod}일 신저가 이탈 (${lowestLow.toLocaleString()}원)`;
            confidence = 55;
            reasoning = `하향 돌파: 현재가 ${currentPrice.toLocaleString()}원이 ${inputs.breakoutPeriod}일 최저가 ${lowestLow.toLocaleString()}원 부근`;
          }

          if (signal !== "SKIP") {
            const stopLoss = signal === "BUY" ? currentPrice - atr * 2 : currentPrice + atr * 2;
            const targetPrice = signal === "BUY" ? currentPrice + atr * 4 : currentPrice - atr * 4;

            results.push({
              stockCode: code,
              stockName: stock.hts_kor_isnm || "",
              market: stock._market || "KOSPI",
              signal,
              strategy,
              price: currentPrice,
              targetPrice,
              stopLoss,
              confidence: Math.min(confidence, 85),
              atr,
              rsi,
              macd: macdResult.macd,
              entryTrigger,
              reasoning,
            });
          }
        } catch { /* skip */ }
      }

      // Sort by confidence
      results.sort((a, b) => b.confidence - a.confidence);

      // Save to DB
      const run = await storage.createScreeningRun({
        mode: inputs.mode,
        market: inputs.market,
        inputParams: JSON.stringify(inputs),
        resultCount: results.length,
      });

      if (results.length > 0) {
        await storage.createScreeningResults(results.map(r => ({ ...r, runId: run.id })));
      }

      res.json({ runId: run.id, count: results.length, results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/screen/history", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const runs = await storage.getScreeningRuns(limit);
      res.json(runs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/screen/results/:runId", async (req: Request, res: Response) => {
    try {
      const runId = parseInt(req.params.runId);
      const results = await storage.getScreeningResults(runId);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/screen/results", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const results = await storage.getLatestScreeningResults(limit);
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Playbook (Turtle)
  // ═══════════════════════════════════════════════════════════════

  router.post("/api/playbook", async (req: Request, res: Response) => {
    try {
      const { signal } = req.body;
      if (!signal) return res.status(400).json({ error: "Signal required" });

      const s = await storage.getSettings();
      const accountSize = s?.accountSize || 10000000;
      const riskPerTrade = s?.riskPerTrade || 0.02;

      const atr = signal.atr || (signal.price * 0.02);
      const riskAmount = accountSize * riskPerTrade;
      const shareCount = Math.floor(riskAmount / (atr * 2));
      const positionValue = shareCount * signal.price;

      const playbook: PlaybookData = {
        signal,
        strategy: {
          name: signal.strategy || "turtle_breakout",
          description: "터틀 트레이딩 브레이크아웃 전략",
          parameters: {
            breakoutPeriod: 20,
            atrPeriod: 14,
            atrStopMultiple: 2,
          },
        },
        entry: {
          trigger: signal.entryTrigger || "N-day breakout",
          price: signal.price,
          confirmation: [
            `RSI: ${signal.rsi?.toFixed(1) || 'N/A'}`,
            `ATR: ${atr.toFixed(0)}원`,
            `거래량 확인`,
          ],
        },
        stopLoss: {
          price: signal.stopLoss || signal.price - atr * 2,
          method: "ATR × 2",
          atrMultiple: 2,
        },
        positionSizing: {
          accountSize,
          riskPerTrade,
          riskAmount,
          shareCount,
          positionValue,
        },
        exitRules: {
          profitTarget: signal.targetPrice || signal.price + atr * 4,
          trailingStop: "ATR × 2 trailing",
          timeStop: "20일 후 재평가",
        },
      };

      res.json(playbook);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Telegram
  // ═══════════════════════════════════════════════════════════════

  router.post("/api/telegram/test", async (_req: Request, res: Response) => {
    try {
      const config = await getTelegramConfig();
      if (!config) return res.status(400).json({ error: "Telegram not configured" });
      const ok = await sendTelegramMessage(config.token, config.chatId, "✅ KIS 통합 시스템 텔레그램 연결 테스트 성공!");
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/telegram/detect-chat", async (_req: Request, res: Response) => {
    try {
      const s = await storage.getSettings();
      const token = s?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
      if (!token) return res.status(400).json({ error: "Bot token not configured" });
      const chatId = await autoDetectChatId(token);
      if (chatId) {
        await storage.upsertSettings({ telegramChatId: chatId });
        res.json({ success: true, chatId });
      } else {
        res.json({ success: false, message: "No messages found. Send a message to the bot first." });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/telegram/alert", async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Message required" });
      const ok = await sendAlert(message);
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Settings
  // ═══════════════════════════════════════════════════════════════

  router.get("/api/settings", async (_req: Request, res: Response) => {
    try {
      const s = await storage.getSettings();
      if (s) {
        const masked = {
          ...s,
          telegramBotToken: s.telegramBotToken ? "***설정됨***" : "",
          kisAppKey: s.kisAppKey ? "***설정됨***" : "",
          kisAppSecret: s.kisAppSecret ? "***설정됨***" : "",
        };
        res.json(masked);
      } else {
        res.json(null);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/settings", async (req: Request, res: Response) => {
    try {
      const updated = await storage.upsertSettings(req.body);
      res.json({ success: true, settings: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // KIS API Connection
  // ═══════════════════════════════════════════════════════════════

  router.get("/api/kis/status", async (_req: Request, res: Response) => {
    try {
      const result = await checkConnection();
      res.json({ connected: result.success, message: result.message });
    } catch (e: any) {
      res.json({ connected: false, error: e.message });
    }
  });

  router.get("/api/kis/balance", async (_req: Request, res: Response) => {
    try {
      const balance = await getAccountBalance();
      res.json(balance);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // CSV Export (from kospi-turtle)
  // ═══════════════════════════════════════════════════════════════

  router.get("/api/export/csv/:runId", async (req: Request, res: Response) => {
    try {
      const runId = parseInt(req.params.runId);
      const results = await storage.getScreeningResults(runId);

      const headers = ["종목코드", "종목명", "시장", "시그널", "전략", "현재가", "목표가", "손절가", "신뢰도", "ATR", "RSI"];
      const rows = results.map(r => [
        r.stockCode, r.stockName, r.market, r.signal, r.strategy,
        r.price, r.targetPrice, r.stopLoss, r.confidence, r.atr, r.rsi
      ].join(","));

      const csv = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=screening_${runId}.csv`);
      res.send("\uFEFF" + csv); // BOM for Korean
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
