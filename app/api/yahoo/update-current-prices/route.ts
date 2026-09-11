import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import YahooFinance from "yahoo-finance2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = "https://yobmyrjejrknvmkxawuf.supabase.co";
const supabaseAnonKey =
  "sb_publishable_o2tPZFOjweuKV9DnT5mBWg_cfzT7vyw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const yahooFinance = new YahooFinance();

type PositionRecord = {
  id?: string;
  symbol?: string;
};

type QuoteResult = {
  symbol?: string;
  regularMarketPrice?: number;
  currency?: string;
};

type QuoteOutput = {
  symbol: string;
  yahooSymbol: string;
  price: number | null;
  currency: string | null;
  error: string | null;
};

function isTaiwanSymbol(symbol: string) {
  return /^[0-9]{4,6}$/.test(symbol);
}

async function tryQuote(yahooSymbol: string): Promise<QuoteResult | null> {
  try {
    const quote = (await yahooFinance.quote(yahooSymbol)) as QuoteResult | undefined;

    if (!quote) {
      return null;
    }

    if (typeof quote.regularMarketPrice !== "number") {
      return null;
    }

    return quote;
  } catch {
    return null;
  }
}

async function getYahooQuoteForSymbol(symbol: string): Promise<QuoteOutput> {
  const cleanSymbol = symbol.trim();

  if (!cleanSymbol) {
    return {
      symbol,
      yahooSymbol: symbol,
      price: null,
      currency: null,
      error: "empty_symbol",
    };
  }

  if (!isTaiwanSymbol(cleanSymbol)) {
    const quote = await tryQuote(cleanSymbol);

    if (!quote) {
      return {
        symbol: cleanSymbol,
        yahooSymbol: cleanSymbol,
        price: null,
        currency: null,
        error: "quote_not_found",
      };
    }

    return {
      symbol: cleanSymbol,
      yahooSymbol: cleanSymbol,
      price: quote.regularMarketPrice ?? null,
      currency: quote.currency ?? null,
      error: null,
    };
  }

  const twSymbol = `${cleanSymbol}.TW`;
  const twQuote = await tryQuote(twSymbol);

  if (twQuote) {
    return {
      symbol: cleanSymbol,
      yahooSymbol: twSymbol,
      price: twQuote.regularMarketPrice ?? null,
      currency: twQuote.currency ?? null,
      error: null,
    };
  }

  const twoSymbol = `${cleanSymbol}.TWO`;
  const twoQuote = await tryQuote(twoSymbol);

  if (twoQuote) {
    return {
      symbol: cleanSymbol,
      yahooSymbol: twoSymbol,
      price: twoQuote.regularMarketPrice ?? null,
      currency: twoQuote.currency ?? null,
      error: null,
    };
  }

  return {
    symbol: cleanSymbol,
    yahooSymbol: `${twSymbol} / ${twoSymbol}`,
    price: null,
    currency: null,
    error: "quote_not_found_tw_or_two",
  };
}

export async function GET() {
  try {
    const positionsResult = await supabase
      .from("positions")
      .select("id, symbol");

    if (positionsResult.error) {
      return NextResponse.json(
        {
          success: false,
          version: "tw-fallback-v2",
          step: "read_positions",
          error: positionsResult.error.message,
        },
        { status: 500 }
      );
    }

    const positions = (positionsResult.data || []) as PositionRecord[];

    const symbols = Array.from(
      new Set(
        positions
          .map((position) => position.symbol)
          .filter(
            (symbol): symbol is string =>
              typeof symbol === "string" &&
              symbol.trim().length > 0
          )
          .map((symbol) => symbol.trim())
      )
    );

    if (symbols.length === 0) {
      return NextResponse.json({
        success: false,
        version: "tw-fallback-v2",
        error: "No symbols found in positions.",
      });
    }

    const quoteResults = await Promise.all(
      symbols.map((symbol) => getYahooQuoteForSymbol(symbol))
    );

    const validQuotes = quoteResults.filter(
      (quote) => typeof quote.price === "number"
    );

    const updateResults = [];

    for (const quote of validQuotes) {
      const updateResult = await supabase
        .from("positions")
        .update({
          current_price: quote.price,
        })
        .eq("symbol", quote.symbol);

      updateResults.push({
        symbol: quote.symbol,
        yahooSymbol: quote.yahooSymbol,
        price: quote.price,
        success: !updateResult.error,
        error: updateResult.error ? updateResult.error.message : null,
      });
    }

    const failedQuotes = quoteResults.filter((quote) => quote.error);
    const failedUpdates = updateResults.filter((result) => !result.success);

    return NextResponse.json({
      success: true,
      version: "tw-fallback-v2",
      totalSymbols: symbols.length,
      quotedCount: validQuotes.length,
      updatedCount: updateResults.filter((result) => result.success).length,
      failedQuoteCount: failedQuotes.length,
      failedUpdateCount: failedUpdates.length,
      quotes: quoteResults,
      updates: updateResults,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        version: "tw-fallback-v2",
        step: "unexpected_error",
        error:
          error instanceof Error
            ? error.message
            : "unknown_error",
      },
      { status: 500 }
    );
  }
}