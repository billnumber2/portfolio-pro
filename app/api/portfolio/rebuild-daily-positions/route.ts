import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type TradeRow = {
  trade_date: string;
  market: string | null;
  symbol: string;
  stock_name: string | null;
  side: string;
  shares: number | null;
  price: number | null;
  cash_amount: number | null;
  currency: string | null;
  fee: number | null;
  tax: number | null;
  exchange_rate: number | null;
  split_from: number | null;
  split_to: number | null;
};

type PriceRow = {
  symbol: string;
  price_date: string;
  close_price: number;
  yahoo_symbol: string | null;
};

type FxRateRow = {
  rate_date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
};

type StockMasterRow = {
  symbol: string;
  stock_name: string | null;
  market: string;
  yahoo_symbol: string;
};

type PositionState = {
  symbol: string;
  stockName: string | null;
  market: string | null;
  currency: string;
  yahooSymbol: string | null;
  shares: number;
  costAmountOriginal: number;
  costAmountTwd: number;
  realizedPnlTwdToday: number;
  cumulativeRealizedPnlTwd: number;
  hasEverAppeared: boolean;
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

function eachDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const current = new Date(start);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function toNumber(value: number | null | undefined, fallback = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return fallback;
  }
  return Number(value);
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function groupByDate<T extends { trade_date?: string; price_date?: string; rate_date?: string }>(
  rows: T[],
  field: "trade_date" | "price_date" | "rate_date"
) {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const key = row[field];
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  return map;
}

async function fetchAllPages<T>(baseQuery: any, pageSize = 1000): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await baseQuery.range(from, to);

    if (error) {
      throw error;
    }

    const rows = (data || []) as T[];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString();

  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("start") || "2025-03-01";
    const endDate = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const onlySymbol = searchParams.get("symbol");
    const dryRun = searchParams.get("dryRun") === "1";
    const clearExisting = searchParams.get("clear") === "1";

    let stockQuery = supabase
      .from("stock_master")
      .select("symbol, stock_name, market, yahoo_symbol")
      .order("symbol", { ascending: true });

    if (onlySymbol) stockQuery = stockQuery.eq("symbol", onlySymbol);

    const { data: stockData, error: stockError } = await stockQuery;
    if (stockError) throw stockError;

    const stocks = (stockData || []) as StockMasterRow[];

    if (stocks.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No stocks found in stock_master.",
      });
    }

    const symbols = stocks.map((item) => item.symbol);

    let tradeQuery = supabase
      .from("trades")
      .select(
        "trade_date, market, symbol, stock_name, side, shares, price, cash_amount, currency, fee, tax, exchange_rate, split_from, split_to"
      )
      .in("symbol", symbols)
      .lte("trade_date", endDate)
      .order("trade_date", { ascending: true });

    if (onlySymbol) tradeQuery = tradeQuery.eq("symbol", onlySymbol);

    const trades = await fetchAllPages<TradeRow>(tradeQuery);

    const priceQuery = supabase
      .from("historical_prices")
      .select("symbol, price_date, close_price, yahoo_symbol")
      .in("symbol", symbols)
      .lte("price_date", endDate)
      .order("price_date", { ascending: true });

    const prices = await fetchAllPages<PriceRow>(priceQuery);

    const fxRateQuery = supabase
      .from("historical_fx_rates")
      .select("rate_date, from_currency, to_currency, rate")
      .eq("from_currency", "USD")
      .eq("to_currency", "TWD")
      .lte("rate_date", endDate)
      .order("rate_date", { ascending: true });

    const fxRates = await fetchAllPages<FxRateRow>(fxRateQuery);

    const tradesByDate = groupByDate(trades, "trade_date");
    const pricesByDate = groupByDate(prices, "price_date");
    const fxRatesByDate = groupByDate(fxRates, "rate_date");

    const states = new Map<string, PositionState>();
    const lastCloseBySymbol = new Map<string, number>();
    const yahooSymbolBySymbol = new Map<string, string | null>();
    let lastUsdTwdRate: number | null = null;

    for (const stock of stocks) {
      states.set(stock.symbol, {
        symbol: stock.symbol,
        stockName: stock.stock_name,
        market: stock.market,
        currency: stock.market === "US" ? "USD" : "TWD",
        yahooSymbol: stock.yahoo_symbol,
        shares: 0,
        costAmountOriginal: 0,
        costAmountTwd: 0,
        realizedPnlTwdToday: 0,
        cumulativeRealizedPnlTwd: 0,
        hasEverAppeared: false,
      });
      yahooSymbolBySymbol.set(stock.symbol, stock.yahoo_symbol);
    }

    const outputRows: any[] = [];
    const dates = eachDate(startDate, endDate);
    let skippedRowsDueToMissingFx = 0;
    let skippedRowsDueToMissingPrice = 0;

    for (const date of dates) {
      const todayFxRates = fxRatesByDate.get(date) || [];
      for (const fxRate of todayFxRates) {
        const rate = toNumber(fxRate.rate);
        if (rate > 0) {
          lastUsdTwdRate = rate;
        }
      }

      const todayPrices = pricesByDate.get(date) || [];
      for (const price of todayPrices) {
        lastCloseBySymbol.set(price.symbol, toNumber(price.close_price));
        yahooSymbolBySymbol.set(price.symbol, price.yahoo_symbol);
      }

      for (const state of states.values()) {
        state.realizedPnlTwdToday = 0;
      }

      const todayTrades = tradesByDate.get(date) || [];

      for (const trade of todayTrades) {
        const state = states.get(trade.symbol);
        if (!state) continue;

        state.hasEverAppeared = true;
        state.stockName = trade.stock_name || state.stockName;
        state.market = trade.market || state.market;
        state.currency = trade.currency || state.currency;

        const side = (trade.side || "").toLowerCase();
        const shares = toNumber(trade.shares);
        const price = toNumber(trade.price);
        const cashAmount = toNumber(trade.cash_amount);
        const fee = toNumber(trade.fee);
        const tax = toNumber(trade.tax);
        const tradeFxRate = toNumber(
          trade.exchange_rate,
          state.currency === "USD" ? lastUsdTwdRate ?? 1 : 1
        );
        const fxRate = state.currency === "USD" ? tradeFxRate : 1;

        if (side === "buy") {
          const buyCostOriginal = shares * price + fee + tax;
          const buyCostTwd = buyCostOriginal * fxRate;
          state.costAmountOriginal += buyCostOriginal;
          state.costAmountTwd += buyCostTwd;
          state.shares += shares;
        }

        if (side === "sell") {
          const sellShares = Math.min(shares, state.shares);
          const avgCostOriginal = state.shares > 0 ? state.costAmountOriginal / state.shares : 0;
          const avgCostTwd = state.shares > 0 ? state.costAmountTwd / state.shares : 0;
          const soldCostOriginal = avgCostOriginal * sellShares;
          const soldCostTwd = avgCostTwd * sellShares;
          const proceedsOriginal = shares * price - fee - tax;
          const proceedsTwd = proceedsOriginal * fxRate;
          const realizedPnlTwd = proceedsTwd - soldCostTwd;

          state.costAmountOriginal -= soldCostOriginal;
          state.costAmountTwd -= soldCostTwd;
          state.shares -= sellShares;
          state.realizedPnlTwdToday += realizedPnlTwd;
          state.cumulativeRealizedPnlTwd += realizedPnlTwd;

          if (state.shares < 0.000001) state.shares = 0;
          if (state.costAmountOriginal < 0.000001) state.costAmountOriginal = 0;
          if (state.costAmountTwd < 0.000001) state.costAmountTwd = 0;
        }

        if (side === "dividend") {
          const dividendOriginal = cashAmount - fee - tax;
          const dividendTwd = dividendOriginal * fxRate;
          state.realizedPnlTwdToday += dividendTwd;
          state.cumulativeRealizedPnlTwd += dividendTwd;
        }

        if (side === "split") {
          const splitFrom = toNumber(trade.split_from);
          const splitTo = toNumber(trade.split_to);
          if (splitFrom > 0 && splitTo > 0 && state.shares > 0) {
            const ratio = splitTo / splitFrom;
            state.shares = state.shares * ratio;
          }
        }
      }

      for (const state of states.values()) {
        const closePrice = lastCloseBySymbol.get(state.symbol);

        if (!state.hasEverAppeared && state.shares <= 0 && state.cumulativeRealizedPnlTwd === 0) {
          continue;
        }

        if (closePrice === undefined) {
          skippedRowsDueToMissingPrice += 1;
          continue;
        }

        const fxRate = state.currency === "USD" ? lastUsdTwdRate : 1;

        if (state.currency === "USD" && (!fxRate || fxRate <= 0)) {
          skippedRowsDueToMissingFx += 1;
          continue;
        }

        const avgCostOriginal = state.shares > 0 ? state.costAmountOriginal / state.shares : 0;
        const marketValueOriginal = state.shares * closePrice;
        const marketValueTwd = marketValueOriginal * (fxRate || 1);
        const unrealizedPnlTwd = marketValueTwd - state.costAmountTwd;
        const unrealizedReturnRate =
          state.costAmountTwd > 0 ? unrealizedPnlTwd / state.costAmountTwd : null;

        outputRows.push({
          position_date: date,
          market: state.market,
          symbol: state.symbol,
          stock_name: state.stockName,
          currency: state.currency,
          shares: round6(state.shares),
          avg_cost: round6(avgCostOriginal),
          cost_amount_original: round6(state.costAmountOriginal),
          cost_amount_twd: round6(state.costAmountTwd),
          close_price: closePrice,
          yahoo_symbol: yahooSymbolBySymbol.get(state.symbol) || null,
          fx_rate: fxRate || 1,
          market_value_original: round6(marketValueOriginal),
          market_value_twd: round6(marketValueTwd),
          unrealized_pnl_twd: round6(unrealizedPnlTwd),
          unrealized_return_rate:
            unrealizedReturnRate === null ? null : round6(unrealizedReturnRate),
          realized_pnl_twd: round6(state.realizedPnlTwdToday),
          cumulative_realized_pnl_twd: round6(state.cumulativeRealizedPnlTwd),
          source: "calculated",
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (!dryRun) {
      if (clearExisting) {
        let deleteQuery = supabase
          .from("daily_stock_positions")
          .delete()
          .gte("position_date", startDate)
          .lte("position_date", endDate);

        if (onlySymbol) deleteQuery = deleteQuery.eq("symbol", onlySymbol);

        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;
      }

      const chunkSize = 500;
      for (let index = 0; index < outputRows.length; index += chunkSize) {
        const chunk = outputRows.slice(index, index + chunkSize);
        const { error: upsertError } = await supabase
          .from("daily_stock_positions")
          .upsert(chunk, {
            onConflict: "position_date,symbol",
          });

        if (upsertError) throw upsertError;
      }
    }

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      startDate,
      endDate,
      dryRun,
      clearExisting,
      symbolsCount: symbols.length,
      tradesCount: trades.length,
      pricesCount: prices.length,
      fxRatesCount: fxRates.length,
      generatedRows: outputRows.length,
      insertedRows: dryRun ? 0 : outputRows.length,
      skippedRowsDueToMissingPrice,
      skippedRowsDueToMissingFx,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
