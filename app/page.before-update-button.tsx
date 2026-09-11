"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  maximumFractionDigits: 2,
});

type PositionRecord = {
  market?: string;
  symbol?: string;
  stock_name?: string;
  name?: string;
  shares?: number | string;
  quantity?: number | string;
  avg_cost?: number | string;
  average_cost?: number | string;
  cost?: number | string;
  current_price?: number | string;
  latest_price?: number | string;
  price?: number | string;
  close_price?: number | string;
  currency?: string;
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  const fxRate = 32.6;

  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setLoadError("");

      const result = await supabase.from("positions").select("*");

      if (result.error) {
        setLoadError(result.error.message);
        setPositions([]);
      } else {
        setPositions(result.data || []);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  const rows = useMemo(() => {
    const mapped = positions.map((item) => {
      const symbol = item.symbol || "";
      const market = getMarket(symbol, item.market);
      const currency = getCurrency(market, item.currency);

      const shares = toNumber(item.shares ?? item.quantity);
      const avgCost = toNumber(item.avg_cost ?? item.average_cost ?? item.cost);

      const dbPrice =
        toNumber(
          item.current_price ??
            item.latest_price ??
            item.price ??
            item.close_price
        ) || avgCost;

      const displayPrice = currentPrices[symbol] ?? dbPrice;

      const rate = currency === "USD" ? fxRate : 1;
      const costTwd = shares * avgCost * rate;
      const valueTwd = shares * displayPrice * rate;
      const pnlTwd = valueTwd - costTwd;
      const returnRate = costTwd ? pnlTwd / costTwd : 0;

      return {
        market,
        symbol,
        name: item.stock_name || item.name || symbol,
        shares,
        avgCost,
        price: displayPrice,
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
  }, [positions, currentPrices]);

  const totalValue = rows.reduce((sum, row) => sum + row.valueTwd, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.costTwd, 0);
  const totalPnl = totalValue - totalCost;
  const totalReturn = totalCost ? totalPnl / totalCost : 0;

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <section className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-blue-600">Portfolio Pro</p>
          <h1 className="text-3xl font-bold">兩年投資績效追蹤網站</h1>
          <p className="mt-2 text-slate-600">
            目前已連接 Supabase positions 資料表，顯示你的真實庫存資料。
          </p>
        </div>

        {loading && (
          <div className="rounded-2xl bg-white p-5 text-slate-600 shadow-sm">
            正在讀取 Supabase positions 資料...
          </div>
        )}

        {updateMessage && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-700">
            {updateMessage}
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
          <KpiCard title="已實現損益" value={twd.format(0)} />
          <KpiCard title="總報酬率" value={pct.format(totalReturn)} />
          <KpiCard title="USD/TWD" value={fxRate.toFixed(2)} />
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">最新庫存明細</h2>

          {rows.length === 0 && !loading && !loadError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-700">
              positions 資料表目前沒有可顯示的資料，或 Row Level Security 尚未允許讀取。
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
                  <tr key={`${row.symbol}-${index}`} className="border-t">
                    <td className="p-3">{row.market}</td>
                    <td className="p-3 font-medium">{row.symbol}</td>
                    <td className="p-3">{row.name}</td>
                    <td className="p-3 text-right">{row.shares}</td>
                    <td className="p-3 text-right">{row.avgCost}</td>
                    <td className="p-3 text-right">{row.price}</td>
                    <td className="p-3">{row.currency}</td>
                    <td className="p-3 text-right">{twd.format(row.valueTwd)}</td>
                    <td className="p-3 text-right text-green-600">
                      {twd.format(row.pnlTwd)}
                    </td>
                    <td className="p-3 text-right">{pct.format(row.returnRate)}</td>
                    <td className="p-3 text-right">{pct.format(row.weight)}</td>
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


