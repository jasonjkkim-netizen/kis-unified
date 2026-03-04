import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { formatNumber, formatMoney, formatTime } from "../lib/utils";

export default function Scanner() {
  const [results, setResults] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [autoStatus, setAutoStatus] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [r, h, s] = await Promise.all([
        api.getScanResults().catch(() => []),
        api.getScanHistory().catch(() => []),
        api.getAutoScanStatus().catch(() => ({ isRunning: false })),
      ]);
      setResults(r);
      setHistory(h);
      setAutoStatus(s.isRunning);
    } finally {
      setLoading(false);
    }
  }

  async function runManualScan() {
    setScanning(true);
    try {
      await api.runScan();
      await loadData();
    } catch (e: any) {
      alert("스캔 실패: " + e.message);
    } finally {
      setScanning(false);
    }
  }

  async function toggleAutoScan() {
    try {
      if (autoStatus) {
        await api.stopAutoScan();
        setAutoStatus(false);
      } else {
        await api.startAutoScan(10);
        setAutoStatus(true);
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">스캐너</h2>
        <div className="flex gap-2">
          <button
            onClick={toggleAutoScan}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              autoStatus
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {autoStatus ? "⏸ 자동스캔 중지" : "▶️ 자동스캔 시작"}
          </button>
          <button
            onClick={runManualScan}
            disabled={scanning}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {scanning ? "스캔 중..." : "🔍 수동 스캔"}
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full ${autoStatus ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
        <span>자동 스캔: {autoStatus ? "실행 중 (10분 간격)" : "중지됨"}</span>
      </div>

      {/* Results */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">스캔 결과 ({results.length}건)</h3>
        {results.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">결과가 없습니다. 스캔을 실행해 주세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">종목</th>
                  <th className="pb-2">시장</th>
                  <th className="pb-2 text-right">현재가</th>
                  <th className="pb-2 text-right">등락률</th>
                  <th className="pb-2 text-right">거래대금</th>
                  <th className="pb-2 text-right">RSI</th>
                  <th className="pb-2">MA정배열</th>
                  <th className="pb-2">알림</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2 font-medium">{r.stockName} <span className="text-gray-400 text-xs">{r.stockCode}</span></td>
                    <td className="py-2">{r.market}</td>
                    <td className="py-2 text-right">{formatNumber(r.price)}</td>
                    <td className={`py-2 text-right ${(r.changePercent || 0) > 0 ? "text-red-500" : "text-blue-500"}`}>
                      {r.changePercent ? `${r.changePercent > 0 ? "+" : ""}${r.changePercent.toFixed(2)}%` : "-"}
                    </td>
                    <td className="py-2 text-right">{formatMoney(r.tradingValue)}</td>
                    <td className="py-2 text-right">{r.rsi ? r.rsi.toFixed(1) : "-"}</td>
                    <td className="py-2">{r.maAligned ? "✅" : "❌"}</td>
                    <td className="py-2">{r.alertSent ? "📨" : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">스캔 이력</h3>
        <div className="space-y-2">
          {history.slice(0, 10).map((h, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800">
              <div>
                <span className="font-medium">{h.scanId}</span>
                <span className="text-gray-400 ml-2">{h.source}</span>
              </div>
              <div className="flex gap-4 text-gray-600">
                <span>스캔: {h.totalScanned}건</span>
                <span>후보: {h.candidatesFound}건</span>
                <span>알림: {h.alertsSent}건</span>
                <span className="text-gray-400">{formatTime(h.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
