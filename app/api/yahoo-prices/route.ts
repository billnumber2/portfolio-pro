import { NextResponse } from "next/server";

type Market = "TW" | "US";
type IncomingPosition = { id: string; market: Market; symbol: string };
type PriceResult = { symbol: string; yahooSymbol: string; price: number | null; currency?: string; source: string; error?: string };

function normalizeSymbol(symbol: string) {
  return String(symbol || "").trim().toUpperCase();
}

function candidateYahooSymbols(position: IncomingPosition) {
  const symbol = normalizeSymbol(position.symbol);
  if (!symbol) return [];
  if (position.market === "US") return [symbol];
  return [`${symbol}.TW`, `${symbol}.TWO`, symbol];
}

async function tryFetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

async function lookupByQuoteEndpoint(yahooSymbol: string) {
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`,
  ];

  for (const url of urls) {
    const data = await tryFetchJson(url);
    const quote = data?.quoteResponse?.result?.[0];
    const price = Number(quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.preMarketPrice ?? quote?.bid ?? 0);
    if (price > 0) return { price, currency: quote?.currency || "", source: "Yahoo Finance quote endpoint" };
  }
  return null;
}

async function lookupByChartEndpoint(yahooSymbol: string) {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`,
  ];

  for (const url of urls) {
    const data = await tryFetchJson(url);
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const lastClose = [...closes].reverse().find((v) => Number(v) > 0);
    const price = Number(meta?.regularMarketPrice ?? meta?.previousClose ?? lastClose ?? 0);
    if (price > 0) return { price, currency: meta?.currency || "", source: "Yahoo Finance chart endpoint" };
  }
  return null;
}

async function lookupPrice(position: IncomingPosition): Promise<PriceResult> {
  const candidates = candidateYahooSymbols(position);
  for (const yahooSymbol of candidates) {
    const quote = await lookupByQuoteEndpoint(yahooSymbol);
    if (quote) return { symbol: position.symbol, yahooSymbol, price: quote.price, currency: quote.currency, source: quote.source };
    const chart = await lookupByChartEndpoint(yahooSymbol);
    if (chart) return { symbol: position.symbol, yahooSymbol, price: chart.price, currency: chart.currency, source: chart.source };
  }
  return { symbol: position.symbol, yahooSymbol: candidates[0] || position.symbol, price: null, source: "none", error: "Yahoo Finance did not return a valid price" };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const positions = (body?.positions || []) as IncomingPosition[];
    if (!Array.isArray(positions) || positions.length === 0) return NextResponse.json({ prices: {}, error: "positions is required" }, { status: 400 });
    const prices: Record<string, PriceResult> = {};
    for (const position of positions) {
      if (!position?.id || !position?.symbol) continue;
      prices[position.id] = await lookupPrice(position);
    }
    return NextResponse.json({ prices });
  } catch (error: any) {
    return NextResponse.json({ prices: {}, error: error?.message || "Yahoo Finance price update failed" }, { status: 200 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get("symbol") || "");
  const market = normalizeSymbol(searchParams.get("market") || "US") === "TW" ? "TW" : "US";
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  return NextResponse.json(await lookupPrice({ id: symbol, market, symbol }));
}
