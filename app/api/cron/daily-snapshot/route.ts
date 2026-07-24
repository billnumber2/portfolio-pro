import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Market = "TW" | "US";
type PositionRow = {
  id: string;
  user_id: string;
  market: Market;
  symbol: string;
  shares: number;
  avg_cost: number;
  current_price?: number;
  currency?: string;
};

type PriceResult = {
  price: number | null;
  currency?: string;
  yahooSymbol?: string;
  source?: string;
  error?: string;
};

function getTaiwanDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeSymbol(symbol: string) {
  return String(symbol || "").trim().toUpperCase();
}

async function tryFetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

async function lookupFxRate() {
  const symbol = "USDTWD=X";

  const quoteData =
    (await tryFetchJson(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`
    )) ||
    (await tryFetchJson(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`
    ));

  const quote = quoteData?.quoteResponse?.result?.[0];
  const quoteRate = Number(
    quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.preMarketPrice ?? quote?.bid ?? 0
  );
  if (quoteRate > 0) return quoteRate;

  const chartData =
    (await tryFetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`
    )) ||
    (await tryFetchJson(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`
    ));

  const result = chartData?.chart?.result?.[0];
  const meta = result?.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const lastClose = [...closes].reverse().find((v) => Number(v) > 0);
  const chartRate = Number(meta?.regularMarketPrice ?? meta?.previousClose ?? lastClose ?? 0);

  return chartRate > 0 ? chartRate : 32.2;
}

function candidateYahooSymbols(position: Pick<PositionRow, "market" | "symbol">) {
  const symbol = normalizeSymbol(position.symbol);
  if (!symbol) return [];
  if (position.market === "US") return [symbol];
  return [`${symbol}.TW`, `${symbol}.TWO`, symbol];
}

async function lookupPrice(
  position: Pick<PositionRow, "market" | "symbol" | "current_price">
): Promise<PriceResult> {
  const candidates = candidateYahooSymbols(position);

  for (const yahooSymbol of candidates) {
    const quoteData =
      (await tryFetchJson(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`
      )) ||
      (await tryFetchJson(
        `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`
      ));

    const quote = quoteData?.quoteResponse?.result?.[0];
    const quotePrice = Number(
      quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.preMarketPrice ?? 0
    );

    if (quotePrice > 0) {
      return {
        price: quotePrice,
        currency: quote?.currency || "",
        yahooSymbol,
        source: "quote",
      };
    }

    const chartData =
      (await tryFetchJson(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`
      )) ||
      (await tryFetchJson(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`
      ));

    const result = chartData?.chart?.result?.[0];
    const meta = result?.meta || {};
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const lastClose = [...closes].reverse().find((v) => Number(v) > 0);
    const chartPrice = Number(meta?.regularMarketPrice ?? meta?.previousClose ?? lastClose ?? 0);

    if (chartPrice > 0) {
      return {
        price: chartPrice,
        currency: meta?.currency || "",
        yahooSymbol,
        source: "chart",
      };
    }
  }

  const fallback = Number(position.current_price || 0);
  return {
    price: fallback > 0 ? fallback : null,
    source: "fallback-current-price",
    error: "Yahoo lookup failed",
  };
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase environment variables" },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const snapshotDate = getTaiwanDateString();
  const fxRate = await lookupFxRate();

  const { data: positions, error } = await admin
    .from("positions")
    .select("id,user_id,market,symbol,shares,avg_cost,current_price,currency")
    .gt("shares", 0);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grouped = new Map<string, PositionRow[]>();
  for (const row of (positions || []) as PositionRow[]) {
    if (!row.user_id) continue;
    grouped.set(row.user_id, [...(grouped.get(row.user_id) || []), row]);
  }

  const snapshotRows = [];
  const priceUpdates = [];

  for (const [userId, rows] of grouped.entries()) {
    let totalMarketValueTwd = 0;
    let totalCostTwd = 0;

    for (const row of rows) {
      const priceResult = await lookupPrice(row);
      const currentPrice = Number(priceResult.price || row.current_price || 0);
      const shares = Number(row.shares || 0);
      const avgCost = Number(row.avg_cost || 0);
      const rowFx = row.market === "US" || row.currency === "USD" ? fxRate : 1;

      totalMarketValueTwd += shares * currentPrice * rowFx;
      totalCostTwd += shares * avgCost * rowFx;

      if (currentPrice > 0 && currentPrice !== Number(row.current_price || 0)) {
        priceUpdates.push({
          id: row.id,
          current_price: currentPrice,
          updated_at: new Date().toISOString(),
        });
      }
    }

    snapshotRows.push({
      user_id: userId,
      snapshot_date: snapshotDate,
      total_market_value_twd: Number(totalMarketValueTwd.toFixed(2)),
      total_cost_twd: Number(totalCostTwd.toFixed(2)),
      unrealized_pnl_twd: Number((totalMarketValueTwd - totalCostTwd).toFixed(2)),
      position_count: rows.length,
      updated_at: new Date().toISOString(),
    });
  }

  for (const update of priceUpdates) {
    await admin
      .from("positions")
      .update({ current_price: update.current_price, updated_at: update.updated_at })
      .eq("id", update.id);
  }

  if (snapshotRows.length > 0) {
    const { error: upsertError } = await admin
      .from("daily_portfolio_snapshots")
      .upsert(snapshotRows, { onConflict: "user_id,snapshot_date" });

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    snapshotDate,
    fxRate,
    users: snapshotRows.length,
    priceUpdates: priceUpdates.length,
  });
}
