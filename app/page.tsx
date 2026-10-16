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

const amountFmt = new Intl.NumberFormat("zh-TW", {
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

type CurrentPositionRecord = {
  market?: string;
  symbol?: string;
  stock_name?: string;
  currency?: string;
  shares?: NumericLike;
  avg_cost?: NumericLike;
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

type TradeRecord = {
  id: string;
  trade_date: string;
  market: string | null;
  symbol: string;
  stock_name: string | null;
  side: string;
  shares: NumericLike;
  price: NumericLike;
  cash_amount: NumericLike;
  currency: string | null;
  fee: NumericLike;
  tax: NumericLike;
  exchange_rate: NumericLike;
  split_from: NumericLike;
  split_to: NumericLike;
  memo: string | null;
};

type TradeEditForm = {
  trade_date: string; side: string; shares: string; price: string; cash_amount: string;
  fee: string; tax: string; exchange_rate: string; split_from: string; split_to: string; memo: string;
};
const emptyTradeEditForm: TradeEditForm = { trade_date: "", side: "buy", shares: "", price: "", cash_amount: "", fee: "", tax: "", exchange_rate: "1", split_from: "", split_to: "", memo: "" };

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

function getTradeTypeLabel(side: string) {
  const labels: Record<string, string> = {
    buy: "買進",
    sell: "賣出",
    dividend: "股利",
    split: "分割",
  };
  return labels[side] || side;
}

function getTradeTypeClass(side: string) {
  if (side === "buy") return "bg-blue-50 text-blue-700";
  if (side === "sell") return "bg-amber-50 text-amber-700";
  if (side === "dividend") return "bg-emerald-50 text-emerald-700";
  if (side === "split") return "bg-purple-50 text-purple-700";
  return "bg-slate-100 text-slate-700";
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

  const [expandedPositionKey, setExpandedPositionKey] = useState<string | null>(null);
  const [tradeHistory, setTradeHistory] = useState<Record<string, TradeRecord[]>>({});
  const [tradeHistoryLoading, setTradeHistoryLoading] = useState<Record<string, boolean>>({});
  const [tradeHistoryError, setTradeHistoryError] = useState<Record<string, string>>({});
  const [editingTrade, setEditingTrade] = useState<TradeRecord | null>(null);
  const [tradeEditForm, setTradeEditForm] = useState<TradeEditForm>(emptyTradeEditForm);
  const [savingTrade, setSavingTrade] = useState(false);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [tradeActionMessage, setTradeActionMessage] = useState("");
  const [tradeActionError, setTradeActionError] = useState("");

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

      const currentPositionsResult = await supabase
        .from("positions")
        .select("market, symbol, stock_name, currency, shares, avg_cost, updated_at")
        .gt("shares", 0)
        .order("market", { ascending: true })
        .order("symbol", { ascending: true });

      if (currentPositionsResult.error) {
        throw currentPositionsResult.error;
      }

      const dailyRows =
        (dailyPositionsResult.data || []) as DailyPositionRecord[];
      const currentRows =
        (currentPositionsResult.data || []) as CurrentPositionRecord[];

      const dailyBySymbol = new Map(
        dailyRows.map((item) => [item.symbol || "", item])
      );

      const mergedPositions: DailyPositionRecord[] = currentRows.map((current) => {
        const symbol = current.symbol || "";
        const daily = dailyBySymbol.get(symbol);
        const market = getMarket(symbol, current.market || daily?.market);
        const currency = getCurrency(
          market,
          current.currency || daily?.currency
        );
        const shares = toNumber(current.shares);
        const avgCost = toNumber(current.avg_cost);
        const closePrice = toNumber(daily?.close_price);
        const fxRate = currency === "USD" ? toNumber(daily?.fx_rate, 1) : 1;
        const costOriginal = shares * avgCost;
        const marketValueOriginal = shares * closePrice;
        const costTwd = costOriginal * fxRate;
        const marketValueTwd = marketValueOriginal * fxRate;
        const unrealizedPnlTwd = marketValueTwd - costTwd;
        const unrealizedReturnRate =
          costTwd > 0 ? unrealizedPnlTwd / costTwd : 0;

        return {
          ...daily,
          market,
          symbol,
          stock_name: current.stock_name || daily?.stock_name || symbol,
          currency,
          shares,
          avg_cost: avgCost,
          cost_amount_original: costOriginal,
          cost_amount_twd: costTwd,
          close_price: closePrice,
          fx_rate: fxRate,
          market_value_original: marketValueOriginal,
          market_value_twd: marketValueTwd,
          unrealized_pnl_twd: unrealizedPnlTwd,
          unrealized_return_rate: unrealizedReturnRate,
          updated_at: current.updated_at || daily?.updated_at,
        };
      });

      setPositions(mergedPositions);

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


  async function handleExpandPosition(market: string, symbol: string) {
    const positionKey = `${market}:${symbol}`;

    if (expandedPositionKey === positionKey) {
      setExpandedPositionKey(null);
      return;
    }

    setExpandedPositionKey(positionKey);

    if (tradeHistory[positionKey] || tradeHistoryLoading[positionKey]) return;

    setTradeHistoryLoading((previous) => ({ ...previous, [positionKey]: true }));
    setTradeHistoryError((previous) => ({ ...previous, [positionKey]: "" }));

    try {
      const { data, error } = await supabase
        .from("trades")
        .select(
          "id, trade_date, market, symbol, stock_name, side, shares, price, cash_amount, currency, fee, tax, exchange_rate, split_from, split_to, memo"
        )
        .eq("market", market)
        .eq("symbol", symbol)
        .order("trade_date", { ascending: false })
        .order("id", { ascending: false });

      if (error) throw error;

      setTradeHistory((previous) => ({
        ...previous,
        [positionKey]: (data || []) as TradeRecord[],
      }));
    } catch (error: any) {
      setTradeHistoryError((previous) => ({
        ...previous,
        [positionKey]: error?.message || String(error),
      }));
    } finally {
      setTradeHistoryLoading((previous) => ({
        ...previous,
        [positionKey]: false,
      }));
    }
  }

  function openTradeEditor(trade: TradeRecord) {
    setTradeActionMessage(""); setTradeActionError(""); setEditingTrade(trade);
    setTradeEditForm({
      trade_date: trade.trade_date || "", side: trade.side || "buy",
      shares: trade.shares == null ? "" : String(trade.shares), price: trade.price == null ? "" : String(trade.price),
      cash_amount: trade.cash_amount == null ? "" : String(trade.cash_amount), fee: trade.fee == null ? "" : String(trade.fee),
      tax: trade.tax == null ? "" : String(trade.tax), exchange_rate: trade.exchange_rate == null ? "1" : String(trade.exchange_rate),
      split_from: trade.split_from == null ? "" : String(trade.split_from), split_to: trade.split_to == null ? "" : String(trade.split_to),
      memo: trade.memo || "",
    });
  }
  function closeTradeEditor() { if (!savingTrade) { setEditingTrade(null); setTradeEditForm(emptyTradeEditForm); } }
  function optionalNumber(value: string) { const v=value.trim(); return v === "" ? null : Number(v); }

  async function callPortfolioApi(url: string, fallback: string) {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error || fallback);
    return result;
  }

  async function rebuildPositionAfterTradeChange(symbol: string) {
    const encodedSymbol = encodeURIComponent(symbol);

    return callPortfolioApi(
      `/api/portfolio/rebuild-positions?symbol=${encodedSymbol}`,
      `重建 ${symbol} 持股資料失敗`
    );
  }

  async function refreshExpandedTradeHistory(market: string, symbol: string) {
    const key = `${market}:${symbol}`;
    const { data, error } = await supabase.from("trades")
      .select("id, trade_date, market, symbol, stock_name, side, shares, price, cash_amount, currency, fee, tax, exchange_rate, split_from, split_to, memo")
      .eq("market", market).eq("symbol", symbol).order("trade_date", { ascending: false }).order("id", { ascending: false });
    if (error) throw error;
    setTradeHistory((prev) => ({ ...prev, [key]: (data || []) as TradeRecord[] }));
  }

  async function handleSaveTrade() {
    if (!editingTrade) return;
    setTradeActionError(""); setTradeActionMessage("");
    if (!tradeEditForm.trade_date) { setTradeActionError("請輸入交易日期。"); return; }
    const nums=[tradeEditForm.shares,tradeEditForm.price,tradeEditForm.cash_amount,tradeEditForm.fee,tradeEditForm.tax,tradeEditForm.exchange_rate,tradeEditForm.split_from,tradeEditForm.split_to].filter(v=>v.trim()!=="");
    if (nums.some(v=>!Number.isFinite(Number(v)))) { setTradeActionError("數值欄位包含無效內容。"); return; }
    setSavingTrade(true);
    try {
      const { error } = await supabase.from("trades").update({
        trade_date: tradeEditForm.trade_date, side: tradeEditForm.side, shares: optionalNumber(tradeEditForm.shares),
        price: optionalNumber(tradeEditForm.price), cash_amount: optionalNumber(tradeEditForm.cash_amount), fee: optionalNumber(tradeEditForm.fee),
        tax: optionalNumber(tradeEditForm.tax), exchange_rate: optionalNumber(tradeEditForm.exchange_rate), split_from: optionalNumber(tradeEditForm.split_from),
        split_to: optionalNumber(tradeEditForm.split_to), memo: tradeEditForm.memo.trim() || null, updated_at: new Date().toISOString(),
      }).eq("id", editingTrade.id);
      if (error) throw error;
      setTradeActionMessage(`交易已更新，正在重新計算個股資料...`);
      await rebuildPositionAfterTradeChange(editingTrade.symbol);
      await refreshExpandedTradeHistory(editingTrade.market || getMarket(editingTrade.symbol), editingTrade.symbol);
      await loadData();
      setEditingTrade(null); setTradeEditForm(emptyTradeEditForm);
      setTradeActionMessage(`交易已更新，股數、平均成本與個股損益已重新計算。`);
    } catch (error:any) { setTradeActionError(error?.message || String(error)); } finally { setSavingTrade(false); }
  }

  async function handleDeleteTrade(trade: TradeRecord) {
    if (!window.confirm(`確定刪除 ${trade.trade_date} 的 ${trade.symbol} ${getTradeTypeLabel(trade.side)}交易嗎？此操作無法復原。`)) return;
    setDeletingTradeId(trade.id); setTradeActionError(""); setTradeActionMessage("");
    try {
      const { error } = await supabase.from("trades").delete().eq("id", trade.id); if (error) throw error;
      setTradeActionMessage(`交易已刪除，正在重新計算個股資料...`);
      await rebuildPositionAfterTradeChange(trade.symbol);
      await refreshExpandedTradeHistory(trade.market || getMarket(trade.symbol), trade.symbol);
      await loadData(); setTradeActionMessage(`交易已刪除，股數、平均成本與個股損益已重新計算。`);
    } catch (error:any) { setTradeActionError(error?.message || String(error)); } finally { setDeletingTradeId(null); }
  }

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
      setExpandedPositionKey(null);
      setTradeHistory({});
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

        {tradeActionMessage && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 shadow-sm">{tradeActionMessage}</div>}
        {tradeActionError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">交易處理失敗：{tradeActionError}</div>}

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
                    "",
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
                  ].map((header, headerIndex) => (
                    <th
                      key={`${header}-${headerIndex}`}
                      className={headerIndex === 0 ? "w-10 p-3 text-center" : "p-3 text-left"}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => {
                  const positionKey = `${row.market}:${row.symbol}`;
                  const isExpanded = expandedPositionKey === positionKey;
                  const history = tradeHistory[positionKey] || [];
                  const isHistoryLoading = Boolean(tradeHistoryLoading[positionKey]);
                  const historyError = tradeHistoryError[positionKey];

                  return (
                    <React.Fragment key={`${row.market}-${row.symbol}-${index}`}>
                      <tr
                        className="cursor-pointer border-t transition hover:bg-slate-50"
                        onClick={() => handleExpandPosition(row.market, row.symbol)}
                        aria-expanded={isExpanded}
                      >
                        <td className="p-3 text-center text-slate-500">
                          <span
                            className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            aria-hidden="true"
                          >
                            ▶
                          </span>
                        </td>
                        <td className="p-3">{row.market}</td>
                        <td className="p-3 font-medium text-blue-700">{row.symbol}</td>
                        <td className="p-3">{row.name}</td>
                        <td className="p-3 text-right">{sharesFmt.format(row.shares)}</td>
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

                      {isExpanded && (
                        <tr className="border-t">
                          <td colSpan={12} className="bg-slate-50 p-4 sm:p-5">
                            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {row.symbol} 全部歷史交易
                                </p>
                                <p className="text-xs text-slate-500">依交易日期由新到舊排列</p>
                              </div>
                              {!isHistoryLoading && !historyError && (
                                <p className="text-xs text-slate-500">共 {history.length} 筆</p>
                              )}
                            </div>

                            {isHistoryLoading && (
                              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                                正在讀取 {row.symbol} 的交易紀錄...
                              </div>
                            )}

                            {historyError && (
                              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                讀取交易紀錄失敗：{historyError}
                              </div>
                            )}

                            {!isHistoryLoading && !historyError && history.length === 0 && (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                                找不到 {row.symbol} 的歷史交易紀錄。
                              </div>
                            )}

                            {!isHistoryLoading && !historyError && history.length > 0 && (
                              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                <table className="min-w-[1050px] w-full text-sm">
                                  <thead className="bg-slate-100">
                                    <tr>
                                      {[
                                        "日期",
                                        "類型",
                                        "股數",
                                        "價格",
                                        "股利／現金",
                                        "手續費",
                                        "稅",
                                        "匯率",
                                        "分割比例",
                                        "Memo",
                                        "操作",
                                      ].map((header) => (
                                        <th
                                          key={header}
                                          className="whitespace-nowrap p-3 text-left font-medium text-slate-600"
                                        >
                                          {header}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {history.map((trade) => {
                                      const splitFrom = toNumber(trade.split_from);
                                      const splitTo = toNumber(trade.split_to);
                                      const splitLabel =
                                        trade.side === "split" && splitFrom > 0 && splitTo > 0
                                          ? `${amountFmt.format(splitFrom)} : ${amountFmt.format(splitTo)}`
                                          : "-";

                                      return (
                                        <tr key={trade.id} className="border-t hover:bg-slate-50">
                                          <td className="whitespace-nowrap p-3">{trade.trade_date}</td>
                                          <td className="p-3">
                                            <span
                                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getTradeTypeClass(
                                                trade.side
                                              )}`}
                                            >
                                              {getTradeTypeLabel(trade.side)}
                                            </span>
                                          </td>
                                          <td className="p-3 text-right">
                                            {sharesFmt.format(toNumber(trade.shares))}
                                          </td>
                                          <td className="p-3 text-right">
                                            {amountFmt.format(toNumber(trade.price))}
                                          </td>
                                          <td className="p-3 text-right">
                                            {trade.side === "dividend"
                                              ? amountFmt.format(toNumber(trade.cash_amount))
                                              : "-"}
                                          </td>
                                          <td className="p-3 text-right">
                                            {amountFmt.format(toNumber(trade.fee))}
                                          </td>
                                          <td className="p-3 text-right">
                                            {amountFmt.format(toNumber(trade.tax))}
                                          </td>
                                          <td className="p-3 text-right">
                                            {amountFmt.format(toNumber(trade.exchange_rate, 1))}
                                          </td>
                                          <td className="whitespace-nowrap p-3 text-center">
                                            {splitLabel}
                                          </td>
                                          <td className="p-3">{trade.memo || "-"}</td>
                                          <td className="whitespace-nowrap p-3"><div className="flex gap-2">
                                            <button type="button" onClick={() => openTradeEditor(trade)} disabled={Boolean(deletingTradeId)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">編輯</button>
                                            <button type="button" onClick={() => handleDeleteTrade(trade)} disabled={Boolean(deletingTradeId)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-red-300">{deletingTradeId === trade.id ? "刪除中..." : "刪除"}</button>
                                          </div></td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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

        {editingTrade && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) closeTradeEditor(); }}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">編輯交易</h2><p className="mt-1 text-sm text-slate-500">{editingTrade.market || getMarket(editingTrade.symbol)} · {editingTrade.symbol} · {editingTrade.stock_name || editingTrade.symbol}</p></div><button type="button" onClick={closeTradeEditor} disabled={savingTrade} className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100">✕</button></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <TradeField label="交易日期"><input type="date" value={tradeEditForm.trade_date} onChange={e=>setTradeEditForm(p=>({...p,trade_date:e.target.value}))} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></TradeField>
                <TradeField label="交易類型"><select value={tradeEditForm.side} onChange={e=>setTradeEditForm(p=>({...p,side:e.target.value}))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"><option value="buy">買進</option><option value="sell">賣出</option><option value="dividend">股利</option><option value="split">分割</option></select></TradeField>
                {[['股數','shares'],['價格','price'],['股利／現金','cash_amount'],['手續費','fee'],['稅','tax'],['匯率','exchange_rate'],['分割前比例','split_from'],['分割後比例','split_to']].map(([label,key])=><TradeNumberField key={key} label={label} value={tradeEditForm[key as keyof TradeEditForm]} onChange={value=>setTradeEditForm(p=>({...p,[key]:value}))} />)}
                <TradeField label="Memo" className="sm:col-span-2"><textarea value={tradeEditForm.memo} onChange={e=>setTradeEditForm(p=>({...p,memo:e.target.value}))} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></TradeField>
              </div>
              {tradeActionError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{tradeActionError}</div>}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={closeTradeEditor} disabled={savingTrade} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">取消</button><button type="button" onClick={handleSaveTrade} disabled={savingTrade} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300">{savingTrade ? "儲存並更新個股中..." : "儲存修改"}</button></div>
            </div>
          </div>
        )}

        {updateResult && (
          <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100 shadow-sm">
            {JSON.stringify(updateResult, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}

function TradeField({ label, children, className = "" }: { label:string; children:React.ReactNode; className?:string }) { return <label className={`block ${className}`}><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</label>; }
function TradeNumberField({ label, value, onChange }: { label:string; value:string; onChange:(value:string)=>void }) { return <TradeField label={label}><input type="number" inputMode="decimal" step="any" value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right" /></TradeField>; }

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
