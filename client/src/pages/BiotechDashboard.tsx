import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

type SortField = "name" | "price" | "changePercent" | "volume" | "tradingValue" | "marketCap" | "per" | "pbr";
type SortDir = "asc" | "desc";

interface BiotechStock {
  code: string;
  name: string;
  sectors: string[];
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  tradingValue: number;
  high: number;
  low: number;
  open: number;
  marketCap: number;
  per: number;
  pbr: number;
  high52w: number;
  low52w: number;
}

const SECTOR_LABELS: Record<string, string> = {
  biopharm: "바이오의약품",
  cdmo: "CDMO/CMO",
  newdrug: "신약개발",
  meddevice: "의료기기",
  diagnostic: "진단/체외진단",
  cro: "CRO/임상",
};

const SECTOR_COLORS: Record<string, string> = {
  biopharm: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  cdmo: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  newdrug: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  meddevice: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  diagnostic: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  cro: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
};

function formatNumber(n: number): string {
  if (n >= 1_0000_0000) return (n / 1_0000_0000).toFixed(1) + "조";
  if (n >= 10000) return (n / 10000).toFixed(0) + "억";
  return n.toLocaleString();
}

function formatPrice(n: number): string {
  return n.toLocaleString() + "원";
}

function formatVolume(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toLocaleString();
}

export default function BiotechDashboard() {
  const [stocks, setStocks] = useState<BiotechStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("changePercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sector = selectedSector === "all" ? undefined : selectedSector;
      const data = await api.getBiotechStocks(sector);
      setStocks(data);
    } catch (e: any) {
      setError(e.message || "데이터를 불러오는데 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [selectedSector]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = stocks
    .filter(s => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return s.name.toLowerCase().includes(term) || s.code.includes(term);
      }
      return true;
    })
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortField === "name") return mul * a.name.localeCompare(b.name, "ko");
      return mul * ((a[sortField] || 0) - (b[sortField] || 0));
    });

  // Summary stats
  const rising = stocks.filter(s => s.changePercent > 0).length;
  const falling = stocks.filter(s => s.changePercent < 0).length;
  const unchanged = stocks.filter(s => s.changePercent === 0).length;
  const totalVolume = stocks.reduce((sum, s) => sum + s.volume, 0);
  const avgChange = stocks.length > 0
    ? stocks.reduce((sum, s) => sum + s.changePercent, 0) / stocks.length
    : 0;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-400 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          바이오 대시보드
        </h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "로딩중..." : "새로고침"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500">전체 종목</div>
          <div className="text-2xl font-bold mt-1">{stocks.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500">상승</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{rising}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500">하락</div>
          <div className="text-2xl font-bold mt-1 text-blue-600">{falling}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500">평균 등락률</div>
          <div className={`text-2xl font-bold mt-1 ${avgChange > 0 ? "text-red-600" : avgChange < 0 ? "text-blue-600" : ""}`}>
            {avgChange > 0 ? "+" : ""}{avgChange.toFixed(2)}%
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500">총 거래량</div>
          <div className="text-2xl font-bold mt-1">{formatVolume(totalVolume)}</div>
        </div>
      </div>

      {/* Sector Filter */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">섹터 필터:</span>
          <button
            onClick={() => setSelectedSector("all")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedSector === "all"
                ? "bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            전체
          </button>
          {Object.entries(SECTOR_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedSector(key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedSector === key
                  ? SECTOR_COLORS[key]
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <input
            type="text"
            placeholder="종목명 또는 코드로 검색..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full md:w-80 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Stock Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">코드</th>
                <th
                  className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("name")}
                >
                  종목명<SortIcon field="name" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">섹터</th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("price")}
                >
                  현재가<SortIcon field="price" />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("changePercent")}
                >
                  등락률<SortIcon field="changePercent" />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("volume")}
                >
                  거래량<SortIcon field="volume" />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("tradingValue")}
                >
                  거래대금<SortIcon field="tradingValue" />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("marketCap")}
                >
                  시가총액<SortIcon field="marketCap" />
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">고가/저가</th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("per")}
                >
                  PER<SortIcon field="per" />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("pbr")}
                >
                  PBR<SortIcon field="pbr" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && stocks.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-500">
                    <div className="animate-pulse">바이오 종목 데이터를 불러오는 중...</div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-500">
                    검색 결과가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map(stock => (
                  <tr
                    key={stock.code}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{stock.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{stock.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {stock.sectors.map(s => (
                          <span
                            key={s}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${SECTOR_COLORS[s] || "bg-gray-100 text-gray-600"}`}
                          >
                            {SECTOR_LABELS[s] || s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatPrice(stock.price)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${
                      stock.changePercent > 0 ? "text-red-600" : stock.changePercent < 0 ? "text-blue-600" : "text-gray-600"
                    }`}>
                      <div>{stock.changePercent > 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%</div>
                      <div className="text-xs opacity-75">
                        {stock.change > 0 ? "+" : ""}{stock.change.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {formatVolume(stock.volume)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {formatNumber(stock.tradingValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {formatNumber(stock.marketCap)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-gray-500">
                      <div className="text-red-500">{stock.high.toLocaleString()}</div>
                      <div className="text-blue-500">{stock.low.toLocaleString()}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {stock.per > 0 ? stock.per.toFixed(1) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {stock.pbr > 0 ? stock.pbr.toFixed(2) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sector Summary */}
      {selectedSector === "all" && stocks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(SECTOR_LABELS).map(([key, label]) => {
            const sectorStocks = stocks.filter(s => s.sectors.includes(key));
            if (sectorStocks.length === 0) return null;
            const avgChg = sectorStocks.reduce((s, st) => s + st.changePercent, 0) / sectorStocks.length;
            const topStock = [...sectorStocks].sort((a, b) => b.changePercent - a.changePercent)[0];
            const totalVol = sectorStocks.reduce((s, st) => s + st.volume, 0);

            return (
              <div
                key={key}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedSector(key)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${SECTOR_COLORS[key]}`}>
                    {label}
                  </span>
                  <span className="text-sm text-gray-500">{sectorStocks.length}종목</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">평균 등락률</span>
                    <span className={`font-medium ${avgChg > 0 ? "text-red-600" : avgChg < 0 ? "text-blue-600" : ""}`}>
                      {avgChg > 0 ? "+" : ""}{avgChg.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">총 거래량</span>
                    <span className="font-medium">{formatVolume(totalVol)}</span>
                  </div>
                  {topStock && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">상승 1위</span>
                      <span className="font-medium">
                        {topStock.name}{" "}
                        <span className={topStock.changePercent > 0 ? "text-red-600" : "text-blue-600"}>
                          {topStock.changePercent > 0 ? "+" : ""}{topStock.changePercent.toFixed(2)}%
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
