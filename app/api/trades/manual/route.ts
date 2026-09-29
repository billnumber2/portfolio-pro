import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ManualTradePayload = {
  id?: string;
  trade_date?: string;
  market?: string;
  symbol?: string;
  stock_name?: string;
  side?: string;
  shares?: string | number;
  price?: string | number;
  cash_amount?: string | number;
  fee?: string | number;
  tax?: string | number;
  exchange_rate?: string | number;
  split_from?: string | number;
  split_to?: string | number;
  memo?: string;
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

function toNumber(value: unknown, fallback = 0) {
  if (value === "" || value === null || value === undefined) {
    return fallback;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeSymbol(value: unknown) {
  return normalizeText(value).toUpperCase();
}

function getCurrency(market: string) {
  return market === "US" ? "USD" : "TWD";
}

function getYahooSymbol(market: string, symbol: string) {
  return market === "TW" ? `${symbol}.TW` : symbol;
}

function buildPayload(body: ManualTradePayload) {
  const tradeDate = normalizeText(body.trade_date);
  const market = normalizeText(body.market || "US").toUpperCase();
  const symbol = normalizeSymbol(body.symbol);
  const stockName = normalizeText(body.stock_name) || symbol;
  const side = normalizeText(body.side || "buy").toLowerCase();
  const currency = getCurrency(market);

  if (!tradeDate) throw new Error("trade_date is required.");
  if (!symbol) throw new Error("symbol is required.");

  if (!market || !["US", "TW"].includes(market)) {
    throw new Error("market must be US or TW.");
  }

  if (!["buy", "sell", "dividend", "split"].includes(side)) {
    throw new Error(
      "side must be buy, sell, dividend, or split."
    );
  }

  return {
    tradePayload: {
      trade_date: tradeDate,
      market,
      symbol,
      stock_name: stockName,
      side,
      shares: toNumber(body.shares, 0),
      price: toNumber(body.price, 0),
      cash_amount: toNumber(body.cash_amount, 0),
      currency,
      fee: toNumber(body.fee, 0),
      tax: toNumber(body.tax, 0),
      exchange_rate:
        market === "TW"
          ? 1
          : toNumber(body.exchange_rate, 1),
      split_from: toNumber(body.split_from, 0),
      split_to: toNumber(body.split_to, 0),
      memo: normalizeText(body.memo) || "manual",
    },

    stockMasterPayload: {
      symbol,
      stock_name: stockName,
      market,
      yahoo_symbol: getYahooSymbol(
        market,
        symbol
      ),
      sector: null,
      asset_type: "stock",
    },
  };
}

async function upsertStockMaster(
  supabase: any,
  stockMasterPayload: any
) {
  const { error } = await supabase
    .from("stock_master")
    .upsert(stockMasterPayload, {
      onConflict: "symbol",
    });

  if (error) throw error;
}

async function findDuplicateTrade(
  supabase: any,
  tradePayload: any,
  excludeId?: string
) {
  let query = supabase
    .from("trades")
    .select(
      "id, trade_date, market, symbol, side, shares, price"
    )
    .eq("trade_date", tradePayload.trade_date)
    .eq("market", tradePayload.market)
    .eq("symbol", tradePayload.symbol)
    .eq("side", tradePayload.side)
    .eq("shares", tradePayload.shares)
    .eq("price", tradePayload.price)
    .limit(1);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data?.[0] || null;
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();

    const { searchParams } = new URL(request.url);

    const limit = Math.min(
      Number(searchParams.get("limit") || 50),
      500
    );

    const symbol = normalizeSymbol(
      searchParams.get("symbol")
    );

    const memo = normalizeText(
      searchParams.get("memo")
    );

    let query = supabase
      .from("trades")
      .select(
        "id, trade_date, market, symbol, stock_name, side, shares, price, cash_amount, currency, fee, tax, exchange_rate, split_from, split_to, memo, created_at"
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(limit);

    if (symbol) {
      query = query.eq("symbol", symbol);
    }

    if (memo) {
      query = query.eq("memo", memo);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      trades: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || String(error),
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as ManualTradePayload;

    const supabase = getSupabaseClient();

    const {
      tradePayload,
      stockMasterPayload,
    } = buildPayload(body);

    const duplicate =
      await findDuplicateTrade(
        supabase,
        tradePayload
      );

    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Duplicate trade detected. Please review recent 50 trades before inserting again.",
          duplicate,
        },
        { status: 409 }
      );
    }

    const {
      data: insertedTrade,
      error: insertError,
    } = await supabase
      .from("trades")
      .insert(tradePayload)
      .select(
        "id, trade_date, market, symbol, side, shares, price"
      )
      .single();

    if (insertError) throw insertError;

    await upsertStockMaster(
      supabase,
      stockMasterPayload
    );

    return NextResponse.json({
      success: true,
      trade: insertedTrade,
      stockMaster: stockMasterPayload,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || String(error),
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body =
      (await request.json()) as ManualTradePayload;

    const id = normalizeText(body.id);

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "id is required.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const {
      tradePayload,
      stockMasterPayload,
    } = buildPayload(body);

    const duplicate =
      await findDuplicateTrade(
        supabase,
        tradePayload,
        id
      );

    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Duplicate trade detected. Please review recent 50 trades before updating.",
          duplicate,
        },
        { status: 409 }
      );
    }

    const {
      data: updatedTrade,
      error: updateError,
    } = await supabase
      .from("trades")
      .update(tradePayload)
      .eq("id", id)
      .select(
        "id, trade_date, market, symbol, side, shares, price"
      )
      .single();

    if (updateError) throw updateError;

    await upsertStockMaster(
      supabase,
      stockMasterPayload
    );

    return NextResponse.json({
      success: true,
      trade: updatedTrade,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || String(error),
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getSupabaseClient();

    const { searchParams } = new URL(
      request.url
    );

    const id = normalizeText(
      searchParams.get("id")
    );

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "id is required.",
        },
        { status: 400 }
      );
    }

    const {
      data: deletedTrade,
      error: deleteError,
    } = await supabase
      .from("trades")
      .delete()
      .eq("id", id)
      .select(
        "id, trade_date, market, symbol, side, shares, price"
      )
      .single();

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      trade: deletedTrade,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || String(error),
      },
      {
        status: 500,
      }
    );
  }
}