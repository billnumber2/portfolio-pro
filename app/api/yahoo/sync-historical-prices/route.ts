import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const EPSILON = 0.000001;
const YAHOO_CONCURRENCY = 5;
const PAGE_SIZE = 1000;

type StockMasterRow = {
  symbol: string;
  stock_name: string | null;
  market: string;
  yahoo_symbol: string;
};

type TradeRow = {
  id: string;
  created_at: string | null;
  trade_date: string;
  symbol: string;
  side: string | null;
  shares: number | string | null;
  split_from: number | string | null;
  split_to: number | string | null;
};

type YahooPriceRow = {
  price_date: string;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  close_price: number;
  adjusted_close_price: number | null;
  volume: number | null;
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
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

type HoldingState = {
  currentShares: number;
  everHeld: boolean;
  lastExitDate: string | null;
  warnings: string[];
};

type SymbolResult = {
  symbol: string;
  yahooSymbol: string;
  currentShares: number;
  lastExitDate: string | null;
  latestExistingDate: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  fetchedRows: number;
  insertedRows: number;
  status: string;
  warnings: string[];
  error?: string;
};

type FetchJob = {
  index: number;
  stock: StockMasterRow;
  holding: HoldingState;
  latestExistingDate: string | null;
  effectiveStartDate: string;
  effectiveEndDate: string;
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

function normalizeSymbol(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function toNumber(value: unknown, fallback = 0) {
  if (value === "" || value === null || value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function assertIsoDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} is not a valid calendar date.`);
  }
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function maxDate(left: string, right: string) {
  return left >= right ? left : right;
}

function minNullableDate(current: string | null, candidate: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}

function maxNullableDate(current: string | null, candidate: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

function toUnixSeconds(dateText: string) {
  return Math.floor(new Date(`${dateText}T00:00:00+08:00`).getTime() / 1000);
}

function unixToTaiwanDate(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  const taiwanTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return taiwanTime.toISOString().slice(0, 10);
}

async function fetchAllPages<T>(
  createPageQuery: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: unknown;
  }>,
  pageSize = PAGE_SIZE
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await createPageQuery(from, to);

    if (error) throw error;

    const rows = (data || []) as T[];
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

function createEmptyHoldingState(): HoldingState {
  return {
    currentShares: 0,
    everHeld: false,
    lastExitDate: null,
    warnings: [],
  };
}

function calculateHoldingStates(stockRows: StockMasterRow[], trades: TradeRow[]) {
  const states = new Map<string, HoldingState>();

  for (const stock of stockRows) {
    states.set(normalizeSymbol(stock.symbol), createEmptyHoldingState());
  }

  for (const trade of trades) {
    const symbol = normalizeSymbol(trade.symbol);
    const state = states.get(symbol);
    if (!state) continue;

    const side = String(trade.side || "").trim().toLowerCase();
    const tradeDate = trade.trade_date;
    const shares = toNumber(trade.shares);
    const sharesBefore = state.currentShares;

    if (side === "buy") {
      if (shares <= EPSILON) {
        state.warnings.push(
          `${tradeDate}: buy shares ${shares} is not greater than EPSILON and was ignored.`
        );
        continue;
      }

      state.currentShares += shares;
      if (state.currentShares > EPSILON) {
        state.everHeld = true;
      }
      continue;
    }

    if (side === "sell") {
      if (shares <= EPSILON) {
        state.warnings.push(
          `${tradeDate}: sell shares ${shares} is not greater than EPSILON and was ignored.`
        );
        continue;
      }

      if (shares > sharesBefore + EPSILON) {
        state.warnings.push(
          `${tradeDate}: sell shares ${shares} exceeded available shares ${round6(
            sharesBefore
          )}; current shares were clamped to zero.`
        );
        state.currentShares = 0;
      } else {
        state.currentShares = sharesBefore - shares;
        if (state.currentShares <= EPSILON) {
          state.currentShares = 0;
        }
      }

      if (sharesBefore > EPSILON && state.currentShares <= EPSILON) {
        state.lastExitDate = tradeDate;
      }
      continue;
    }

    if (side === "split") {
      const splitFrom = toNumber(trade.split_from);
      const splitTo = toNumber(trade.split_to);

      if (splitFrom <= EPSILON || splitTo <= EPSILON) {
        state.warnings.push(
          `${tradeDate}: invalid split ratio ${splitFrom}:${splitTo}; split was ignored.`
        );
        continue;
      }

      if (state.currentShares > EPSILON) {
        state.currentShares *= splitTo / splitFrom;
        if (state.currentShares <= EPSILON) {
          state.currentShares = 0;
          state.lastExitDate = tradeDate;
        } else {
          state.everHeld = true;
        }
      }
    }
  }

  for (const state of states.values()) {
    state.currentShares = state.currentShares > EPSILON ? round6(state.currentShares) : 0;
  }

  return states;
}

async function fetchYahooHistoricalPrices(
  yahooSymbol: string,
  startDate: string,
  endDate: string
): Promise<YahooPriceRow[]> {
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
  const chartError = data.chart?.error;

  if (chartError) {
    throw new Error(
      `Yahoo error for ${yahooSymbol}: ${
        chartError.description || chartError.code || "unknown error"
      }`
    );
  }

  const result = data.chart?.result?.[0];

  // A valid date range can contain no trading day. Treat an empty Yahoo result as
  // a successful zero-row response so update-all is not broken by weekends/holidays.
  if (!result?.timestamp || !result.indicators?.quote?.[0]) {
    return [];
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const adjclose = result.indicators.adjclose?.[0]?.adjclose || [];

  return timestamps
    .map((timestamp, index): YahooPriceRow | null => {
      const close = quote.close?.[index];

      if (close === null || close === undefined || !Number.isFinite(Number(close))) {
        return null;
      }

      return {
        price_date: unixToTaiwanDate(timestamp),
        open_price: quote.open?.[index] ?? null,
        high_price: quote.high?.[index] ?? null,
        low_price: quote.low?.[index] ?? null,
        close_price: Number(close),
        adjusted_close_price: adjclose[index] ?? null,
        volume: quote.volume?.[index] ?? null,
      };
    })
    .filter((row: YahooPriceRow | null): row is YahooPriceRow => row !== null);
}

async function runWithBoundedConcurrency<T>(
  jobs: T[],
  concurrency: number,
  worker: (job: T) => Promise<void>
) {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), jobs.length);

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= jobs.length) return;
      await worker(jobs[index]);
    }
  }

  const workers = Array.from({ length: workerCount }, () => runWorker());
  await Promise.all(workers);
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString();

  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("start") || "2024-08-06";
    const endDate = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const onlySymbol = normalizeSymbol(searchParams.get("symbol")) || null;
    const dryRun = searchParams.get("dryRun") === "1";
    const forceFull = searchParams.get("forceFull") === "1";

    assertIsoDate(startDate, "start");
    assertIsoDate(endDate, "end");

    if (startDate > endDate) {
      throw new Error("start must be on or before end.");
    }

    let stockQuery = supabase
      .from("stock_master")
      .select("symbol, stock_name, market, yahoo_symbol")
      .order("symbol", { ascending: true });

    if (onlySymbol) {
      stockQuery = stockQuery.eq("symbol", onlySymbol);
    }

    const { data: stocks, error: stockError } = await stockQuery;

    if (stockError) throw stockError;

    const stockRows = (stocks || []) as StockMasterRow[];

    if (stockRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No stocks found in stock_master.",
          error: "No stocks found in stock_master.",
          startedAt,
          finishedAt: new Date().toISOString(),
          startDate,
          endDate,
          onlySymbol,
          forceFull,
          dryRun,
          symbolsCount: 0,
          symbolsInMaster: 0,
          currentlyHeld: 0,
          exitedAndSkipped: 0,
          neverHeldAndSkipped: 0,
          symbolsFetched: 0,
          concurrency: YAHOO_CONCURRENCY,
          totalFetchedRows: 0,
          totalInsertedRows: 0,
          earliestInsertedDate: null,
          latestInsertedDate: null,
          failedCount: 0,
          results: [],
        },
        { status: 404 }
      );
    }

    const masterSymbols = stockRows.map((stock) => normalizeSymbol(stock.symbol));
    const trades = await fetchAllPages<TradeRow>((from, to) =>
      supabase
        .from("trades")
        .select("id, created_at, trade_date, symbol, side, shares, split_from, split_to")
        .in("symbol", masterSymbols)
        .order("trade_date", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    );

    const holdingStates = calculateHoldingStates(stockRows, trades);
    const results: Array<SymbolResult | undefined> = new Array(stockRows.length);
    const jobs: FetchJob[] = [];

    let currentlyHeld = 0;
    let exitedAndSkipped = 0;
    let neverHeldAndSkipped = 0;

    for (let index = 0; index < stockRows.length; index += 1) {
      const stock = stockRows[index];
      const symbol = normalizeSymbol(stock.symbol);
      const holding = holdingStates.get(symbol) || createEmptyHoldingState();
      const isCurrentlyHeld = holding.currentShares > EPSILON;

      if (isCurrentlyHeld) currentlyHeld += 1;

      const { data: latestPrice, error: latestPriceError } = await supabase
        .from("historical_prices")
        .select("price_date")
        .eq("symbol", stock.symbol)
        .order("price_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestPriceError) throw latestPriceError;

      const latestExistingDate = latestPrice?.price_date || null;

      if (!holding.everHeld) {
        neverHeldAndSkipped += 1;
        results[index] = {
          symbol: stock.symbol,
          yahooSymbol: stock.yahoo_symbol,
          currentShares: holding.currentShares,
          lastExitDate: holding.lastExitDate,
          latestExistingDate,
          effectiveStartDate: null,
          effectiveEndDate: null,
          fetchedRows: 0,
          insertedRows: 0,
          status: "never_held_skipped",
          warnings: holding.warnings,
        };
        continue;
      }

      const effectiveEndDate = isCurrentlyHeld ? endDate : holding.lastExitDate;

      if (!effectiveEndDate) {
        exitedAndSkipped += 1;
        results[index] = {
          symbol: stock.symbol,
          yahooSymbol: stock.yahoo_symbol,
          currentShares: holding.currentShares,
          lastExitDate: holding.lastExitDate,
          latestExistingDate,
          effectiveStartDate: null,
          effectiveEndDate: null,
          fetchedRows: 0,
          insertedRows: 0,
          status: "no_sync_end_date_skipped",
          warnings: [
            ...holding.warnings,
            "The symbol was held previously but no complete exit date could be derived.",
          ],
        };
        continue;
      }

      const shouldRefreshEffectiveEndDate =
        isCurrentlyHeld || holding.lastExitDate === endDate;
      const effectiveStartDate = latestExistingDate
        ? shouldRefreshEffectiveEndDate && latestExistingDate >= effectiveEndDate
          ? effectiveEndDate
          : maxDate(startDate, addDays(latestExistingDate, 1))
        : startDate;

      if (effectiveStartDate > effectiveEndDate) {
        if (!isCurrentlyHeld) exitedAndSkipped += 1;

        results[index] = {
          symbol: stock.symbol,
          yahooSymbol: stock.yahoo_symbol,
          currentShares: holding.currentShares,
          lastExitDate: holding.lastExitDate,
          latestExistingDate,
          effectiveStartDate,
          effectiveEndDate,
          fetchedRows: 0,
          insertedRows: 0,
          status: isCurrentlyHeld ? "up_to_date" : "exited_history_complete_skipped",
          warnings: holding.warnings,
        };
        continue;
      }

      if (!stock.yahoo_symbol) {
        results[index] = {
          symbol: stock.symbol,
          yahooSymbol: stock.yahoo_symbol,
          currentShares: holding.currentShares,
          lastExitDate: holding.lastExitDate,
          latestExistingDate,
          effectiveStartDate,
          effectiveEndDate,
          fetchedRows: 0,
          insertedRows: 0,
          status: "failed",
          warnings: holding.warnings,
          error: `Missing yahoo_symbol for ${stock.symbol}.`,
        };
        continue;
      }

      const jobWarnings = [...holding.warnings];
      if (forceFull && latestExistingDate) {
        jobWarnings.push(
          isCurrentlyHeld
            ? "forceFull was accepted for API compatibility; existing history is preserved and the requested end date is refreshed for the currently held symbol."
            : "forceFull was accepted for API compatibility; existing history is preserved and the exited symbol remains capped at its last exit date."
        );
      }

      jobs.push({
        index,
        stock,
        holding: {
          ...holding,
          warnings: jobWarnings,
        },
        latestExistingDate,
        effectiveStartDate,
        effectiveEndDate,
      });
    }

    let totalFetchedRows = 0;
    let totalInsertedRows = 0;
    let earliestInsertedDate: string | null = null;
    let latestInsertedDate: string | null = null;

    await runWithBoundedConcurrency(jobs, YAHOO_CONCURRENCY, async (job) => {
      const {
        index,
        stock,
        holding,
        latestExistingDate,
        effectiveStartDate,
        effectiveEndDate,
      } = job;

      try {
        const yahooRows = await fetchYahooHistoricalPrices(
          stock.yahoo_symbol,
          effectiveStartDate,
          effectiveEndDate
        );

        const updatedAt = new Date().toISOString();
        const rowsToUpsert = yahooRows.map((row) => ({
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
          updated_at: updatedAt,
        }));

        if (!dryRun && rowsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from("historical_prices")
            .upsert(rowsToUpsert, {
              onConflict: "symbol,price_date",
            });

          if (upsertError) throw upsertError;
        }

        totalFetchedRows += yahooRows.length;
        totalInsertedRows += dryRun ? 0 : rowsToUpsert.length;

        const firstFetchedDate = yahooRows[0]?.price_date || null;
        const lastFetchedDate = yahooRows[yahooRows.length - 1]?.price_date || null;
        earliestInsertedDate = minNullableDate(earliestInsertedDate, firstFetchedDate);
        latestInsertedDate = maxNullableDate(latestInsertedDate, lastFetchedDate);

        const warnings = [...holding.warnings];
        if (yahooRows.length === 0) {
          warnings.push(
            `Yahoo returned no price rows for ${effectiveStartDate} through ${effectiveEndDate}; the range may contain only non-trading days.`
          );
        }

        results[index] = {
          symbol: stock.symbol,
          yahooSymbol: stock.yahoo_symbol,
          currentShares: holding.currentShares,
          lastExitDate: holding.lastExitDate,
          latestExistingDate,
          effectiveStartDate,
          effectiveEndDate,
          fetchedRows: yahooRows.length,
          insertedRows: dryRun ? 0 : rowsToUpsert.length,
          status:
            yahooRows.length === 0
              ? "yahoo_no_data"
              : dryRun
                ? "dry_run_ok"
                : "ok",
          warnings,
        };
      } catch (error: any) {
        results[index] = {
          symbol: stock.symbol,
          yahooSymbol: stock.yahoo_symbol,
          currentShares: holding.currentShares,
          lastExitDate: holding.lastExitDate,
          latestExistingDate,
          effectiveStartDate,
          effectiveEndDate,
          fetchedRows: 0,
          insertedRows: 0,
          status: "failed",
          warnings: holding.warnings,
          error: error?.message || String(error),
        };
      }
    });

    const completedResults = results.filter(
      (result): result is SymbolResult => result !== undefined
    );
    const failedCount = completedResults.filter((item) => item.status === "failed").length;

    return NextResponse.json(
      {
        success: failedCount === 0,
        error:
          failedCount === 0
            ? undefined
            : `${failedCount} symbol(s) failed during historical price sync.`,
        startedAt,
        finishedAt: new Date().toISOString(),
        startDate,
        endDate,
        onlySymbol,
        forceFull,
        dryRun,
        symbolsCount: stockRows.length,
        symbolsInMaster: stockRows.length,
        currentlyHeld,
        exitedAndSkipped,
        neverHeldAndSkipped,
        symbolsFetched: jobs.length,
        concurrency: YAHOO_CONCURRENCY,
        totalFetchedRows,
        totalInsertedRows,
        earliestInsertedDate,
        latestInsertedDate,
        failedCount,
        results: completedResults,
      },
      { status: failedCount === 0 ? 200 : 502 }
    );
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
