import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type FxRateRow = {
  rate_date: string;
  from_currency: "USD";
  to_currency: "TWD";
  rate: number;
  source: "yahoo";
  updated_at: string;
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

function assertIsoDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format.`);
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

function toUnixSeconds(dateText: string) {
  return Math.floor(new Date(`${dateText}T00:00:00+08:00`).getTime() / 1000);
}

function unixToTaiwanDate(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  const taiwanTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return taiwanTime.toISOString().slice(0, 10);
}

async function fetchUsdTwdRates(startDate: string, endDate: string): Promise<FxRateRow[]> {
  const period1 = toUnixSeconds(startDate);
  const period2 = toUnixSeconds(endDate) + 24 * 60 * 60;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/TWD=X` +
    `?period1=${period1}&period2=${period2}&interval=1d`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Yahoo FX request failed: ${response.status}`);
  }

  const data = await response.json();
  const chartError = data?.chart?.error;
  const result = data?.chart?.result?.[0];

  if (chartError) {
    throw new Error(`Yahoo FX error: ${chartError?.description || JSON.stringify(chartError)}`);
  }

  // A weekend- or holiday-only tail is a valid empty result, not a failed refresh.
  if (!result?.timestamp) {
    return [];
  }

  const timestamps: number[] = result.timestamp;
  const closes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
  const updatedAt = new Date().toISOString();

  return timestamps
    .map((timestamp: number, index: number): FxRateRow | null => {
      const rate = closes[index];

      if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) {
        return null;
      }

      return {
        rate_date: unixToTaiwanDate(timestamp),
        from_currency: "USD",
        to_currency: "TWD",
        rate: Number(rate),
        source: "yahoo",
        updated_at: updatedAt,
      };
    })
    .filter((row: FxRateRow | null): row is FxRateRow => row !== null);
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString();

  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const requestedStartDate = searchParams.get("start") || "2024-08-06";
    const endDate = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const dryRun = searchParams.get("dryRun") === "1";
    const forceFull = searchParams.get("forceFull") === "1";

    assertIsoDate(requestedStartDate, "start");
    assertIsoDate(endDate, "end");

    if (requestedStartDate > endDate) {
      throw new Error("start must be on or before end.");
    }

    let latestExistingDate: string | null = null;
    let effectiveStartDate = requestedStartDate;

    if (!forceFull) {
      const { data: latestRow, error: latestError } = await supabase
        .from("historical_fx_rates")
        .select("rate_date")
        .eq("from_currency", "USD")
        .eq("to_currency", "TWD")
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;

      latestExistingDate = latestRow?.rate_date || null;
      if (latestExistingDate) {
        effectiveStartDate = maxDate(requestedStartDate, addDays(latestExistingDate, 1));
      }
    }

    if (effectiveStartDate > endDate) {
      return NextResponse.json({
        success: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        requestedStartDate,
        effectiveStartDate: null,
        endDate,
        latestExistingDate,
        forceFull,
        dryRun,
        skipped: true,
        skipReason: "up_to_date",
        fetchedRows: 0,
        insertedRows: 0,
        earliestInsertedDate: null,
        latestInsertedDate: null,
        latestRate: null,
      });
    }

    const fxRows = await fetchUsdTwdRates(effectiveStartDate, endDate);
    let insertedRows = 0;

    if (!dryRun && fxRows.length > 0) {
      const { error } = await supabase
        .from("historical_fx_rates")
        .upsert(fxRows, {
          onConflict: "rate_date,from_currency,to_currency",
        });

      if (error) throw error;
      insertedRows = fxRows.length;
    }

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      requestedStartDate,
      effectiveStartDate,
      endDate,
      latestExistingDate,
      forceFull,
      dryRun,
      skipped: false,
      fetchedRows: fxRows.length,
      insertedRows,
      earliestInsertedDate: fxRows[0]?.rate_date || null,
      latestInsertedDate: fxRows[fxRows.length - 1]?.rate_date || null,
      latestRate: fxRows[fxRows.length - 1] || null,
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
