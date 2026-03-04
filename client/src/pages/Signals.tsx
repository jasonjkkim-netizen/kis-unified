import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { formatNumber, formatTime } from "../lib/utils";

export default function Signals() {
  const [signals, setSignals] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSignals(); }, []);

  async function loadSignals() {
    setLoading(true);
    try {
      const s = await api.getSignals().catch(() => []);
      setSignals(s);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setScanning(true);
    try {
      const res = await api.runSignalScan();
      alert(`시그널 스캔 완료: ${res.count || 0}건 발견`);
      await loadSignals();
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleConfirm(id: string) {
    await api.confirmSignal(id);
    await loadSignals();
  }

  async function handleDismiss(id: string) {
    await api.dismissSignal(id);
    await loadSignals();
  }

  const strategyLabels: Record<string, string> = {
    momentum: "모멘텀",
    breakout: "돌파",
    reversal: "반전",
    turtle_breakout: "터틀",
  };

  const strategyColors: Record<string, string> = {
    momentum: "bg-purple-100 text-purple-700",
    breakout: "bg-orange-100 text-orange-700",
    reversal: "bg-green-100 text-green-700",
    turtle_breakout: "bg-teal-100 text-teal-700",
  };

  if (loading) return <div className="text-center py-20 text-gray-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">트레이딩 시그널</h2>
        <button
          onClick={runScan}
          disabled={scanning}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {scanning ? "스캔 중..." : "📡 시그널 스캔"}
        </button>
      </div>

      <div className="text-sm text-gray-500">
        4가지 전략: 모멘텀(MA정배열+RSI+거래량), 돌파(20일 신고가), 반전(RSI 과매도), 터틀(N일 브레이크아웃)
      </div>

      {signals.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border p-8 text-center text-gray-500">
          시그널이 없습니다. 스캔을 실행해 주세요.
        </div>
      ) : (
        <div className="space-y-4">
          {signals.map((s, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.action === "BUY" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                      {s.action}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${strategyColors[s.strategy] || "bg-gray-100"}`}>
                      {strategyLabels[s.strategy] || s.strategy}
                    </span>
                    <span className="font-bold text-lg">{s.stockName}</span>
                    <span className="text-gray-400 text-sm">{s.stockCode}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{s.reasoning}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{formatNumber(s.price)}원</div>
                  <div className="text-sm mt-1">
                    <span className="text-gray-500">신뢰도: </span>
                    <span className={`font-bold ${s.confidence >= 70 ? "text-green-600" : s.confidence >= 50 ? "text-yellow-600" : "text-gray-500"}`}>
                      {s.confidence}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mt-3 text-sm">
                <div><span className="text-gray-500">목표가:</span> <span className="text-red-500 font-medium">{formatNumber(s.targetPrice)}원</span></div>
                <div><span className="text-gray-500">손절가:</span> <span className="text-blue-500 font-medium">{formatNumber(s.stopLoss)}원</span></div>
                <div><span className="text-gray-500">RSI:</span> <span>{s.rsi?.toFixed(1) || "-"}</span></div>
                <div><span className="text-gray-500">상태:</span>
                  <span className={`ml-1 px-2 py-0.5 rounded text-xs ${
                    s.status === "confirmed" ? "bg-green-100 text-green-700" :
                    s.status === "dismissed" ? "bg-gray-100 text-gray-500" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {s.status === "confirmed" ? "확인됨" : s.status === "dismissed" ? "무시됨" : "대기중"}
                  </span>
                </div>
              </div>

              {s.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleConfirm(s.id)} className="px-3 py-1 rounded text-sm bg-green-100 text-green-700 hover:bg-green-200">
                    ✅ 확인
                  </button>
                  <button onClick={() => handleDismiss(s.id)} className="px-3 py-1 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200">
                    ❌ 무시
                  </button>
                </div>
              )}

              <div className="text-xs text-gray-400 mt-2">{formatTime(s.timestamp)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
