"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import PerformanceSummary from "./PerformanceSummary";

const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  maximumFractionDigits: 2,
});

const num1 = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const pct1 = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const sharesFmt = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

type NumericLike = number | string | null | undefined;

type DailyPositionRecord = {
  position_date?: string;
  market?: string;
  symbol?: string;
  stock_name?: string;
  currency?: string;
  shares?: NumericLike;
  avg_cost?: NumericLike;
  cost_amount_original?: NumericLike;
  cost_amount_twd?: NumericLike;
  close_price?: NumericLike;
  yahoo_symbol?: string | null;
  fx_rate?: NumericLike;
  market_value_original?: NumericLike;
  market_value_twd?: NumericLike;
  unrealized_pnl_twd?: NumericLike;
  unrealized_return_rate?: NumericLike;
  realized_pnl_twd?: NumericLike;
  cumulative_realized_pnl_twd?: NumericLike;
  updated_at?: string;
};

type PortfolioPerformanceRecord = {
  position_date?: string;
  total_cost_twd?: NumericLike;
  total_market_value_twd?: NumericLike;
  total_unrealized_pnl_twd?: NumericLike;
  daily_realized_pnl_twd?: NumericLike;
  cumulative_realized_pnl_twd?: NumericLike;
  total_pnl_twd?: NumericLike;
  unrealized_return_rate?: NumericLike;
};

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getMarket(symbol: string, market?: string) {
  if (market) return market;
  if (symbol.endsWith(".TW") || symbol.endsWith(".TWO")) return "TW";
  if (/^[0-9]{4,6}$/.test(symbol)) return "TW";
  return "US";
}

function getCurrency(market: string, currency?: string) {
  if (currency) return currency;
  return market === "US" ? "USD" : "TWD";
}

export default function Page() {
  const [fxRate, setFxRate] = useState(32.6);
  const [positions, setPositions] = useState<DailyPositionRecord[]>([]);
  const [latestPerformance, setLatestPerformance] =
    useState<PortfolioPerformanceRecord | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dataDate, setDataDate] = useState("");
  const [dataUpdatedAt, setDataUpdatedAt] = useState("");

  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateResult, setUpdateResult] = useState<any>(null);

  async function loadData() {
    setLoading(true);
    setLoadError("");

    try {
      const perfResult = await supabase
        .from("daily_portfolio_performance")
        .select(
          "position_date, total_cost_twd, total_market_value_twd, total_unrealized_pnl_twd, daily_realized_pnl_twd, cumulative_realized_pnl_twd, total_pnl_twd, unrealized_return_rate"
        )
        .order("position_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfResult.error) {
        throw perfResult.error;
      }

      if (!perfResult.data) {
        setPositions([]);
        setLatestPerformance(null);
        setDataDate("");
        setDataUpdatedAt("");
        return;
      }

      const latestPerf = perfResult.data as PortfolioPerformanceRecord;

      setLatestPerformance(latestPerf);
      setDataDate(latestPerf.position_date || "");

      const dailyPositionsResult = await supabase
        .from("daily_stock_positions")
        .select(
          "position_date, market, symbol, stock_name, currency, shares, avg_cost, cost_amount_original, cost_amount_twd, close_price, yahoo_symbol, fx_rate, market_value_original, market_value_twd, unrealized_pnl_twd, unrealized_return_rate, realized_pnl_twd, cumulative_realized_pnl_twd, updated_at"
        )
        .eq("position_date", latestPerf.position_date)
        .gt("shares", 0)
        .order("market", { ascending: true })
        .order("symbol", { ascending: true });

      if (dailyPositionsResult.error) {
        throw dailyPositionsResult.error;
      }

      setPositions((dailyPositionsResult.data || []) as DailyPositionRecord[]);

      const updatedResult = await supabase
        .from("daily_stock_positions")
        .select("updated_at")
        .eq("position_date", latestPerf.position_date)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!updatedResult.error && updatedResult.data) {
        setDataUpdatedAt(updatedResult.data.updated_at || "");
      }

      const fxResult = await supabase
        .from("historical_fx_rates")
        .select("rate")
        .eq("from_currency", "USD")
        .eq("to_currency", "TWD")
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!fxResult.error && fxResult.data) {
        setFxRate(toNumber(fxResult.data.rate, 32.6));
      }
    } catch (error: any) {
      setLoadError(error?.message || String(error));
      setPositions([]);
      setLatestPerformance(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleUpdatePortfolio() {
    setUpdatingPortfolio(true);
    setUpdateMessage("投資組合更新中，請稍候...");
    setUpdateResult(null);

    try {
      const endDate = new Date().toISOString().slice(0, 10);
      const response = await fetch(
        `/api/portfolio/update-all?start=2024-08-06&end=${endDate}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = await response.json();
      setUpdateResult(result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || "一鍵更新投資組合失敗");
      }

      setUpdateMessage("一鍵更新完成，首頁資料已重新讀取。");
      await loadData();
    } catch (error: any) {
      setUpdateMessage(error?.message || String(error));
    } finally {
      setUpdatingPortfolio(false);
    }
  }

  const rows = useMemo(() => {
    const mapped = positions.map((item) => {
      const symbol = item.symbol || "";
      const market = getMarket(symbol, item.market);
      const currency = getCurrency(market, item.currency);

      const shares = toNumber(item.shares);
      const avgCost = toNumber(item.avg_cost);
      const closePrice = toNumber(item.close_price);
      const costTwd = toNumber(item.cost_amount_twd);
      const valueTwd = toNumber(item.market_value_twd);
      const pnlTwd = toNumber(item.unrealized_pnl_twd);
      const returnRate = toNumber(item.unrealized_return_rate);

      return {
        market,
        symbol,
        name: item.stock_name || symbol,
        shares,
        avgCost,
        price: closePrice,
        currency,
        costTwd,
        valueTwd,
        pnlTwd,
        returnRate,
        weight: 0,
      };
    });

    const totalValue = mapped.reduce((sum, row) => sum + row.valueTwd, 0);

    return mapped
      .map((row) => ({
        ...row,
        weight: totalValue ? row.valueTwd / totalValue : 0,
      }))
      .sort((a, b) => b.valueTwd - a.valueTwd);
  }, [positions]);

  const totalValue = toNumber(latestPerformance?.total_market_value_twd);
  const totalCost = toNumber(latestPerformance?.total_cost_twd);
  const totalPnl = toNumber(latestPerformance?.total_unrealized_pnl_twd);
  const totalRealizedPnl = toNumber(
    latestPerformance?.cumulative_realized_pnl_twd
  );
  const totalOverallPnl = toNumber(latestPerformance?.total_pnl_twd);
  const totalReturn = totalCost ? totalOverallPnl / totalCost : 0;

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Portfolio Pro</p>
            <h1 className="text-3xl font-bold">兩年投資績效追蹤網站</h1>
            <p className="mt-2 text-slate-600">
              目前已連接 Supabase 績效資料表，顯示最新投資組合績效。
            </p>

            <p className="mt-1 text-sm text-slate-500">
              資料日期：{dataDate || "-"}　
              更新時間：
              {dataUpdatedAt
                ? new Date(dataUpdatedAt).toLocaleString("zh-TW", {
                    timeZone: "Asia/Taipei",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "-"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/manual-trade"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              手動新增交易
            </a>

            <button
              type="button"
              onClick={handleUpdatePortfolio}
              disabled={updatingPortfolio}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {updatingPortfolio ? "更新中..." : "一鍵更新投資組合"}
            </button>
          </div>
        </div>

        {updateMessage && (
          <div
            className={`rounded-2xl p-4 text-sm shadow-sm ${
              updateMessage.includes("完成")
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {updateMessage}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl bg-white p-5 text-slate-600 shadow-sm">
            正在讀取 Supabase 最新績效資料...
          </div>
        )}

        {loadError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            Supabase 讀取失敗：{loadError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="總庫存現值" value={twd.format(totalValue)} />
          <KpiCard title="總投入成本" value={twd.format(totalCost)} />
          <KpiCard title="未實現損益" value={twd.format(totalPnl)} />
          <KpiCard title="已實現損益" value={twd.format(totalRealizedPnl)} />
          <KpiCard title="總報酬率" value={pct.format(totalReturn)} />
          <KpiCard title="USD/TWD" value={fxRate.toFixed(2)} />
        </div>

        <PerformanceSummary />

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">最新庫存明細</h2>

          {rows.length === 0 && !loading && !loadError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-700">
              daily_stock_positions 目前沒有可顯示的最新庫存資料，或 Row Level
              Security 尚未允許讀取。
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {[
                    "市場",
                    "代碼",
                    "名稱",
                    "股數",
                    "平均成本",
                    "現價",
                    "幣別",
                    "現值",
                    "未實現損益",
                    "報酬率",
                    "占比",
                  ].map((header) => (
                    <th key={header} className="p-3 text-left">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.market}-${row.symbol}-${index}`} className="border-t">
                    <td className="p-3">{row.market}</td>
                    <td className="p-3 font-medium">{row.symbol}</td>
                    <td className="p-3">{row.name}</td>
                    <td className="p-3 text-right">
                      {sharesFmt.format(row.shares)}
                    </td>
                    <td className="p-3 text-right">{num1.format(row.avgCost)}</td>
                    <td className="p-3 text-right">{num1.format(row.price)}</td>
                    <td className="p-3">{row.currency}</td>
                    <td className="p-3 text-right">{twd.format(row.valueTwd)}</td>
                    <td
                      className={`p-3 text-right font-medium ${
                        row.pnlTwd >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {twd.format(row.pnlTwd)}
                    </td>
                    <td
                      className={`p-3 text-right ${
                        row.returnRate >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {pct1.format(row.returnRate)}
                    </td>
                    <td className="p-3 text-right">{pct1.format(row.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-6 shadow-sm">
          <h2 className="text-xl font-bold">AI 投資組合分析</h2>
          <p className="mt-2 text-sm text-slate-600">
            目前先恢復穩定版本。下一步再逐步加入更新價格、圖表與 AI 分析。
          </p>
        </div>

        {updateResult && (
          <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100 shadow-sm">
            {JSON.stringify(updateResult, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
