import { NextResponse } from "next/server";

type IncomingPosition = {
  id: string;
  market: "TW" | "US";
  symbol: string;
};

type PriceResult = {
  symbol: string;
  yahooSymbol: string;
  price: number | null;
  currency?: string;
  source: string;
  error?: string;
};

function normalizeSymbol(symbol: string) {
  return String(symbol || "").trim().toUpperCase();
}

function candidateYahooSymbols(position: IncomingPosition) {
  const symbol = normalizeSymbol(position.symbol);

  if (!symbol) return [];

  if (position.market === "US") {
    return [symbol];
  }

  // Taiwan stocks on Yahoo Finance are usually .TW for listed stocks and .TWO for OTC stocks.
  // Try .TW first, then .TWO, and finally raw symbol as a fallback.
  return [`${symbol}.TW`, `${symbol}.TWO`, symbol];
}

async function lookupByQuoteEndpoint(yahooSymbol: string) {
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`,
  ];

  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
      },
      cache: "no-store",
    });

    if (!response.ok) continue;

    const data = await response.json();
    const quote = data?.quoteResponse?.result?.[0];
    const price = Number(
      quote?.regularMarketPrice ??
        quote?.postMarketPrice ??
        quote?.preMarketPrice ??
        quote?.bid ??
        0
    );

    if (price > 0) {
      return {
        price,
        currency: quote?.currency || "",
        source: "Yahoo Finance quote endpoint",
      };
    }
  }

  return null;
}

async function lookupByChartEndpoint(yahooSymbol: string) {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`,
  ];

  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
      },
      cache: "no-store",
    });

    if (!response.ok) continue;

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    const price = Number(
      meta?.regularMarketPrice ??
        meta?.previousClose ??
        result?.indicators?.quote?.[0]?.close?.slice(-1)?.[0] ??
        0
    );

    if (price > 0) {
      return {
        price,
        currency: meta?.currency || "",
        source: "Yahoo Finance chart endpoint",
      };
    }
  }

  return null;
}

async function lookupPrice(position: IncomingPosition): Promise<PriceResult> {
  const candidates = candidateYahooSymbols(position);

  for (const yahooSymbol of candidates) {
    const quoteResult = await lookupByQuoteEndpoint(yahooSymbol);
    if (quoteResult) {
      return {
        symbol: position.symbol,
        yahooSymbol,
        price: quoteResult.price,
        currency: quoteResult.currency,
        source: quoteResult.source,
      };
    }

    const chartResult = await lookupByChartEndpoint(yahooSymbol);
    if (chartResult) {
      return {
        symbol: position.symbol,
        yahooSymbol,
        price: chartResult.price,
        currency: chartResult.currency,
        source: chartResult.source,
      };
    }
  }

  return {
    symbol: position.symbol,
    yahooSymbol: candidates[0] || position.symbol,
    price: null,
    source: "none",
    error: "Yahoo Finance did not return a valid price",
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const positions = (body?.positions || []) as IncomingPosition[];

    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ prices: {}, error: "positions is required" }, { status: 400 });
    }

    const prices: Record<string, PriceResult> = {};

    // Sequential lookup is slower but helps avoid Yahoo rate limits.
    for (const position of positions) {
      if (!position?.id || !position?.symbol) continue;
      prices[position.id] = await lookupPrice(position);
    }

    return NextResponse.json({ prices });
  } catch (error: any) {
    return NextResponse.json(
      { prices: {}, error: error?.message || "Yahoo Finance price update failed" },
      { status: 200 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get("symbol") || "");
  const market = normalizeSymbol(searchParams.get("market") || "US") === "TW" ? "TW" : "US";

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const result = await lookupPrice({ id: symbol, market, symbol });
  return NextResponse.json(result);
}
