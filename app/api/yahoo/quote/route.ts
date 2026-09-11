import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const runtime = "nodejs";

const yahooFinance = new YahooFinance();

type QuoteResult = {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  marketState?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return NextResponse.json(
      {
        success: false,
        error: "symbols is required",
      },
      { status: 400 }
    );
  }

  const symbols = symbolsParam
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No valid symbols provided",
      },
      { status: 400 }
    );
  }

  try {
    const quotes = await Promise.all(
      symbols.map(async (symbol) => {
        const quote = (await yahooFinance.quote(symbol)) as QuoteResult;

        return {
          symbol: quote.symbol,
          name: quote.shortName || quote.longName || quote.symbol,
          price: quote.regularMarketPrice ?? null,
          change: quote.regularMarketChange ?? null,
          changePercent: quote.regularMarketChangePercent ?? null,
          currency: quote.currency ?? null,
          marketState: quote.marketState ?? null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: quotes.length,
      quotes,
    });
  } catch (error) {
    console.error("Yahoo Finance quote error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Yahoo Finance quote failed",
      },
      { status: 500 }
    );
  }
}