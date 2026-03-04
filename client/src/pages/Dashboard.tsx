import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { formatNumber, formatMoney, formatTime } from "../lib/utils";

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [kisStatus, setKisStatus] = useState<any>(null);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, k, r] = await Promise.all([
          api.getStats().catch(() => null),
          api.getKisStatus().catch(() => ({ connected: false })),
          api.getScanResults().catch(() => []),
        ]);
        setStats(s);
        setKisStatus(k);
        setRecentResults(r.slice(0, 10));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">대시보드</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="전체 종목" value={formatNumber(stats?.totalStocks)} icon="📈" />
        <StatCard label="오늘 스캔" value={formatNumber(stats?.todayScans)} icon="🔍" />
        <StatCard label="오늘 후보" value={formatNumber(stats?.todayCandidates)} icon="🎯" />
        <StatCard label="알림 발송" value={formatNumber(stats?.totalAlerts)} icon="📨" />
      </div>

      {/* Connection Status */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">연결 상태</h3>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${kisStatus?.connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm">KIS API: {kisStatus?.connected ? "연결됨" : "미연결"}</span>
          </div>
        </div>
      </div>

      {/* Recent Results */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">최근 스캔 결과</h3>
        {recentResults.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">스캔 결과가 없습니다</p>
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
                  <th className="pb-2">소스</th>
                  <th className="pb-2">시간</th>
                </tr>
              </thead>
              <tbody>
                {recentResults.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 font-medium">{r.stockName} <span className="text-gray-400 text-xs">{r.stockCode}</span></td>
                    <td className="py-2">{r.market}</td>
                    <td className="py-2 text-right">{formatNumber(r.price)}</td>
                    <td className={`py-2 text-right ${(r.changePercent || 0) > 0 ? "text-red-500" : "text-blue-500"}`}>
                      {r.changePercent ? `${r.changePercent > 0 ? "+" : ""}${r.changePercent.toFixed(2)}%` : "-"}
                    </td>
                    <td className="py-2 text-right">{formatMoney(r.tradingValue)}</td>
                    <td className="py-2"><span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{r.source || "scanner"}</span></td>
                    <td className="py-2 text-gray-500 text-xs">{formatTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
