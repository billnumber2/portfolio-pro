import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = String(searchParams.get("symbol") || "").trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      symbol
    )}?modules=assetProfile`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return NextResponse.json({
        symbol,
        sector: "",
        industry: "",
        error: `Yahoo Finance response ${response.status}`,
      });
    }

    const data = await response.json();
    const profile = data?.quoteSummary?.result?.[0]?.assetProfile || {};

    return NextResponse.json({
      symbol,
      sector: profile.sector || "",
      industry: profile.industry || "",
    });
  } catch (error: any) {
    return NextResponse.json({
      symbol,
      sector: "",
      industry: "",
      error: error?.message || "Yahoo Finance lookup failed",
    });
  }
}
