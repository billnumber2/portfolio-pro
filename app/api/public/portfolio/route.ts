import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NumericLike = number | string | null | undefined;

type PerformanceRow = {
  position_date: string;
  total_cost_twd: NumericLike;
  total_market_value_twd: NumericLike;
  total_unrealized_pnl_twd: NumericLike;
  cumulative_realized_pnl_twd: NumericLike;
  total_pnl_twd: NumericLike;
  unrealized_return_rate: NumericLike;
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

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      error: "Unauthorized.",
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET(request: Request) {
  try {
    const configuredKey = process.env.PORTFOLIO_PUBLIC_API_KEY;

    if (!configuredKey) {
      return NextResponse.json(
        {
          success: false,
          error: "PORTFOLIO_PUBLIC_API_KEY is not configured.",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const requestUrl = new URL(request.url);
    const suppliedKey = requestUrl.searchParams.get("key");

    if (!suppliedKey || suppliedKey !== configuredKey) {
      return unauthorized();
    }

    const supabase = getSupabaseClient();

    const performanceResult = await supabase
      .from("daily_portfolio_performance")
      .select(
        "position_date,total_cost_twd,total_market_value_twd,total_unrealized_pnl_twd,cumulative_realized_pnl_twd,total_pnl_twd,unrealized_return_rate"
      )
      .order("position_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (performanceResult.error) {
      throw performanceResult.error;
    }

    if (!performanceResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "No portfolio performance data was found.",
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
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

    if (positionsResult.error) {
      throw positionsResult.error;
    }

    if (dailyPositionsResult.error) {
      throw dailyPositionsResult.error;
    }

    const currentPositions = (positionsResult.data || []) as PositionRow[];
    const dailyPositions =
      (dailyPositionsResult.data || []) as DailyPositionRow[];

    const dailyBySymbol = new Map(
      dailyPositions.map((position) => [position.symbol, position])
    );

    const holdings = currentPositions.map((position) => {
      const dailyPosition = dailyBySymbol.get(position.symbol);
      const market = position.market || dailyPosition?.market || "";
      const currency =
        position.currency ||
        dailyPosition?.currency ||
        (market === "US" ? "USD" : "TWD");
      const shares = toNumber(position.shares);
      const averageCost = toNumber(position.avg_cost);
      const closePrice = toNumber(dailyPosition?.close_price);
      const fxRate = currency === "USD" ? toNumber(dailyPosition?.fx_rate, 1) : 1;
      const costOriginal = shares * averageCost;
      const marketValueOriginal = shares * closePrice;
      const costTwd = costOriginal * fxRate;
      const marketValueTwd = marketValueOriginal * fxRate;
      const unrealizedPnlTwd = marketValueTwd - costTwd;
      const unrealizedReturnRate =
        costTwd > 0 ? unrealizedPnlTwd / costTwd : null;

      return {
        market,
        symbol: position.symbol,
        name:
          position.stock_name ||
          dailyPosition?.stock_name ||
          position.symbol,
        currency,
        shares: round6(shares),
        averageCost: round6(averageCost),
        latestClosePrice: round6(closePrice),
        fxRate: round6(fxRate),
        costTwd: round6(costTwd),
        marketValueTwd: round6(marketValueTwd),
        unrealizedPnlTwd: round6(unrealizedPnlTwd),
        unrealizedReturnRate:
          unrealizedReturnRate === null
            ? null
            : round6(unrealizedReturnRate),
      };
    });

    const totalHoldingValueTwd = holdings.reduce(
      (sum, holding) => sum + holding.marketValueTwd,
      0
    );

    const holdingsWithWeight = holdings
      .map((holding) => ({
        ...holding,
        weight:
          totalHoldingValueTwd > 0
            ? round6(holding.marketValueTwd / totalHoldingValueTwd)
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
    const cumulativeRealizedPnlTwd = toNumber(
      performance.cumulative_realized_pnl_twd
    );
    const totalPnlTwd = toNumber(performance.total_pnl_twd);
    const totalReturnRate =
      totalCostTwd > 0 ? totalPnlTwd / totalCostTwd : null;

    return NextResponse.json(
      {
        success: true,
        generatedAt: new Date().toISOString(),
        dataDate: performance.position_date,
        currency: "TWD",
        summary: {
          totalCostTwd: round6(totalCostTwd),
          totalMarketValueTwd: round6(totalMarketValueTwd),
          totalUnrealizedPnlTwd: round6(totalUnrealizedPnlTwd),
          cumulativeRealizedPnlTwd: round6(
            cumulativeRealizedPnlTwd
          ),
          totalPnlTwd: round6(totalPnlTwd),
          totalReturnRate:
            totalReturnRate === null ? null : round6(totalReturnRate),
          holdingsCount: holdingsWithWeight.length,
        },
        holdings: holdingsWithWeight,
        notes: [
          "This endpoint is read-only.",
          "Prices and FX rates reflect the latest completed full portfolio update.",
          "Transaction IDs, user IDs, notes, and memos are not exposed.",
        ],
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
