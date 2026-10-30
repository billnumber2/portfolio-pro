import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RefreshStateRow = {
  id: string;
  dirty_from_date: string | null;
  trade_change_version: number;
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

function minNullableDate(...values: Array<string | null | undefined>) {
  const valid = values.filter((value): value is string => Boolean(value));
  return valid.length > 0 ? valid.reduce((left, right) => (left <= right ? left : right)) : null;
}

function maxDate(left: string, right: string) {
  return left >= right ? left : right;
}

async function callJson(url: string) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || data?.message || `Request failed: ${url}`);
  }

  return data;
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString();

  try {
    const supabase = getSupabaseClient();
    const currentUrl = new URL(request.url);
    const origin = currentUrl.origin;
    const requestedStartDate = currentUrl.searchParams.get("start") || "2024-08-06";
    const endDate =
      currentUrl.searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const dryRun = currentUrl.searchParams.get("dryRun") === "1";
    const forceFull = currentUrl.searchParams.get("forceFull") === "1";

    assertIsoDate(requestedStartDate, "start");
    assertIsoDate(endDate, "end");

    if (requestedStartDate > endDate) {
      throw new Error("start must be on or before end.");
    }

    const { data: refreshState, error: stateError } = await supabase
      .from("portfolio_refresh_state")
      .select("id, dirty_from_date, trade_change_version")
      .eq("id", "global")
      .maybeSingle();

    if (stateError) throw stateError;
    if (!refreshState) {
      throw new Error(
        "portfolio_refresh_state is missing. Run the supplied SQL migration before using update-all."
      );
    }

    const stateAtStart = refreshState as RefreshStateRow;
    const dirtyFromDate = stateAtStart.dirty_from_date;
    const tradeChangeVersion = Number(stateAtStart.trade_change_version);
    const dirtyDateInRange =
      dirtyFromDate && dirtyFromDate <= endDate ? dirtyFromDate : null;
    const safeBaseStartDate =
      minNullableDate(requestedStartDate, dirtyDateInRange) || requestedStartDate;

    const commonMarketParams =
      `?start=${encodeURIComponent(safeBaseStartDate)}` +
      `&end=${encodeURIComponent(endDate)}` +
      (dryRun ? "&dryRun=1" : "") +
      (forceFull ? "&forceFull=1" : "");

    // These two operations are independent. In normal mode each route starts at the
    // day after its latest stored market-data date; forceFull intentionally bypasses that.
    const [fxRatesResult, syncPricesResult] = await Promise.all([
      callJson(`${origin}/api/fx/update-rates${commonMarketParams}`),
      callJson(`${origin}/api/yahoo/sync-historical-prices${commonMarketParams}`),
    ]);

    const shouldRebuildPositions = forceFull || Boolean(dirtyDateInRange);
    const rebuildPositionsResult = shouldRebuildPositions
      ? await callJson(
          `${origin}/api/portfolio/rebuild-positions${dryRun ? "?dryRun=1" : ""}`
        )
      : {
          success: true,
          skipped: true,
          skipReason: "no_trade_changes",
          mode: "full-scan-not-needed",
        };

    const { data: latestDailyRow, error: latestDailyError } = await supabase
      .from("daily_stock_positions")
      .select("position_date")
      .order("position_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestDailyError) throw latestDailyError;

    const latestDailyDate: string | null = latestDailyRow?.position_date || null;
    const missingDailyStartDate = !latestDailyDate
      ? safeBaseStartDate
      : latestDailyDate < endDate
        ? maxDate(safeBaseStartDate, addDays(latestDailyDate, 1))
        : null;
    const earliestMarketDataDate = minNullableDate(
      fxRatesResult.earliestInsertedDate,
      syncPricesResult.earliestInsertedDate
    );

    const dailyRebuildStartDate = forceFull
      ? safeBaseStartDate
      : minNullableDate(
          dirtyDateInRange,
          missingDailyStartDate,
          earliestMarketDataDate
        );

    const rebuildDailyPositionsResult =
      dailyRebuildStartDate && dailyRebuildStartDate <= endDate
        ? await callJson(
            `${origin}/api/portfolio/rebuild-daily-positions` +
              `?start=${encodeURIComponent(dailyRebuildStartDate)}` +
              `&end=${encodeURIComponent(endDate)}` +
              (dryRun ? "&dryRun=1" : "")
          )
        : {
            success: true,
            skipped: true,
            skipReason: "daily_positions_up_to_date",
          };

    let refreshStateUpdated = false;
    let dirtyStateCleared = false;
    let concurrentTradeChangeDetected = false;

    // This is deliberately the final mutation. The version predicate makes the clear
    // race-safe: if another trade changes during this run, zero rows are updated and
    // the new dirty state remains for the next run.
    if (!dryRun) {
      const canClearDirty = Boolean(dirtyDateInRange);
      const statePatch: Record<string, unknown> = {
        last_successful_refresh_at: new Date().toISOString(),
        last_refresh_from_date: dailyRebuildStartDate || endDate,
        last_refresh_to_date: endDate,
        updated_at: new Date().toISOString(),
      };

      if (!dirtyFromDate || canClearDirty) {
        statePatch.last_successful_trade_version = tradeChangeVersion;
      }

      if (canClearDirty) {
        statePatch.dirty_from_date = null;
      }

      let stateUpdateQuery = supabase
        .from("portfolio_refresh_state")
        .update(statePatch)
        .eq("id", "global")
        .eq("trade_change_version", tradeChangeVersion);

      if (canClearDirty && dirtyFromDate) {
        stateUpdateQuery = stateUpdateQuery.eq("dirty_from_date", dirtyFromDate);
      }

      const { data: updatedState, error: stateUpdateError } = await stateUpdateQuery
        .select("id, dirty_from_date, trade_change_version")
        .maybeSingle();

      if (stateUpdateError) throw stateUpdateError;

      refreshStateUpdated = Boolean(updatedState);
      dirtyStateCleared = canClearDirty && Boolean(updatedState);
      concurrentTradeChangeDetected = !updatedState;
    }

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      dryRun,
      forceFull,
      requestedStartDate,
      safeBaseStartDate,
      endDate,
      dirtyFromDateAtStart: dirtyFromDate,
      tradeChangeVersionAtStart: tradeChangeVersion,
      latestDailyDate,
      missingDailyStartDate,
      earliestMarketDataDate,
      dailyRebuildStartDate,
      refreshStateUpdated,
      dirtyStateCleared,
      concurrentTradeChangeDetected,
      message: concurrentTradeChangeDetected
        ? "Refresh completed, but a trade changed during the run. Dirty state was preserved for the next refresh."
        : "Refresh completed successfully.",
      steps: {
        fxRates: fxRatesResult,
        syncPrices: syncPricesResult,
        rebuildPositions: rebuildPositionsResult,
        rebuildDailyPositions: rebuildDailyPositionsResult,
      },
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
