import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function callJson(url: string) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `Request failed: ${url}`);
  }

  return data;
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString();

  try {
    const currentUrl = new URL(request.url);
    const origin = currentUrl.origin;
    const startDate = currentUrl.searchParams.get("start") || "2024-08-06";
    const endDate = currentUrl.searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const dryRun = currentUrl.searchParams.get("dryRun") === "1";

    const syncPricesUrl =
      `${origin}/api/yahoo/sync-historical-prices` +
      `?start=${encodeURIComponent(startDate)}` +
      `&end=${encodeURIComponent(endDate)}` +
      (dryRun ? "&dryRun=1" : "");

    const rebuildPositionsUrl =
      `${origin}/api/portfolio/rebuild-positions` +
      (dryRun ? "?dryRun=1" : "");

    const rebuildDailyPositionsUrl =
      `${origin}/api/portfolio/rebuild-daily-positions` +
      `?start=${encodeURIComponent(startDate)}` +
      `&end=${encodeURIComponent(endDate)}` +
      (dryRun ? "&dryRun=1" : "&clear=1");

    const syncPricesResult = await callJson(syncPricesUrl);
    const rebuildPositionsResult = await callJson(rebuildPositionsUrl);
    const rebuildDailyPositionsResult = await callJson(rebuildDailyPositionsUrl);

    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      dryRun,
      startDate,
      endDate,
      steps: {
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
