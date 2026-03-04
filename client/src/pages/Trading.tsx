import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { formatNumber, formatMoney, formatTime } from "../lib/utils";

export default function Trading() {
  const [status, setStatus] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [s, p, o, l] = await Promise.all([
        api.getTradingStatus().catch(() => null),
        api.getPositions().catch(() => []),
        api.getOrders().catch(() => []),
        api.getLogs().catch(() => []),
      ]);
      setStatus(s);
      setPositions(p);
      setOrders(o);
      setLogs(l);
    } finally {
      setLoading(false);
    }
  }

  async function toggleEngine() {
    try {
      if (status?.isRunning) {
        await api.stopTrading();
      } else {
        await api.startTrading();
      }
      await loadData();
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  }

  async function doScan() {
    try {
      const res = await api.manualScan();
      alert(`스캔 완료: ${res.results?.length || 0}건`);
      await loadData();
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  }

  async function doSellAll() {
    if (!confirm("전 포지션 청산하시겠습니까?")) return;
    try {
      await api.sellAll();
      await loadData();
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">자동매매 엔진</h2>
        <div className="flex gap-2">
          <button onClick={doScan} className="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200">
            🔍 수동 스캔
          </button>
          <button onClick={doSellAll} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200">
            💰 전량 매도
          </button>
          <button onClick={toggleEngine} className={`px-4 py-2 rounded-lg text-sm font-medium ${
            status?.isRunning ? "bg-red-600 text-white" : "bg-green-600 text-white"
          }`}>
            {status?.isRunning ? "⏸ 엔진 중지" : "▶️ 엔진 시작"}
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">엔진 상태</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">상태:</span>
            <span className={`ml-2 font-medium ${status?.isRunning ? "text-green-600" : "text-gray-500"}`}>
              {status?.isRunning ? "🟢 실행 중" : "⚪ 중지"}
            </span>
          </div>
          <div><span className="text-gray-500">모드:</span> <span className="ml-2">{status?.mode || "manual"}</span></div>
          <div><span className="text-gray-500">포지션:</span> <span className="ml-2">{status?.positionCount || 0}개</span></div>
          <div><span className="text-gray-500">오늘 손익:</span>
            <span className={`ml-2 font-medium ${(status?.todayPnl || 0) >= 0 ? "text-red-500" : "text-blue-500"}`}>
              {formatNumber(status?.todayPnl || 0)}원
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          마지막 스캔: {formatTime(status?.lastScanTime)} | 다음 스캔: {formatTime(status?.nextScanTime)}
        </div>
        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-500">
          스케줄: 15:15 스캔 → 15:20 매수 → 09:05 전량매도 (KST)
        </div>
      </div>

      {/* Positions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">보유 포지션 ({positions.length})</h3>
        {positions.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">보유 포지션이 없습니다</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2">종목</th>
                <th className="pb-2 text-right">수량</th>
                <th className="pb-2 text-right">평균가</th>
                <th className="pb-2 text-right">현재가</th>
                <th className="pb-2 text-right">손익</th>
                <th className="pb-2 text-right">수익률</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 font-medium">{p.stockName} <span className="text-gray-400 text-xs">{p.stockCode}</span></td>
                  <td className="py-2 text-right">{formatNumber(p.quantity)}</td>
                  <td className="py-2 text-right">{formatNumber(p.avgPrice)}</td>
                  <td className="py-2 text-right">{formatNumber(p.currentPrice)}</td>
                  <td className={`py-2 text-right font-medium ${p.pnl >= 0 ? "text-red-500" : "text-blue-500"}`}>
                    {formatNumber(p.pnl)}원
                  </td>
                  <td className={`py-2 text-right ${p.pnlPercent >= 0 ? "text-red-500" : "text-blue-500"}`}>
                    {p.pnlPercent >= 0 ? "+" : ""}{p.pnlPercent?.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Orders + Logs side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Orders */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
          <h3 className="font-semibold mb-3">주문 내역</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {orders.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">주문 내역 없음</p>
            ) : orders.slice(0, 20).map((o, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-1 border-b border-gray-100">
                <div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${o.type === "BUY" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                    {o.type}
                  </span>
                  <span className="ml-2">{o.stockName}</span>
                </div>
                <span className="text-gray-500 text-xs">{formatNumber(o.price)}원 × {o.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logs */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
          <h3 className="font-semibold mb-3">실행 로그</h3>
          <div className="space-y-1 max-h-60 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center font-sans">로그 없음</p>
            ) : logs.slice(0, 30).map((l, i) => (
              <div key={i} className={`py-1 ${l.type === "error" ? "text-red-500" : l.type === "buy" ? "text-red-400" : l.type === "sell" ? "text-blue-400" : "text-gray-600"}`}>
                [{formatTime(l.timestamp)}] [{l.type}] {l.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
