/**
 * KIS Unified - API Routes
 * Merges endpoints from: kis-stock-scanner, kis-trading, kospi-turtle
 */
import { Router, type Request, type Response } from "express";
import * as storage from "./storage";
import { KisApi, calculateMA, calculateRSI, calculateMACD, calculateATR } from "./kisApi";
import { TelegramService } from "./telegram";
import { SignalEngine } from "./signals";
import { TradingEngine } from "./tradingEngine";
import { AutoScanner } from "./autoScanner";
import type { TradingSignal, PlaybookData, ScreeningInputs, BiotechSector } from "../shared/schema";
import { screeningInputsSchema, BIOTECH_SECTORS, BIOTECH_SECTOR_LABELS } from "../shared/schema";

export function createRouter() {
  const router = Router();

  // Singletons (lazy init)
  let kisApi: KisApi | null = null;
  let telegram: TelegramService | null = null;
  let signalEngine: SignalEngine | null = null;
  let tradingEngine: TradingEngine | null = null;
  let autoScanner: AutoScanner | null = null;

  // ─── Init helpers ─────────────────────────────────────────────

  async function getKisApi(): Promise<KisApi> {
    if (!kisApi) kisApi = new KisApi();
    return kisApi;
  }

  async function getTelegram(): Promise<TelegramService> {
    if (!telegram) {
      const s = await storage.getSettings();
      telegram = new TelegramService(s?.telegramBotToken || "", s?.telegramChatId || "");
    }
    return telegram;
  }

  async function getSignalEngine(): Promise<SignalEngine> {
    if (!signalEngine) {
      const tg = await getTelegram();
      signalEngine = new SignalEngine(tg);
    }
    return signalEngine;
  }

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
      const api = await getKisApi();
      const price = await api.getStockPrice(req.params.code);
      res.json(price);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/stocks/:code/daily", async (req: Request, res: Response) => {
    try {
      const api = await getKisApi();
      const days = parseInt(req.query.days as string) || 60;
      const dailyData = await api.getDailyPrices(req.params.code, days);
      // calculate indicators
      const closes = dailyData.map((d: any) => d.close);
      const indicators = {
        ma5: calculateMA(closes, 5),
        ma20: calculateMA(closes, 20),
        ma60: calculateMA(closes, 60),
        rsi: calculateRSI(closes, 14),
        macd: calculateMACD(closes),
        atr: calculateATR(dailyData.map((d: any) => ({ high: d.high, low: d.low, close: d.close })), 14),
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
      const api = await getKisApi();
      const market = (req.query.market as string) || "KOSPI";
      const rankings = await api.getVolumeRanking(market);
      res.json(rankings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/rankings/all", async (req: Request, res: Response) => {
    try {
      const api = await getKisApi();
      const data = await api.getMarketVolumeRankings();
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
      if (!autoScanner) {
        const api = await getKisApi();
        const tg = await getTelegram();
        const sig = await getSignalEngine();
        autoScanner = new AutoScanner(api, tg, sig);
      }
      const results = await autoScanner.scanAndAlert();
      res.json({ success: true, count: results.length, results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/scan/auto/start", async (req: Request, res: Response) => {
    try {
      if (!autoScanner) {
        const api = await getKisApi();
        const tg = await getTelegram();
        const sig = await getSignalEngine();
        autoScanner = new AutoScanner(api, tg, sig);
      }
      const interval = parseInt(req.body?.interval) || 10;
      autoScanner.start(interval);
      res.json({ success: true, message: `Auto-scan started (${interval}min interval)` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/scan/auto/stop", async (_req: Request, res: Response) => {
    try {
      autoScanner?.stop();
      res.json({ success: true, message: "Auto-scan stopped" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/scan/auto/status", async (_req: Request, res: Response) => {
    res.json({ isRunning: autoScanner?.isRunning() || false });
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
      const engine = await getSignalEngine();
      res.json(engine.getSignals());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/signals/scan", async (_req: Request, res: Response) => {
    try {
      const api = await getKisApi();
      const engine = await getSignalEngine();
      // Scan KOSPI + KOSDAQ top volume stocks
      const allStocks = await api.getMarketVolumeRankings();
      const signals: TradingSignal[] = [];
      for (const stock of allStocks.slice(0, 30)) {
        try {
          const dailyData = await api.getDailyPrices(stock.code, 60);
          if (dailyData.length < 20) continue;
          const closes = dailyData.map((d: any) => d.close);
          const newSignals = engine.analyzeStock({
            code: stock.code,
            name: stock.name,
            market: stock.market || "KOSPI",
            price: stock.price,
            change: stock.change || 0,
            changePercent: stock.changePercent || 0,
            open: stock.open || stock.price,
            high: stock.high || stock.price,
            low: stock.low || stock.price,
            close: stock.close || stock.price,
            prevClose: stock.prevClose || stock.price,
            volume: stock.volume || 0,
            tradingValue: stock.tradingValue || 0,
            ma5: calculateMA(closes, 5),
            ma20: calculateMA(closes, 20),
            ma60: calculateMA(closes, 60),
            rsi: calculateRSI(closes, 14),
            macd: calculateMACD(closes).macd,
            atr: calculateATR(dailyData.map((d: any) => ({ high: d.high, low: d.low, close: d.close })), 14),
            volumeRatio: stock.volume && dailyData.length > 5 ?
              stock.volume / (dailyData.slice(0, 5).reduce((s: number, d: any) => s + d.volume, 0) / 5) : 1,
          });
          signals.push(...newSignals);
        } catch { /* skip failed stocks */ }
      }
      res.json({ success: true, count: signals.length, signals });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/signals/:id/confirm", async (req: Request, res: Response) => {
    try {
      const engine = await getSignalEngine();
      engine.confirmSignal(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/signals/:id/dismiss", async (req: Request, res: Response) => {
    try {
      const engine = await getSignalEngine();
      engine.dismissSignal(req.params.id);
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
      if (!tradingEngine) {
        const api = await getKisApi();
        const tg = await getTelegram();
        const sig = await getSignalEngine();
        tradingEngine = new TradingEngine(api, tg, sig);
      }
      tradingEngine.start();
      res.json({ success: true, message: "Trading engine started" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/trading/stop", async (_req: Request, res: Response) => {
    try {
      tradingEngine?.stop();
      res.json({ success: true, message: "Trading engine stopped" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/trading/status", async (_req: Request, res: Response) => {
    try {
      if (!tradingEngine) {
        return res.json({
          isRunning: false, mode: "manual", lastScanTime: null,
          nextScanTime: null, positionCount: 0, todayPnl: 0,
        });
      }
      res.json(tradingEngine.getStatus());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/trading/positions", async (_req: Request, res: Response) => {
    try {
      res.json(tradingEngine?.getPositions() || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/trading/orders", async (_req: Request, res: Response) => {
    try {
      res.json(tradingEngine?.getOrders() || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/trading/logs", async (_req: Request, res: Response) => {
    try {
      res.json(tradingEngine?.getLogs() || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/trading/scan", async (_req: Request, res: Response) => {
    try {
      if (!tradingEngine) return res.status(400).json({ error: "Trading engine not initialized" });
      const results = await tradingEngine.manualScan();
      res.json({ success: true, results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/trading/buy", async (req: Request, res: Response) => {
    try {
      if (!tradingEngine) return res.status(400).json({ error: "Trading engine not initialized" });
      const { stockCode, stockName, price, quantity } = req.body;
      const order = await tradingEngine.manualBuy(stockCode, stockName, price, quantity);
      res.json({ success: true, order });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/trading/sell-all", async (_req: Request, res: Response) => {
    try {
      if (!tradingEngine) return res.status(400).json({ error: "Trading engine not initialized" });
      const results = await tradingEngine.sellAll();
      res.json({ success: true, results });
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

      const api = await getKisApi();
      const rankings = await api.getMarketVolumeRankings();

      // Filter by market
      let candidates = rankings;
      if (inputs.market === "kospi") {
        candidates = rankings.filter((s: any) => s.market === "KOSPI");
      }

      // Filter by liquidity
      candidates = candidates.filter((s: any) =>
        (s.price || 0) >= inputs.minPrice &&
        (s.tradingValue || 0) >= inputs.minVolumeMoney
      );

      const results: any[] = [];

      for (const stock of candidates.slice(0, 50)) {
        try {
          const dailyData = await api.getDailyPrices(stock.code, 60);
          if (dailyData.length < inputs.breakoutPeriod) continue;

          const closes = dailyData.map((d: any) => d.close);
          const highs = dailyData.map((d: any) => d.high);
          const lows = dailyData.map((d: any) => d.low);

          const rsi = calculateRSI(closes, inputs.rsiPeriod);
          const macdResult = calculateMACD(closes, inputs.macdFast, inputs.macdSlow, inputs.macdSignal);
          const atr = calculateATR(
            dailyData.map((d: any) => ({ high: d.high, low: d.low, close: d.close })),
            inputs.atrPeriod
          );

          // Breakout detection
          const recentHighs = highs.slice(0, inputs.breakoutPeriod);
          const recentLows = lows.slice(0, inputs.breakoutPeriod);
          const highestHigh = Math.max(...recentHighs);
          const lowestLow = Math.min(...recentLows);

          let signal: "BUY" | "SELL" | "SKIP" = "SKIP";
          let strategy = "turtle_breakout";
          let confidence = 50;
          let reasoning = "";
          let entryTrigger = "";

          const currentPrice = stock.price || closes[0];

          // Buy signal: price breaks above N-day high
          if (currentPrice >= highestHigh * 0.98) {
            signal = "BUY";
            entryTrigger = `${inputs.breakoutPeriod}일 신고가 돌파 (${highestHigh.toLocaleString()}원)`;
            confidence = 55;
            reasoning = `터틀 브레이크아웃: 현재가 ${currentPrice.toLocaleString()}원이 ${inputs.breakoutPeriod}일 최고가 ${highestHigh.toLocaleString()}원 부근`;

            if (rsi > inputs.rsiOversold && rsi < inputs.rsiOverbought) confidence += 10;
            if (macdResult.macd > macdResult.signal) confidence += 10;
            if (stock.volume > (dailyData.slice(0, 5).reduce((s: number, d: any) => s + d.volume, 0) / 5) * inputs.breakoutConfirmVolume) {
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
              stockCode: stock.code,
              stockName: stock.name,
              market: stock.market || "KOSPI",
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
      const tg = await getTelegram();
      const ok = await tg.sendMessage("✅ KIS 통합 시스템 텔레그램 연결 테스트 성공!");
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/telegram/detect-chat", async (_req: Request, res: Response) => {
    try {
      const tg = await getTelegram();
      const chatId = await tg.detectChatId();
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
      const tg = await getTelegram();
      const ok = await tg.sendMessage(message);
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
        // Mask sensitive data
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
      // Reset singletons so they pick up new settings
      telegram = null;
      signalEngine = null;
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
      const api = await getKisApi();
      const ok = await api.checkConnection();
      res.json({ connected: ok });
    } catch (e: any) {
      res.json({ connected: false, error: e.message });
    }
  });

  router.get("/api/kis/balance", async (_req: Request, res: Response) => {
    try {
      const api = await getKisApi();
      const balance = await api.getAccountBalance();
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

  // ═══════════════════════════════════════════════════════════════
  // Biotech Dashboard
  // ═══════════════════════════════════════════════════════════════

  router.get("/api/biotech/sectors", (_req: Request, res: Response) => {
    res.json(BIOTECH_SECTOR_LABELS);
  });

  router.get("/api/biotech/stocks", async (req: Request, res: Response) => {
    try {
      const sector = req.query.sector as BiotechSector | undefined;
      const sectors = sector ? { [sector]: BIOTECH_SECTORS[sector] } : BIOTECH_SECTORS;

      // Collect unique stock codes across requested sectors
      const stockMap = new Map<string, { code: string; name: string; sectors: string[] }>();
      for (const [sectorKey, stocks] of Object.entries(sectors)) {
        if (!stocks) continue;
        for (const s of stocks) {
          const existing = stockMap.get(s.code);
          if (existing) {
            existing.sectors.push(sectorKey);
          } else {
            stockMap.set(s.code, { code: s.code, name: s.name, sectors: [sectorKey] });
          }
        }
      }

      const results: any[] = [];
      const api = await getKisApi();
      for (const [code, info] of stockMap) {
        try {
          const price = await api.getStockPrice(code);
          if (price) {
            results.push({
              code: info.code,
              name: info.name,
              sectors: info.sectors,
              price: Number(price.stck_prpr) || 0,
              change: Number(price.prdy_vrss) || 0,
              changePercent: Number(price.prdy_ctrt) || 0,
              volume: Number(price.acml_vol) || 0,
              tradingValue: Number(price.acml_tr_pbmn) || 0,
              high: Number(price.stck_hgpr) || 0,
              low: Number(price.stck_lwpr) || 0,
              open: Number(price.stck_oprc) || 0,
              marketCap: Number(price.hts_avls) || 0,
              per: Number(price.per) || 0,
              pbr: Number(price.pbr) || 0,
              high52w: Number(price.stck_dryy_hgpr) || 0,
              low52w: Number(price.stck_dryy_lwpr) || 0,
            });
          }
        } catch {
          // Skip stocks that fail to fetch
        }
      }

      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
