import { NextResponse } from "next/server";

const FALLBACK_US_SECTOR: Record<string, { sector: string; industry: string }> = {
  AAPL: { sector: "Technology", industry: "Consumer Electronics" },
  MSFT: { sector: "Technology", industry: "Software - Infrastructure" },
  NVDA: { sector: "Technology", industry: "Semiconductors" },
  AMD: { sector: "Technology", industry: "Semiconductors" },
  INTC: { sector: "Technology", industry: "Semiconductors" },
  AVGO: { sector: "Technology", industry: "Semiconductors" },
  TSM: { sector: "Technology", industry: "Semiconductors" },
  GOOGL: { sector: "Communication Services", industry: "Internet Content & Information" },
  GOOG: { sector: "Communication Services", industry: "Internet Content & Information" },
  META: { sector: "Communication Services", industry: "Internet Content & Information" },
  AMZN: { sector: "Consumer Cyclical", industry: "Internet Retail" },
  TSLA: { sector: "Consumer Cyclical", industry: "Auto Manufacturers" },
  JPM: { sector: "Financial Services", industry: "Banks - Diversified" },
  BAC: { sector: "Financial Services", industry: "Banks - Diversified" },
  V: { sector: "Financial Services", industry: "Credit Services" },
  MA: { sector: "Financial Services", industry: "Credit Services" },
  XOM: { sector: "Energy", industry: "Oil & Gas Integrated" },
  CVX: { sector: "Energy", industry: "Oil & Gas Integrated" },
  JNJ: { sector: "Healthcare", industry: "Drug Manufacturers - General" },
  LLY: { sector: "Healthcare", industry: "Drug Manufacturers - General" },
  UNH: { sector: "Healthcare", industry: "Healthcare Plans" },
  PFE: { sector: "Healthcare", industry: "Drug Manufacturers - General" },
  KO: { sector: "Consumer Defensive", industry: "Beverages - Non-Alcoholic" },
  PEP: { sector: "Consumer Defensive", industry: "Beverages - Non-Alcoholic" },
  COST: { sector: "Consumer Defensive", industry: "Discount Stores" },
  WMT: { sector: "Consumer Defensive", industry: "Discount Stores" },
  VOO: { sector: "ETF", industry: "ETF" },
  QQQ: { sector: "ETF", industry: "ETF" },
  SPY: { sector: "ETF", industry: "ETF" },
  IVV: { sector: "ETF", industry: "ETF" },
  VTI: { sector: "ETF", industry: "ETF" },
  SCHD: { sector: "ETF", industry: "ETF" },
  DIA: { sector: "ETF", industry: "ETF" },
};

function cleanHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]*>/g, "")
    .trim();
}

async function fetchYahooQuoteSummary(symbol: string) {
  const endpoints = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile`,
  ];

  for (const url of endpoints) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
      },
      cache: "no-store",
    });

    if (!response.ok) continue;

    const data = await response.json();
    const profile = data?.quoteSummary?.result?.[0]?.assetProfile || {};
    if (profile.sector || profile.industry) {
      return {
        sector: profile.sector || "",
        industry: profile.industry || "",
        source: "Yahoo quoteSummary assetProfile",
      };
    }
  }

  return null;
}

async function fetchYahooProfilePage(symbol: string) {
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/profile/`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const html = await response.text();
  const sectorMatch = html.match(/Sector(?:\s|<[^>]*>)*<[^>]*>([^<]+)<\/[^>]+>/i);
  const industryMatch = html.match(/Industry(?:\s|<[^>]*>)*<[^>]*>([^<]+)<\/[^>]+>/i);

  const sector = sectorMatch?.[1] ? cleanHtml(sectorMatch[1]) : "";
  const industry = industryMatch?.[1] ? cleanHtml(industryMatch[1]) : "";

  if (sector || industry) {
    return { sector, industry, source: "Yahoo Finance profile page" };
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = String(searchParams.get("symbol") || "").trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const quoteSummary = await fetchYahooQuoteSummary(symbol);
    if (quoteSummary) {
      return NextResponse.json({ symbol, ...quoteSummary });
    }

    const profilePage = await fetchYahooProfilePage(symbol);
    if (profilePage) {
      return NextResponse.json({ symbol, ...profilePage });
    }

    const fallback = FALLBACK_US_SECTOR[symbol];
    if (fallback) {
      return NextResponse.json({ symbol, ...fallback, source: "local fallback" });
    }

    return NextResponse.json({
      symbol,
      sector: "",
      industry: "",
      source: "none",
      error: "Yahoo Finance did not return sector or industry",
    });
  } catch (error: any) {
    const fallback = FALLBACK_US_SECTOR[symbol];
    if (fallback) {
      return NextResponse.json({ symbol, ...fallback, source: "local fallback after Yahoo error" });
    }

    return NextResponse.json({
      symbol,
      sector: "",
      industry: "",
      source: "error",
      error: error?.message || "Yahoo Finance lookup failed",
    });
  }
}
