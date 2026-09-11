import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type StockMasterRow = {
  symbol: string;
  stock_name: string | null;
  market: string;
  yahoo_symbol: string;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
      };
    }>;
    error?: unknown;
  };
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

function toUnixSeconds(dateText: string) {
  return Math.floor(new Date(`${dateText}T00:00:00+08:00`).getTime() / 1000);
}

function unixToTaiwanDate(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  const taiwanTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return taiwanTime.toISOString().slice(0, 10);
}

async function fetchYahooHistoricalPrices(
  yahooSymbol: string,
  startDate: string,
  endDate: string
) {
  const period1 = toUnixSeconds(startDate);
  const period2 = toUnixSeconds(endDate) + 24 * 60 * 60;

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Yahoo request failed for ${yahooSymbol}: ${response.status}`);
  }

  const data = (await response.json()) as YahooChartResponse;
  const result = data.chart?.result?.[0];

  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error(`No Yahoo historical data returned for ${yahooSymbol}`);
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const adjclose = result.indicators.adjclose?.[0]?.adjclose || [];

  return timestamps
    .map((timestamp, index) => {
      const close = quote.close?.[index];

      if (close === null || close === undefined) {
        return null;
      }

      return {
        price_date: unixToTaiwanDate(timestamp),
        open_price: quote.open?.[index] ?? null,
        high_price: quote.high?.[index] ?? null,
        low_price: quote.low?.[index] ?? null,
        close_price: close,
        adjusted_close_price: adjclose[index] ?? null,
        volume: quote.volume?.[index] ?? null,
      };
    })
    .filter(Boolean);
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString();

  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("start") || "2024-08-06";
    const endDate = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const onlySymbol = searchParams.get("symbol");
    const dryRun = searchParams.get("dryRun") === "1";

    let query = supabase
      .from("stock_master")
      .select("symbol, stock_name, market, yahoo_symbol")
      .order("symbol", { ascending: true });

    if (onlySymbol) {
      query = query.eq("symbol", onlySymbol);
    }

    const { data: stocks, error: stockError } = await query;

    if (stockError) {
      throw stockError;
    }

    const stockRows = (stocks || []) as StockMasterRow[];

    if (stockRows.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No stocks found in stock_master.",
      });
    }

    const results: Array<{
      symbol: string;
      yahooSymbol: string;
      fetchedRows: number;
      insertedRows: number;
      status: string;
      error?: string;
    }> = [];

    let totalFetchedRows = 0;
    let totalInsertedRows = 0;

    for (const stock of stockRows) {
      try {
        const yahooRows = await fetchYahooHistoricalPrices(
          stock.yahoo_symbol,
          startDate,
          endDate
        );

        totalFetchedRows += yahooRows.length;

        const rowsToUpsert = yahooRows.map((row: any) => ({
          symbol: stock.symbol,
          market: stock.market,
          yahoo_symbol: stock.yahoo_symbol,
          price_date: row.price_date,
          open_price: row.open_price,
          high_price: row.high_price,
          low_price: row.low_price,
          close_price: row.close_price,
          adjusted_close_price: row.adjusted_close_price,
          volume: row.volume,
          source: "yahoo",
          updated_at: new Date().toISOString(),
        }));

        if (!dryRun && rowsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from("historical_prices")
            .upsert(rowsToUpsert, {
              onConflict: "symbol,price_date",
            });

          if (upsertError) {
            throw upsertError;
          }

          totalInsertedRows += rowsToUpsert.length;
        }

        results.push({
          symbol: stock.symbol,
          yahooSymbol: stock.yahoo_symbol,
          fetchedRows: yahooRows.length,
          insertedRows: dryRun ? 0 : rowsToUpsert.length,
          status: dryRun ? "dry_run_ok" : "ok",
        });
      } catch (error: any) {
        results.push({
          symbol: stock.symbol,
          yahooSymbol: stock.yahoo_symbol,
          fetchedRows: 0,
          insertedRows: 0,
          status: "failed",
          error: error?.message || String(error),
        });
      }
    }

    const failedCount = results.filter((item) => item.status === "failed").length;

    return NextResponse.json({
      success: failedCount === 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      startDate,
      endDate,
      dryRun,
      symbolsCount: stockRows.length,
      totalFetchedRows,
      totalInsertedRows,
      failedCount,
      results,
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
