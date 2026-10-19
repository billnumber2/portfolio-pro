"use client";

import React, { useState } from "react";
import { supabase } from "../lib/supabase";

type NumericLike = number | string | null | undefined;

type PerformanceRow = {
  position_date: string;
  total_cost_twd: NumericLike;
  total_market_value_twd: NumericLike;
  total_unrealized_pnl_twd: NumericLike;
  cumulative_realized_pnl_twd: NumericLike;
  total_pnl_twd: NumericLike;
};

type PositionRow = {
  market: string | null;
  symbol: string;
  stock_name: string | null;
  currency: string | null;
  shares: NumericLike;
  avg_cost: NumericLike;
};

type DailyPositionRow = {
  position_date: string;
  market: string | null;
  symbol: string;
  stock_name: string | null;
  currency: string | null;
  close_price: NumericLike;
  fx_rate: NumericLike;
};

function toNumber(value: NumericLike, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("瀏覽器無法存取剪貼簿，請改用 HTTPS 或手動複製。");
  }
}

export default function CopyForAIButton() {
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleCopy() {
    setCopying(true);
    setMessage("");
    setIsError(false);

    try {
      const performanceResult = await supabase
        .from("daily_portfolio_performance")
        .select(
          "position_date,total_cost_twd,total_market_value_twd,total_unrealized_pnl_twd,cumulative_realized_pnl_twd,total_pnl_twd"
        )
        .order("position_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (performanceResult.error) throw performanceResult.error;
      if (!performanceResult.data) {
        throw new Error("找不到最新投資組合績效資料。");
      }

      const performance = performanceResult.data as PerformanceRow;

      const [positionsResult, dailyPositionsResult] = await Promise.all([
        supabase
          .from("positions")
          .select("market,symbol,stock_name,currency,shares,avg_cost")
          .gt("shares", 0)
          .order("market", { ascending: true })
          .order("symbol", { ascending: true }),
        supabase
          .from("daily_stock_positions")
          .select(
            "position_date,market,symbol,stock_name,currency,close_price,fx_rate"
          )
          .eq("position_date", performance.position_date)
          .order("market", { ascending: true })
          .order("symbol", { ascending: true }),
      ]);

      if (positionsResult.error) throw positionsResult.error;
      if (dailyPositionsResult.error) throw dailyPositionsResult.error;

      const positions = (positionsResult.data || []) as PositionRow[];
      const dailyPositions =
        (dailyPositionsResult.data || []) as DailyPositionRow[];

      const dailyBySymbol = new Map(
        dailyPositions.map((item) => [item.symbol, item])
      );

      const holdings = positions.map((position) => {
        const daily = dailyBySymbol.get(position.symbol);
        const market = position.market || daily?.market || "";
        const currency =
          position.currency ||
          daily?.currency ||
          (market === "US" ? "USD" : "TWD");
        const shares = toNumber(position.shares);
        const averageCost = toNumber(position.avg_cost);
        const latestPrice = toNumber(daily?.close_price);
        const fxRate = currency === "USD" ? toNumber(daily?.fx_rate, 1) : 1;
        const costTwd = shares * averageCost * fxRate;
        const marketValueTwd = shares * latestPrice * fxRate;
        const unrealizedPnlTwd = marketValueTwd - costTwd;
        const returnRate = costTwd > 0 ? unrealizedPnlTwd / costTwd : null;

        return {
          market,
          symbol: position.symbol,
          name: position.stock_name || daily?.stock_name || position.symbol,
          currency,
          shares,
          averageCost,
          latestPrice,
          fxRate,
          costTwd,
          marketValueTwd,
          unrealizedPnlTwd,
          returnRate,
          weight: 0,
        };
      });

      const holdingsTotalValue = holdings.reduce(
        (sum, holding) => sum + holding.marketValueTwd,
        0
      );

      const sortedHoldings = holdings
        .map((holding) => ({
          ...holding,
          weight:
            holdingsTotalValue > 0
              ? holding.marketValueTwd / holdingsTotalValue
              : 0,
        }))
        .sort((a, b) => b.marketValueTwd - a.marketValueTwd);

      const totalCostTwd = toNumber(performance.total_cost_twd);
      const totalMarketValueTwd = toNumber(
        performance.total_market_value_twd
      );
      const totalUnrealizedPnlTwd = toNumber(
        performance.total_unrealized_pnl_twd
      );
      const realizedPnlTwd = toNumber(
        performance.cumulative_realized_pnl_twd
      );
      const totalPnlTwd = toNumber(performance.total_pnl_twd);
      const totalReturnRate =
        totalCostTwd > 0 ? totalPnlTwd / totalCostTwd : null;

      const holdingsText = sortedHoldings
        .map(
          (holding, index) =>
            `${index + 1}. ${holding.market}｜${holding.symbol}｜${holding.name}\n` +
            `   幣別：${holding.currency}；股數：${formatNumber(holding.shares, 6)}；平均成本：${formatNumber(holding.averageCost, 2)}；最新價格：${formatNumber(holding.latestPrice, 2)}\n` +
            `   台幣成本：${formatNumber(holding.costTwd)}；台幣現值：${formatNumber(holding.marketValueTwd)}；未實現損益：${formatNumber(holding.unrealizedPnlTwd)}；報酬率：${formatPercent(holding.returnRate)}；占比：${formatPercent(holding.weight)}`
        )
        .join("\n\n");

      const text = `請分析以下投資組合。請以繁體中文回答，並依序提供：\n1. 投資組合整體摘要\n2. 持股集中度與市場配置風險\n3. 獲利與虧損主要來源\n4. 個股占比是否過高\n5. 可採取的再平衡方向\n6. 分析限制及需要補充的資料\n\n請勿把以下內容視為即時行情；價格與匯率是最近一次完成「一鍵更新投資組合」時的資料。請勿將分析視為保證獲利或個人化投資建議。\n\n【資料日期】\n${performance.position_date}\n\n【投資組合摘要｜TWD】\n總投入成本：${formatNumber(totalCostTwd)}\n總市值：${formatNumber(totalMarketValueTwd)}\n未實現損益：${formatNumber(totalUnrealizedPnlTwd)}\n已實現損益：${formatNumber(realizedPnlTwd)}\n總損益：${formatNumber(totalPnlTwd)}\n總報酬率：${formatPercent(totalReturnRate)}\n持股檔數：${sortedHoldings.length}\n\n【目前持股】\n${holdingsText}`;

      await copyText(text);
      setMessage(`已複製 ${sortedHoldings.length} 檔持股，可直接貼到 AI 對話。`);
    } catch (error: any) {
      setIsError(true);
      setMessage(error?.message || String(error));
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleCopy}
        disabled={copying}
        className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
      >
        {copying ? "整理資料中..." : "複製給 AI 分析"}
      </button>

      {message && (
        <p
          className={`max-w-xs text-xs ${
            isError ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
