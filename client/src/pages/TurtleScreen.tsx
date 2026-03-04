import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { formatNumber, formatTime } from "../lib/utils";

export default function TurtleScreen() {
  const [results, setResults] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [playbook, setPlaybook] = useState<any>(null);
  const [screening, setScreening] = useState(false);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState("kospi_kosdaq");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([
        api.getLatestScreenResults().catch(() => []),
        api.getScreenHistory().catch(() => []),
      ]);
      setResults(r);
      setHistory(h);
    } finally {
      setLoading(false);
    }
  }

  async function runScreen() {
    setScreening(true);
    try {
      const res = await api.runScreen({ market, mode: "daily" });
      setResults(res.results || []);
      alert(`스크리닝 완료: ${res.count || 0}건`);
      await loadData();
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setScreening(false);
    }
  }

  async function showPlaybook(signal: any) {
    try {
      const pb = await api.getPlaybook(signal);
      setPlaybook(pb);
    } catch (e: any) {
      alert("플레이북 생성 실패: " + e.message);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">🐢 터틀 스크리닝</h2>
        <div className="flex gap-2 items-center">
          <select
            value={market}
            onChange={e => setMarket(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm"
          >
            <option value="kospi_kosdaq">코스피+코스닥</option>
            <option value="kospi">코스피만</option>
          </select>
          <button
            onClick={runScreen}
            disabled={screening}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {screening ? "스크리닝 중..." : "🐢 스크리닝 실행"}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">스크리닝 결과 ({results.length}건)</h3>
        {results.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">결과가 없습니다. 스크리닝을 실행해 주세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">종목</th>
                  <th className="pb-2">시그널</th>
                  <th className="pb-2 text-right">현재가</th>
                  <th className="pb-2 text-right">목표가</th>
                  <th className="pb-2 text-right">손절가</th>
                  <th className="pb-2 text-right">신뢰도</th>
                  <th className="pb-2 text-right">RSI</th>
                  <th className="pb-2 text-right">ATR</th>
                  <th className="pb-2">액션</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2 font-medium">{r.stockName} <span className="text-gray-400 text-xs">{r.stockCode}</span></td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.signal === "BUY" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {r.signal}
                      </span>
                    </td>
                    <td className="py-2 text-right">{formatNumber(r.price)}</td>
                    <td className="py-2 text-right text-red-500">{formatNumber(r.targetPrice)}</td>
                    <td className="py-2 text-right text-blue-500">{formatNumber(r.stopLoss)}</td>
                    <td className="py-2 text-right">
                      <span className={`font-medium ${r.confidence >= 70 ? "text-green-600" : r.confidence >= 50 ? "text-yellow-600" : "text-gray-500"}`}>
                        {r.confidence}%
                      </span>
                    </td>
                    <td className="py-2 text-right">{r.rsi?.toFixed(1) || "-"}</td>
                    <td className="py-2 text-right">{r.atr?.toFixed(0) || "-"}</td>
                    <td className="py-2">
                      <button
                        onClick={() => showPlaybook(r)}
                        className="px-2 py-1 rounded text-xs bg-teal-100 text-teal-700 hover:bg-teal-200"
                      >
                        📋 플레이북
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Playbook Modal */}
      {playbook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPlaybook(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">📋 트레이딩 플레이북</h3>
              <button onClick={() => setPlaybook(null)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="font-semibold mb-2">전략: {playbook.strategy?.name}</h4>
                <p className="text-gray-600">{playbook.strategy?.description}</p>
              </div>

              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h4 className="font-semibold mb-2">진입</h4>
                <p>트리거: {playbook.entry?.trigger}</p>
                <p>진입가: {formatNumber(playbook.entry?.price)}원</p>
                <p>확인 조건: {playbook.entry?.confirmation?.join(", ")}</p>
              </div>

              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <h4 className="font-semibold mb-2">손절</h4>
                <p>손절가: {formatNumber(playbook.stopLoss?.price)}원</p>
                <p>방법: {playbook.stopLoss?.method}</p>
              </div>

              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <h4 className="font-semibold mb-2">포지션 사이징</h4>
                <p>계좌 규모: {formatNumber(playbook.positionSizing?.accountSize)}원</p>
                <p>리스크: {(playbook.positionSizing?.riskPerTrade * 100)?.toFixed(1)}%</p>
                <p>리스크 금액: {formatNumber(playbook.positionSizing?.riskAmount)}원</p>
                <p>주문 수량: {formatNumber(playbook.positionSizing?.shareCount)}주</p>
                <p>포지션 가치: {formatNumber(playbook.positionSizing?.positionValue)}원</p>
              </div>

              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <h4 className="font-semibold mb-2">청산 규칙</h4>
                <p>목표가: {formatNumber(playbook.exitRules?.profitTarget)}원</p>
                <p>트레일링: {playbook.exitRules?.trailingStop}</p>
                <p>시간: {playbook.exitRules?.timeStop}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">스크리닝 이력</h3>
        <div className="space-y-2">
          {history.slice(0, 10).map((h, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
              <div>
                <span className="font-medium">#{h.id}</span>
                <span className="text-gray-400 ml-2">{h.market} / {h.mode}</span>
              </div>
              <div className="flex gap-4 text-gray-600">
                <span>결과: {h.resultCount}건</span>
                <span className="text-gray-400">{formatTime(h.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
