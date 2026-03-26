import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../lib/api";
import { formatMoney, formatPercent, getChangeColor } from "../lib/utils";
import { BIOTECH_SECTOR_LABELS } from "@shared/schema";
import type { BiotechSector } from "@shared/schema";

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

const SECTOR_COLORS: Record<string, string> = {
  biopharm: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  cdmo: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  newdrug: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  meddevice: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  diagnostic: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  cro: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
};

function formatVolume(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toLocaleString();
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <span className="text-gray-400 ml-1">↕</span>;
  return <span className="text-blue-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

export default function BiotechDashboard() {
  const [allStocks, setAllStocks] = useState<BiotechStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("changePercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBiotechStocks();
      setAllStocks(data);
    } catch (e: any) {
      setError(e.message || "데이터를 불러오는데 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const sectorFiltered = useMemo(() => {
    if (selectedSector === "all") return allStocks;
    return allStocks.filter(s => s.sectors.includes(selectedSector));
  }, [allStocks, selectedSector]);

  const filtered = useMemo(() => {
    let result = sectorFiltered;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(term) || s.code.includes(term));
    }
    return [...result].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortField === "name") return mul * a.name.localeCompare(b.name, "ko");
      return mul * ((a[sortField] || 0) - (b[sortField] || 0));
    });
  }, [sectorFiltered, searchTerm, sortField, sortDir]);

  const { rising, falling, totalVolume, avgChange } = useMemo(() => {
    const r = sectorFiltered.filter(s => s.changePercent > 0).length;
    const f = sectorFiltered.filter(s => s.changePercent < 0).length;
    const tv = sectorFiltered.reduce((sum, s) => sum + s.volume, 0);
    const avg = sectorFiltered.length > 0
      ? sectorFiltered.reduce((sum, s) => sum + s.changePercent, 0) / sectorFiltered.length
      : 0;
    return { rising: r, falling: f, totalVolume: tv, avgChange: avg };
  }, [sectorFiltered]);

  const sectorStats = useMemo(() => {
    const map = new Map<string, BiotechStock[]>();
    for (const s of allStocks) {
      for (const sector of s.sectors) {
        const list = map.get(sector);
        if (list) list.push(s);
        else map.set(sector, [s]);
      }
    }
    return map;
  }, [allStocks]);

  const hotStocks = useMemo(() => {
    const THRESHOLD = 1000_0000_0000; // 1000억
    return allStocks
      .filter(s => s.tradingValue >= THRESHOLD)
      .sort((a, b) => b.changePercent - a.changePercent);
  }, [allStocks]);

  const handleSendReport = async () => {
    setSendingReport(true);
    setReportStatus(null);
    try {
      const result = await api.sendBiotechReport();
      if (result.success) {
        setReportStatus(`${result.count || 0}종목 텔레그램 전송 완료`);
      } else {
        setReportStatus(result.message || "전송 실패");
      }
    } catch (e: any) {
      setReportStatus(e.message || "전송 실패");
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500">전체 종목</div>
          <div className="text-2xl font-bold mt-1">{sectorFiltered.length}</div>
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
          <div className={`text-2xl font-bold mt-1 ${getChangeColor(avgChange)}`}>
            {formatPercent(avgChange)}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500">총 거래량</div>
          <div className="text-2xl font-bold mt-1">{formatVolume(totalVolume)}</div>
        </div>
      </div>

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
          {(Object.entries(BIOTECH_SECTOR_LABELS) as [BiotechSector, string][]).map(([key, label]) => (
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

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

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
                  종목명<SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">섹터</th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("price")}
                >
                  현재가<SortIcon field="price" sortField={sortField} sortDir={sortDir} />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("changePercent")}
                >
                  등락률<SortIcon field="changePercent" sortField={sortField} sortDir={sortDir} />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("volume")}
                >
                  거래량<SortIcon field="volume" sortField={sortField} sortDir={sortDir} />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("tradingValue")}
                >
                  거래대금<SortIcon field="tradingValue" sortField={sortField} sortDir={sortDir} />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("marketCap")}
                >
                  시가총액<SortIcon field="marketCap" sortField={sortField} sortDir={sortDir} />
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">고가/저가</th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("per")}
                >
                  PER<SortIcon field="per" sortField={sortField} sortDir={sortDir} />
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900"
                  onClick={() => handleSort("pbr")}
                >
                  PBR<SortIcon field="pbr" sortField={sortField} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && allStocks.length === 0 ? (
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
                            {BIOTECH_SECTOR_LABELS[s as BiotechSector] || s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {stock.price.toLocaleString()}원
                    </td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${getChangeColor(stock.changePercent)}`}>
                      <div>{formatPercent(stock.changePercent)}</div>
                      <div className="text-xs opacity-75">
                        {stock.change > 0 ? "+" : ""}{stock.change.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {formatVolume(stock.volume)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {formatMoney(stock.tradingValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {formatMoney(stock.marketCap)}
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

      {allStocks.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">
              거래대금 1,000억+ 종목 ({hotStocks.length})
            </h3>
            <div className="flex items-center gap-3">
              {reportStatus && (
                <span className="text-sm text-gray-500">{reportStatus}</span>
              )}
              <button
                onClick={handleSendReport}
                disabled={sendingReport || hotStocks.length === 0}
                className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-sm hover:bg-sky-600 disabled:opacity-50 transition-colors"
              >
                {sendingReport ? "전송중..." : "텔레그램 전송"}
              </button>
            </div>
          </div>
          {hotStocks.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              거래대금 1,000억 이상 바이오 종목이 없습니다
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">종목명</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">섹터</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">현재가</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">등락률</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">거래대금</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">시가총액</th>
                  </tr>
                </thead>
                <tbody>
                  {hotStocks.map(stock => (
                    <tr key={stock.code} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                        {stock.name}
                        <span className="ml-2 text-xs text-gray-400 font-mono">{stock.code}</span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {stock.sectors.map(s => (
                            <span key={s} className={`px-2 py-0.5 rounded-full text-xs font-medium ${SECTOR_COLORS[s] || "bg-gray-100 text-gray-600"}`}>
                              {BIOTECH_SECTOR_LABELS[s as BiotechSector] || s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{stock.price.toLocaleString()}원</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-bold ${getChangeColor(stock.changePercent)}`}>
                        {formatPercent(stock.changePercent)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-amber-600 dark:text-amber-400">
                        {formatMoney(stock.tradingValue)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {formatMoney(stock.marketCap)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedSector === "all" && allStocks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.entries(BIOTECH_SECTOR_LABELS) as [BiotechSector, string][]).map(([key, label]) => {
            const stocks = sectorStats.get(key);
            if (!stocks || stocks.length === 0) return null;
            const avgChg = stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length;
            const topStock = [...stocks].sort((a, b) => b.changePercent - a.changePercent)[0];
            const totalVol = stocks.reduce((s, st) => s + st.volume, 0);

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
                  <span className="text-sm text-gray-500">{stocks.length}종목</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">평균 등락률</span>
                    <span className={`font-medium ${getChangeColor(avgChg)}`}>
                      {formatPercent(avgChg)}
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
                        <span className={getChangeColor(topStock.changePercent)}>
                          {formatPercent(topStock.changePercent)}
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
