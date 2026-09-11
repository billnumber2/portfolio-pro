import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type TradeRow = {
  trade_date: string;
  market: string | null;
  symbol: string;
  stock_name: string | null;
  side: string | null;
  shares: number | string | null;
  price: number | string | null;
  fee: number | string | null;
  tax: number | string | null;
  currency: string | null;
  split_from: number | string | null;
  split_to: number | string | null;
};

type PositionState = {
  market: string;
  symbol: string;
  stockName: string;
  currency: string;
  shares: number;
  totalCost: number;
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

function toNumber(value: unknown, fallback = 0) {
  if (value === "" || value === null || value === undefined) {
    return fallback;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
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
    const dryRun = searchParams.get("dryRun") === "1";

    const trades = await fetchAllPages<TradeRow>(
      supabase
        .from("trades")
        .select(
          "trade_date, market, symbol, stock_name, side, shares, price, fee, tax, currency, split_from, split_to"
        )
        .order("trade_date", { ascending: true })
    );

    const states = new Map<string, PositionState>();

    for (const trade of trades) {
      const symbol = String(trade.symbol || "").trim().toUpperCase();
      const market = String(trade.market || "").trim().toUpperCase();
      const side = String(trade.side || "").trim().toLowerCase();

      if (!symbol || !market) {
        continue;
      }

      const key = `${market}:${symbol}`;
      const stockName = String(trade.stock_name || symbol).trim() || symbol;
      const currency = String(
        trade.currency || (market === "US" ? "USD" : "TWD")
      ).trim();

      if (!states.has(key)) {
        states.set(key, {
          market,
          symbol,
          stockName,
          currency,
          shares: 0,
          totalCost: 0,
        });
      }

      const state = states.get(key)!;
      state.stockName = stockName || state.stockName;
      state.currency = currency || state.currency;

      const shares = toNumber(trade.shares);
      const price = toNumber(trade.price);
      const fee = toNumber(trade.fee);
      const tax = toNumber(trade.tax);

      if (side === "buy") {
        state.shares += shares;
        state.totalCost += shares * price + fee + tax;
      }

      if (side === "sell") {
        const sellShares = Math.min(shares, state.shares);
        const avgCost = state.shares > 0 ? state.totalCost / state.shares : 0;
        state.shares -= sellShares;
        state.totalCost -= avgCost * sellShares;

        if (state.shares < 0.000001) state.shares = 0;
        if (state.totalCost < 0.000001) state.totalCost = 0;
      }

      if (side === "split") {
        const splitFrom = toNumber(trade.split_from);
        const splitTo = toNumber(trade.split_to);

        if (splitFrom > 0 && splitTo > 0 && state.shares > 0) {
          state.shares = state.shares * (splitTo / splitFrom);
        }
      }
    }

    const rowsToInsert = Array.from(states.values())
      .filter((state) => state.shares > 0.000001)
      .map((state) => ({
        id: crypto.randomUUID(),
        user_id: null,
        market: state.market,
        symbol: state.symbol,
        stock_name: state.stockName,
        shares: round6(state.shares),
        avg_cost: round6(state.totalCost / state.shares),
        current_price: null,
        currency: state.currency,
        sector: null,
        note: "rebuilt from trades",
        updated_at: new Date().toISOString(),
        name: state.stockName,
      }));

    if (!dryRun) {
      const { error: deleteError } = await supabase
        .from("positions")
        .delete()
        .neq("symbol", "__never_match__");

      if (deleteError) {
        throw deleteError;
      }

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("positions")
          .insert(rowsToInsert);

        if (insertError) {
          throw insertError;
        }
      }
    }

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      dryRun,
      tradesCount: trades.length,
      positionsCount: rowsToInsert.length,
      insertedRows: dryRun ? 0 : rowsToInsert.length,
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
