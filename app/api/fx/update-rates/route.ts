import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(
    supabaseUrl,
    supabaseKey
  );
}

function toUnixSeconds(dateText: string) {
  return Math.floor(
    new Date(`${dateText}T00:00:00+08:00`).getTime() /
      1000
  );
}

function unixToTaiwanDate(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);

  const taiwanTime = new Date(
    date.getTime() + 8 * 60 * 60 * 1000
  );

  return taiwanTime
    .toISOString()
    .slice(0, 10);
}

async function fetchUsdTwdRates(
  startDate: string,
  endDate: string
) {
  const period1 = toUnixSeconds(startDate);

  const period2 =
    toUnixSeconds(endDate) +
    24 * 60 * 60;

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/TWD=X` +
    `?period1=${period1}` +
    `&period2=${period2}` +
    `&interval=1d`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Yahoo FX request failed: ${response.status}`
    );
  }

  const data = await response.json();

  const result =
    data?.chart?.result?.[0];

  if (!result?.timestamp) {
    throw new Error(
      "No FX data returned from Yahoo."
    );
  }

  const timestamps =
    result.timestamp;

  const closes =
    result.indicators?.quote?.[0]?.close || [];

  return timestamps
    .map(
      (
        timestamp: number,
        index: number
      ) => {
        const rate = closes[index];

        if (
          rate === null ||
          rate === undefined
        ) {
          return null;
        }

        return {
          rate_date:
            unixToTaiwanDate(
              timestamp
            ),
          from_currency: "USD",
          to_currency: "TWD",
          rate,
          source: "yahoo",
          updated_at:
            new Date().toISOString(),
        };
      }
    )
    .filter(Boolean);
}

export async function GET(
  request: Request
) {
  try {
    const supabase =
      getSupabaseClient();

    const { searchParams } =
      new URL(request.url);

    const startDate =
      searchParams.get("start") ||
      "2024-08-06";

    const endDate =
      searchParams.get("end") ||
      new Date()
        .toISOString()
        .slice(0, 10);

    const dryRun =
      searchParams.get(
        "dryRun"
      ) === "1";

    const fxRows =
      await fetchUsdTwdRates(
        startDate,
        endDate
      );

    let insertedRows = 0;

    if (!dryRun && fxRows.length > 0) {
      const { error } =
        await supabase
          .from(
            "historical_fx_rates"
          )
          .upsert(fxRows, {
            onConflict:
              "rate_date,from_currency,to_currency",
          });

      if (error) {
        throw error;
      }

      insertedRows =
        fxRows.length;
    }

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      dryRun,
      fetchedRows:
        fxRows.length,
      insertedRows,
      latestRate:
        fxRows[
          fxRows.length - 1
        ] || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          String(error),
      },
      {
        status: 500,
      }
    );
  }
}