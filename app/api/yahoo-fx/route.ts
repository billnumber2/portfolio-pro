import { NextResponse } from "next/server";

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

async function lookupFxRate(symbol = "USDTWD=X") {
  const normalizedSymbol = String(symbol || "USDTWD=X").trim().toUpperCase();

  const quoteData =
    (await tryFetchJson(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(normalizedSymbol)}`
    )) ||
    (await tryFetchJson(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(normalizedSymbol)}`
    ));

  const quote = quoteData?.quoteResponse?.result?.[0];
  const quoteRate = Number(
    quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.preMarketPrice ?? quote?.bid ?? 0
  );

  if (quoteRate > 0) {
    return {
      symbol: normalizedSymbol,
      rate: quoteRate,
      currency: quote?.currency || "TWD",
      source: "Yahoo Finance quote endpoint",
    };
  }

  const chartData =
    (await tryFetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?range=5d&interval=1d`
    )) ||
    (await tryFetchJson(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?range=5d&interval=1d`
    ));

  const result = chartData?.chart?.result?.[0];
  const meta = result?.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const lastClose = [...closes].reverse().find((v) => Number(v) > 0);
  const chartRate = Number(meta?.regularMarketPrice ?? meta?.previousClose ?? lastClose ?? 0);

  if (chartRate > 0) {
    return {
      symbol: normalizedSymbol,
      rate: chartRate,
      currency: meta?.currency || "TWD",
      source: "Yahoo Finance chart endpoint",
    };
  }

  return {
    symbol: normalizedSymbol,
    rate: null,
    currency: "TWD",
    source: "none",
    error: "Yahoo Finance did not return a valid FX rate",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "USDTWD=X";
  const result = await lookupFxRate(symbol);
  return NextResponse.json(result);
}
