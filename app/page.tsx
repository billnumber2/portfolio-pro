"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Download,
  Upload,
  Plus,
  Trash2,
  RefreshCw,
  Save,
  LogIn,
  LogOut,
  WalletCards,
  TrendingUp,
  Coins,
  ReceiptText,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";

type Market = "TW" | "US";
type TradeSide = "BUY" | "SELL";

type Position = {
  id: string;
  market: Market;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currency: string;
  sector: string;
  note: string;
  updatedAt?: string;
};

type Trade = {
  id: string;
  date: string;
  market: Market;
  symbol: string;
  side: TradeSide;
  shares: number;
  price: number;
  fee: number;
  tax: number;
  currency: string;
  note: string;
};

type Dividend = {
  id: string;
  payDate: string;
  market: Market;
  symbol: string;
  shares: number;
  amountPerShare: number;
  withholdingTax: number;
  currency: string;
  note: string;
};

type Snapshot = {
  snapshot_date: string;
  total_market_value_twd: number;
  total_cost_twd: number;
  unrealized_pnl_twd: number;
  position_count: number;
};

const STORAGE_KEY = "portfolio-pro-v8-positions-wide-layout";
const colors = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

const TW_STOCK_INFO: Record<string, { name: string; sector: string }> = {
  "0050": { name: "元大台灣50", sector: "ETF" },
  "0056": { name: "元大高股息", sector: "ETF" },
  "006208": { name: "富邦台50", sector: "ETF" },
  "00878": { name: "國泰永續高股息", sector: "ETF" },
  "00919": { name: "群益台灣精選高息", sector: "ETF" },
  "00929": { name: "復華台灣科技優息", sector: "ETF" },
  "00940": { name: "元大台灣價值高息", sector: "ETF" },
  "2330": { name: "台灣積電", sector: "半導體業" },
  "2303": { name: "聯華電子", sector: "半導體業" },
  "2454": { name: "聯發科", sector: "半導體業" },
  "2317": { name: "鴻海", sector: "其他電子業" },
  "2382": { name: "廣達", sector: "電腦及週邊設備業" },
  "2356": { name: "英業達", sector: "電腦及週邊設備業" },
  "2357": { name: "華碩", sector: "電腦及週邊設備業" },
  "2412": { name: "中華電", sector: "通信網路業" },
  "2881": { name: "富邦金", sector: "金融業" },
  "2882": { name: "國泰金", sector: "金融業" },
  "2884": { name: "玉山金", sector: "金融業" },
  "2885": { name: "元大金", sector: "金融業" },
  "2886": { name: "兆豐金", sector: "金融業" },
  "2891": { name: "中信金", sector: "金融業" },
  "2892": { name: "第一金", sector: "金融業" },
  "2603": { name: "長榮", sector: "航運業" },
  "2609": { name: "陽明", sector: "航運業" },
  "2615": { name: "萬海", sector: "航運業" },
};

const demoPositions: Position[] = [
  {
    id: "demo-tw-2330",
    market: "TW",
    symbol: "2330",
    name: "台灣積電",
    shares: 10,
    avgCost: 850,
    currentPrice: 980,
    currency: "TWD",
    sector: "半導體業",
    note: "示範資料，可刪除",
  },
  {
    id: "demo-us-aapl",
    market: "US",
    symbol: "AAPL",
    name: "Apple",
    shares: 5,
    avgCost: 185,
    currentPrice: 212,
    currency: "USD",
    sector: "Technology",
    note: "示範資料，可刪除",
  },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function marketCurrency(market: Market) {
  return market === "US" ? "USD" : "TWD";
}

function normalizeSymbol(symbol: string, market?: Market) {
  const raw = String(symbol || "").trim().toUpperCase();
  if (!raw) return "";
  if (market === "TW" && /^\d+$/.test(raw) && raw.length < 4) return raw.padStart(4, "0");
  return raw;
}

function lookupTwStockInfo(symbol: string) {
  return TW_STOCK_INFO[normalizeSymbol(symbol, "TW")] || null;
}

function normMarket(value: any): Market {
  return String(value || "TW").toUpperCase().includes("US") ? "US" : "TW";
}

function fmt(value: number, currency = "TWD", digits = 0) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const symbol = currency === "USD" ? "US$" : "NT$";
  return `${symbol}${safe.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function pct(value: number) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${safe >= 0 ? "+" : ""}${safe.toFixed(2)}%`;
}

function normalizePosition(raw: any): Position {
  const market = normMarket(raw.market || raw.市場);
  const symbol = normalizeSymbol(raw.symbol || raw.代號 || "", market);
  const tw = market === "TW" ? lookupTwStockInfo(symbol) : null;
  return {
    id: raw.id || makeId(),
    market,
    symbol,
    name: String(raw.name || raw.stock_name || raw.名稱 || tw?.name || "").trim(),
    shares: Number(raw.shares || raw.股數 || 0),
    avgCost: Number(raw.avgCost ?? raw.avg_cost ?? raw.平均成本 ?? 0),
    currentPrice: Number(raw.currentPrice ?? raw.current_price ?? raw.現價 ?? raw.price ?? raw.avgCost ?? raw.avg_cost ?? raw.平均成本 ?? 0),
    currency: raw.currency || raw.幣別 || marketCurrency(market),
    sector: String(raw.sector || raw.產業 || tw?.sector || "未分類"),
    note: String(raw.note || raw.備註 || ""),
    updatedAt: raw.updated_at || raw.updatedAt,
  };
}

function normalizeTrade(raw: any): Trade {
  const market = normMarket(raw.market || raw.市場);
  const rawSide = String(raw.side || raw.買賣 || "BUY");
  const side: TradeSide = rawSide.toUpperCase().includes("SELL") || rawSide.includes("賣") ? "SELL" : "BUY";
  return {
    id: raw.id || makeId(),
    date: raw.date || raw.trade_date || raw.交易日期 || today(),
    market,
    symbol: normalizeSymbol(raw.symbol || raw.代號 || "", market),
    side,
    shares: Number(raw.shares || raw.股數 || 0),
    price: Number(raw.price || raw.成交價 || 0),
    fee: Number(raw.fee || raw.手續費 || 0),
    tax: Number(raw.tax || raw.交易稅 || 0),
    currency: raw.currency || raw.幣別 || marketCurrency(market),
    note: String(raw.note || raw.備註 || ""),
  };
}

function normalizeDividend(raw: any): Dividend {
  const market = normMarket(raw.market || raw.市場);
  return {
    id: raw.id || makeId(),
    payDate: raw.payDate || raw.pay_date || raw.配息日 || today(),
    market,
    symbol: normalizeSymbol(raw.symbol || raw.代號 || "", market),
    shares: Number(raw.shares || raw.股數 || 0),
    amountPerShare: Number(raw.amountPerShare ?? raw.amount_per_share ?? raw.每股股利 ?? 0),
    withholdingTax: Number(raw.withholdingTax ?? raw.withholding_tax ?? raw.扣繳稅 ?? 0),
    currency: raw.currency || raw.幣別 || marketCurrency(market),
    note: String(raw.note || raw.備註 || ""),
  };
}

export default function Page() {
  const [tab, setTab] = useState("dashboard");
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [fxRate, setFxRate] = useState(32.2);
  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");
  const [status, setStatus] = useState("輸入 Email 後寄送登入連結。登入後瀏覽器會保留登入狀態。");
  const [sectorLookupMessage, setSectorLookupMessage] = useState("");
  const [priceUpdating, setPriceUpdating] = useState(false);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [autoPriceUpdated, setAutoPriceUpdated] = useState(false);
  const [positionForm, setPositionForm] = useState({ market: "TW", symbol: "", name: "", shares: "", avgCost: "", currentPrice: "", sector: "", note: "" });
  const [tradeForm, setTradeForm] = useState({ date: today(), market: "TW", symbol: "", side: "BUY", shares: "", price: "", fee: "", tax: "", note: "" });
  const [dividendForm, setDividendForm] = useState({ payDate: today(), market: "TW", symbol: "", shares: "", amountPerShare: "", withholdingTax: "", note: "" });

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        setPositions(saved.positions || demoPositions);
        setTrades(saved.trades || []);
        setDividends(saved.dividends || []);
        setFxRate(saved.fxRate || 32.2);
      } catch {
        setPositions(demoPositions);
      }
    } else {
      setPositions(demoPositions);
    }

    supabase.auth.getSession().then(({ data }) => {
      const userEmail = data.session?.user.email || "";
      setSessionEmail(userEmail);
      if (data.session?.access_token) loadSnapshots(data.session.access_token);
      if (userEmail) setStatus(`已登入：${userEmail}`);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userEmail = session?.user.email || "";
      setSessionEmail(userEmail);
      if (session?.access_token) loadSnapshots(session.access_token);
      setStatus(userEmail ? `已登入：${userEmail}` : "目前未登入。請輸入 Email 並寄送登入連結。");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, trades, dividends, fxRate }));
  }, [positions, trades, dividends, fxRate]);

  useEffect(() => {
    if (!autoPriceUpdated && positions.length > 0) {
      setAutoPriceUpdated(true);
      refreshCurrentPrices(false);
    }
  }, [positions.length, autoPriceUpdated]);

  const enriched = useMemo(() => positions.map((p) => {
    const toTwd = p.currency === "USD" ? fxRate : 1;
    const cost = Number(p.shares) * Number(p.avgCost);
    const value = Number(p.shares) * Number(p.currentPrice);
    const pnl = value - cost;
    return {
      ...p,
      cost,
      value,
      pnl,
      pnlPct: cost ? (pnl / cost) * 100 : 0,
      avgCostTwd: Number(p.avgCost) * toTwd,
      costTwd: cost * toTwd,
      valueTwd: value * toTwd,
      pnlTwd: pnl * toTwd,
    };
  }), [positions, fxRate]);

  const holdingsSummary = useMemo(() => {
    const grouped = new Map<string, any>();
    enriched.forEach((p) => {
      const key = `${p.market}-${p.symbol}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.valueTwd += Number(p.valueTwd || 0);
        existing.pnlTwd += Number(p.pnlTwd || 0);
        existing.shares += Number(p.shares || 0);
        existing.costTwd += Number(p.costTwd || 0);
        if (!existing.name && p.name) existing.name = p.name;
      } else {
        grouped.set(key, {
          id: key,
          market: p.market,
          symbol: p.symbol,
          name: p.name || p.symbol,
          valueTwd: Number(p.valueTwd || 0),
          pnlTwd: Number(p.pnlTwd || 0),
          shares: Number(p.shares || 0),
          costTwd: Number(p.costTwd || 0),
        });
      }
    });

    const list = Array.from(grouped.values());
    const totalValue = list.reduce((sum, item) => sum + Number(item.valueTwd || 0), 0);
    return list
      .map((item) => ({ ...item, weight: totalValue > 0 ? (Number(item.valueTwd || 0) / totalValue) * 100 : 0 }))
      .sort((a, b) => b.weight - a.weight);
  }, [enriched]);

  const realizedDetails = useMemo(() => trades.filter((t) => t.side === "SELL").map((t) => {
    const position = positions.find((p) => p.market === t.market && p.symbol === t.symbol);
    const avgCost = position?.avgCost || 0;
    const pnlLocal = (Number(t.price) - avgCost) * Number(t.shares) - Number(t.fee || 0) - Number(t.tax || 0);
    const pnlTwd = pnlLocal * (t.currency === "USD" ? fxRate : 1);
    return { ...t, avgCost, pnlLocal, pnlTwd };
  }), [trades, positions, fxRate]);

  const totals = useMemo(() => {
    const cost = enriched.reduce((sum, p) => sum + p.costTwd, 0);
    const value = enriched.reduce((sum, p) => sum + p.valueTwd, 0);
    const unrealized = value - cost;
    const realized = realizedDetails.reduce((sum, t) => sum + t.pnlTwd, 0);
    const dividendIncome = dividends.reduce((sum, d) => {
      const income = Number(d.shares) * Number(d.amountPerShare) - Number(d.withholdingTax || 0);
      return sum + income * (d.currency === "USD" ? fxRate : 1);
    }, 0);
    return {
      cost,
      value,
      unrealized,
      pnlPct: cost ? (unrealized / cost) * 100 : 0,
      realized,
      dividendIncome,
      totalReturn: unrealized + realized + dividendIncome,
    };
  }, [enriched, realizedDetails, dividends, fxRate]);

  const allocation = useMemo(() => {
    const tw = enriched.filter((p) => p.market === "TW").reduce((sum, p) => sum + p.valueTwd, 0);
    const us = enriched.filter((p) => p.market === "US").reduce((sum, p) => sum + p.valueTwd, 0);
    return [{ name: "台股", value: tw }, { name: "美股", value: us }].filter((item) => item.value > 0);
  }, [enriched]);

  const monthlyReport = useMemo(() => {
    const map = new Map<string, any>();
    trades.forEach((t) => {
      const key = String(t.date).slice(0, 7);
      const item = map.get(key) || { month: key, buy: 0, sell: 0, dividends: 0 };
      const amount = Number(t.shares) * Number(t.price) * (t.currency === "USD" ? fxRate : 1);
      if (t.side === "BUY") item.buy += amount;
      else item.sell += amount;
      map.set(key, item);
    });
    dividends.forEach((d) => {
      const key = String(d.payDate).slice(0, 7);
      const item = map.get(key) || { month: key, buy: 0, sell: 0, dividends: 0 };
      item.dividends += (Number(d.shares) * Number(d.amountPerShare) - Number(d.withholdingTax || 0)) * (d.currency === "USD" ? fxRate : 1);
      map.set(key, item);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [trades, dividends, fxRate]);

  const snapshotChartData = useMemo(() => snapshots.map((s) => ({
    date: s.snapshot_date,
    totalMarketValue: Number(s.total_market_value_twd || 0),
    unrealizedPnl: Number(s.unrealized_pnl_twd || 0),
  })), [snapshots]);

  async function signIn() {
    if (!email) return setStatus("請輸入 Email。");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) return setStatus(error.message);
    setStatus("已寄出登入連結，請到信箱點擊連結。登入後瀏覽器會保留登入狀態。");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSessionEmail("");
    setSnapshots([]);
    setStatus("已登出。");
  }

  async function loadSnapshots(accessToken?: string) {
    try {
      setSnapshotsLoading(true);
      let token = accessToken;
      if (!token) {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
      }
      if (!token) return;
      const response = await fetch("/api/snapshots?days=365", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setSnapshots(data.snapshots || []);
    } catch {
      setSnapshots([]);
    } finally {
      setSnapshotsLoading(false);
    }
  }

  async function lookupYahooSector(symbol: string) {
    const normalizedSymbol = normalizeSymbol(symbol, "US");
    if (!normalizedSymbol) return "";
    try {
      setSectorLookupMessage(`正在查詢 Yahoo Finance：${normalizedSymbol}`);
      const response = await fetch(`/api/yahoo-sector?symbol=${encodeURIComponent(normalizedSymbol)}`);
      const data = await response.json();
      const sector = data.sector || data.industry || "";
      setSectorLookupMessage(sector ? `Yahoo Finance 產業分類：${sector}` : `Yahoo Finance 查無產業分類：${normalizedSymbol}`);
      return sector;
    } catch {
      setSectorLookupMessage("Yahoo Finance 查詢失敗，請確認 app/api/yahoo-sector/route.ts 已部署。");
      return "";
    }
  }

  async function autoFillPositionFormBySymbol(symbol: string, market: Market) {
    const normalizedSymbol = normalizeSymbol(symbol, market);
    if (!normalizedSymbol) return;
    if (market === "TW") {
      const info = lookupTwStockInfo(normalizedSymbol);
      if (info) {
        setPositionForm((prev) => ({ ...prev, symbol: normalizedSymbol, name: prev.name || info.name, sector: info.sector }));
        setSectorLookupMessage(`已依台股對照表帶入：${info.name}／${info.sector}`);
      }
      return;
    }
    const sector = await lookupYahooSector(normalizedSymbol);
    if (sector) setPositionForm((prev) => ({ ...prev, symbol: normalizedSymbol, sector }));
  }

  async function autoFillExistingPositionBySymbol(id: string, symbol: string, market: Market) {
    const normalizedSymbol = normalizeSymbol(symbol, market);
    if (!normalizedSymbol) return;
    if (market === "TW") {
      const info = lookupTwStockInfo(normalizedSymbol);
      if (info) {
        setPositions((prev) => prev.map((p) => p.id === id ? { ...p, symbol: normalizedSymbol, name: p.name || info.name, sector: info.sector } : p));
      }
      return;
    }
    const sector = await lookupYahooSector(normalizedSymbol);
    if (sector) setPositions((prev) => prev.map((p) => p.id === id ? { ...p, symbol: normalizedSymbol, sector } : p));
  }

  async function refreshCurrentPrices(showMessage = true) {
    if (positions.length === 0) {
      if (showMessage) setStatus("目前沒有庫存可更新現價。");
      return;
    }
    try {
      setPriceUpdating(true);
      if (showMessage) setStatus("正在從 Yahoo Finance 更新現價...");
      const response = await fetch("/api/yahoo-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: positions.map((p) => ({ id: p.id, market: p.market, symbol: p.symbol })) }),
      });
      const data = await response.json();
      const priceMap: Record<string, any> = data?.prices || {};
      let updatedCount = 0;
      const updatedPositions = positions.map((p) => {
        const item = priceMap[p.id];
        const price = Number(item?.price || 0);
        if (price > 0) {
          updatedCount += 1;
          return { ...p, currentPrice: price, updatedAt: new Date().toISOString() };
        }
        return p;
      });
      setPositions(updatedPositions);
      if (showMessage) setStatus(`已更新 ${updatedCount}/${positions.length} 筆庫存現價，市值與損益已自動重新計算。`);
    } catch (error: any) {
      if (showMessage) setStatus(error?.message || "更新現價失敗。");
    } finally {
      setPriceUpdating(false);
    }
  }

  async function loadCloud() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return setStatus("請先登入。");
    setSessionEmail(user.email || "");

    const [positionsResult, tradesResult, dividendsResult] = await Promise.all([
      supabase.from("positions").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      supabase.from("trades").select("*").eq("user_id", user.id),
      supabase.from("dividends").select("*").eq("user_id", user.id),
    ]);

    if (positionsResult.error || tradesResult.error || dividendsResult.error) {
      return setStatus(positionsResult.error?.message || tradesResult.error?.message || dividendsResult.error?.message || "讀取雲端資料失敗。");
    }

    setPositions((positionsResult.data || []).map(normalizePosition));
    setTrades((tradesResult.data || []).map(normalizeTrade));
    setDividends((dividendsResult.data || []).map(normalizeDividend));
    await loadSnapshots(sessionData.session?.access_token);
    setStatus("已從 Supabase 讀取資料。");
  }

  async function saveCloud() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return setStatus("請先登入。");

    const posRows = positions.map((p) => ({
      id: p.id,
      user_id: user.id,
      market: p.market,
      symbol: p.symbol,
      stock_name: p.name,
      name: p.name,
      shares: p.shares,
      avg_cost: p.avgCost,
      current_price: p.currentPrice,
      currency: p.currency,
      sector: p.sector,
      note: p.note,
      updated_at: new Date().toISOString(),
    }));
    const tradeRows = trades.map((t) => ({ id: t.id, user_id: user.id, trade_date: t.date, date: t.date, market: t.market, symbol: t.symbol, side: t.side, shares: t.shares, price: t.price, fee: t.fee, tax: t.tax, currency: t.currency, note: t.note }));
    const dividendRows = dividends.map((d) => ({ id: d.id, user_id: user.id, pay_date: d.payDate, market: d.market, symbol: d.symbol, shares: d.shares, amount_per_share: d.amountPerShare, withholding_tax: d.withholdingTax, currency: d.currency, note: d.note }));

    const [deletePositions, deleteTrades, deleteDividends] = await Promise.all([
      supabase.from("positions").delete().eq("user_id", user.id),
      supabase.from("trades").delete().eq("user_id", user.id),
      supabase.from("dividends").delete().eq("user_id", user.id),
    ]);
    if (deletePositions.error || deleteTrades.error || deleteDividends.error) return setStatus(deletePositions.error?.message || deleteTrades.error?.message || deleteDividends.error?.message || "刪除雲端舊資料失敗。");

    const results = [];
    if (posRows.length > 0) results.push(await supabase.from("positions").insert(posRows));
    if (tradeRows.length > 0) results.push(await supabase.from("trades").insert(tradeRows));
    if (dividendRows.length > 0) results.push(await supabase.from("dividends").insert(dividendRows));
    const failed = results.find((result) => result.error);
    if (failed?.error) return setStatus(failed.error.message || "同步失敗。");
    setStatus("已同步至 Supabase。本機資料已完整覆蓋雲端資料。");
  }

  function updatePosition(id: string, field: keyof Position, value: any) {
    setPositions(positions.map((p) => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value } as Position;
      if (field === "market") {
        updated.market = value as Market;
        updated.currency = marketCurrency(value as Market);
      }
      if (["shares", "avgCost", "currentPrice"].includes(field)) (updated as any)[field] = Number(value) || 0;
      if (field === "symbol") updated.symbol = String(value).trim().toUpperCase();
      return updated;
    }));
  }

  function applyTradeToPositions(trade: Trade) {
    const tradeShares = Number(trade.shares);
    const tradePrice = Number(trade.price);
    const tradeFeeTax = Number(trade.fee || 0) + Number(trade.tax || 0);
    if (tradeShares <= 0 || tradePrice <= 0) {
      setStatus("交易股數與成交價必須大於 0。");
      return false;
    }

    const existing = positions.find((p) => p.market === trade.market && p.symbol === trade.symbol);
    if (trade.side === "BUY") {
      const twInfo = trade.market === "TW" ? lookupTwStockInfo(trade.symbol) : null;
      if (existing) {
        const oldShares = Number(existing.shares);
        const oldCost = oldShares * Number(existing.avgCost);
        const newCost = tradeShares * tradePrice + tradeFeeTax;
        const newShares = oldShares + tradeShares;
        const newAvgCost = newShares > 0 ? (oldCost + newCost) / newShares : tradePrice;
        setPositions(positions.map((p) => p.id === existing.id ? { ...p, shares: newShares, avgCost: Number(newAvgCost.toFixed(4)), currentPrice: tradePrice, currency: marketCurrency(trade.market), name: p.name || twInfo?.name || "", sector: p.sector === "未分類" && twInfo ? twInfo.sector : p.sector } : p));
      } else {
        const avgCost = (tradeShares * tradePrice + tradeFeeTax) / tradeShares;
        setPositions([{ id: makeId(), market: trade.market, symbol: trade.symbol, name: twInfo?.name || "", shares: tradeShares, avgCost: Number(avgCost.toFixed(4)), currentPrice: tradePrice, currency: marketCurrency(trade.market), sector: twInfo?.sector || "未分類", note: "由買進交易自動建立" }, ...positions]);
      }
      return true;
    }

    if (!existing) {
      setStatus(`找不到 ${trade.market} ${trade.symbol} 的庫存，無法新增賣出交易。`);
      return false;
    }
    if (tradeShares > Number(existing.shares)) {
      setStatus(`賣出股數 ${tradeShares} 大於目前庫存 ${existing.shares}，請先修正。`);
      return false;
    }
    const remainingShares = Number(existing.shares) - tradeShares;
    if (remainingShares <= 0) setPositions(positions.filter((p) => p.id !== existing.id));
    else setPositions(positions.map((p) => p.id === existing.id ? { ...p, shares: remainingShares, currentPrice: tradePrice } : p));
    return true;
  }

  function addPosition() {
    if (!positionForm.symbol || !positionForm.shares || !positionForm.avgCost) return setStatus("股票代號、股數、平均成本為必填。");
    const market = positionForm.market as Market;
    const symbol = normalizeSymbol(positionForm.symbol, market);
    const twInfo = market === "TW" ? lookupTwStockInfo(symbol) : null;
    const newPosition: Position = {
      id: makeId(),
      market,
      symbol,
      name: positionForm.name.trim() || twInfo?.name || "",
      shares: Number(positionForm.shares),
      avgCost: Number(positionForm.avgCost),
      currentPrice: Number(positionForm.currentPrice || positionForm.avgCost),
      currency: marketCurrency(market),
      sector: positionForm.sector.trim() || twInfo?.sector || "未分類",
      note: positionForm.note.trim(),
    };
    setPositions([newPosition, ...positions]);
    setPositionForm({ market: "TW", symbol: "", name: "", shares: "", avgCost: "", currentPrice: "", sector: "", note: "" });
    setStatus("已新增庫存。本機已自動保存。");
  }

  function addTrade() {
    if (!tradeForm.symbol || !tradeForm.shares || !tradeForm.price) return setStatus("交易紀錄至少需輸入代號、股數與成交價。");
    const market = tradeForm.market as Market;
    const trade: Trade = { id: makeId(), date: tradeForm.date || today(), market, symbol: normalizeSymbol(tradeForm.symbol, market), side: tradeForm.side as TradeSide, shares: Number(tradeForm.shares), price: Number(tradeForm.price), fee: Number(tradeForm.fee || 0), tax: Number(tradeForm.tax || 0), currency: marketCurrency(market), note: tradeForm.note.trim() };
    const applied = applyTradeToPositions(trade);
    if (!applied) return;
    setTrades([trade, ...trades]);
    setTradeForm({ date: today(), market: "TW", symbol: "", side: "BUY", shares: "", price: "", fee: "", tax: "", note: "" });
    setStatus(trade.side === "BUY" ? "已新增買進交易，並自動更新庫存股數與平均成本。若要永久保存，請按同步到雲端。" : "已新增賣出交易，並自動扣減庫存股數。若要永久保存，請按同步到雲端。");
  }

  function addDividend() {
    if (!dividendForm.symbol || !dividendForm.shares || !dividendForm.amountPerShare) return setStatus("股利紀錄至少需輸入代號、股數與每股股利。");
    const market = dividendForm.market as Market;
    const dividend: Dividend = { id: makeId(), payDate: dividendForm.payDate || today(), market, symbol: normalizeSymbol(dividendForm.symbol, market), shares: Number(dividendForm.shares), amountPerShare: Number(dividendForm.amountPerShare), withholdingTax: Number(dividendForm.withholdingTax || 0), currency: marketCurrency(market), note: dividendForm.note.trim() };
    setDividends([dividend, ...dividends]);
    setDividendForm({ payDate: today(), market: "TW", symbol: "", shares: "", amountPerShare: "", withholdingTax: "", note: "" });
    setStatus("已新增股利配息紀錄。若要永久保存，請按同步到雲端。");
  }

  function exportCsv() {
    const header = ["market", "symbol", "name", "shares", "avgCost", "currentPrice", "currency", "sector", "note"];
    const rows = positions.map((p) => header.map((h) => `"${String((p as any)[h] ?? "").replaceAll('"', '""')}"`).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "positions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importExcel(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    const workbook = XLSX.read(await file.arrayBuffer());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const imported = rows.map(normalizePosition).filter((p) => p.symbol);
    setPositions([...imported, ...positions]);
    setStatus(`已匯入 ${imported.length} 筆 Excel 資料。`);
    event.target.value = "";
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-blue-700 font-medium">Portfolio Pro</p>
            <h1 className="text-3xl md:text-4xl font-bold">台股 + 美股投資庫存與績效追蹤</h1>
            <p className="text-slate-600 mt-2">每日快照 + Email 無密碼登入 + Supabase 雲端同步版</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportCsv} className="btn"><Download size={16} />匯出CSV</button>
            <label className="btn bg-white text-slate-700 cursor-pointer"><Upload size={16} />匯入Excel<input type="file" accept=".xlsx,.xls" onChange={importExcel} className="hidden" /></label>
          </div>
        </header>

        <nav className="bg-white p-2 rounded-3xl shadow-sm flex flex-wrap gap-2">
          {[["dashboard", "總覽"], ["positions", "庫存"], ["trades", "交易紀錄"], ["dividends", "股利配息"], ["reports", "報表"], ["settings", "登入/雲端"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-2xl ${tab === key ? "bg-blue-600 text-white" : "hover:bg-slate-100"}`}>{label}</button>
          ))}
        </nav>

        <div className="bg-blue-50 text-blue-900 rounded-2xl p-3 text-sm">{status}</div>

        {(tab === "dashboard" || tab === "positions") && (
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => refreshCurrentPrices(true)} disabled={priceUpdating} className="btn">
              <RefreshCw size={16} />{priceUpdating ? "更新中..." : "更新現價"}
            </button>
            {tab === "dashboard" && <button onClick={() => loadSnapshots()} disabled={snapshotsLoading} className="btn bg-white text-slate-700"><RefreshCw size={16} />{snapshotsLoading ? "讀取中..." : "更新365天圖表"}</button>}
          </div>
        )}

        {tab === "dashboard" && <Dashboard totals={totals} monthlyReport={monthlyReport} allocation={allocation} fxRate={fxRate} setFxRate={setFxRate} snapshotChartData={snapshotChartData} snapshotsLoading={snapshotsLoading} holdingsSummary={holdingsSummary} />}
        {tab === "positions" && <PositionsSection positionForm={positionForm} setPositionForm={setPositionForm} addPosition={addPosition} enriched={enriched} positions={positions} setPositions={setPositions} updatePosition={updatePosition} autoFillPositionFormBySymbol={autoFillPositionFormBySymbol} autoFillExistingPositionBySymbol={autoFillExistingPositionBySymbol} sectorLookupMessage={sectorLookupMessage} setStatus={setStatus} />}
        {tab === "trades" && <TradeSection tradeForm={tradeForm} setTradeForm={setTradeForm} trades={trades} setTrades={setTrades} addTrade={addTrade} realizedDetails={realizedDetails} />}
        {tab === "dividends" && <DividendSection dividendForm={dividendForm} setDividendForm={setDividendForm} dividends={dividends} setDividends={setDividends} addDividend={addDividend} fxRate={fxRate} />}
        {tab === "reports" && <ReportsSection totals={totals} />}
        {tab === "settings" && <SettingsSection email={email} setEmail={setEmail} sessionEmail={sessionEmail} signIn={signIn} signOut={signOut} saveCloud={saveCloud} loadCloud={loadCloud} />}
      </div>
    </main>
  );
}

function Dashboard({ totals, monthlyReport, allocation, fxRate, setFxRate, snapshotChartData, snapshotsLoading, holdingsSummary }: any) {
  return <section className="space-y-6"><div className="grid md:grid-cols-4 gap-4"><Metric icon={<WalletCards />} title="總市值" value={fmt(totals.value)} sub={`成本 ${fmt(totals.cost)}`} /><Metric icon={<TrendingUp />} title="未實現損益" value={fmt(totals.unrealized)} sub={pct(totals.pnlPct)} positive={totals.unrealized >= 0} /><Metric icon={<ReceiptText />} title="已實現損益" value={fmt(totals.realized)} sub="依賣出交易估算" positive={totals.realized >= 0} /><Metric icon={<Coins />} title="股利收入" value={fmt(totals.dividendIncome)} sub={`總報酬 ${fmt(totals.totalReturn)}`} positive={totals.dividendIncome >= 0} /></div><div className="grid xl:grid-cols-2 gap-6"><HistoryChart title="過去365天總市值變化" data={snapshotChartData} dataKey="totalMarketValue" color="#2563eb" loading={snapshotsLoading} emptyText="尚無每日快照資料。可先手動開啟 /api/cron/daily-snapshot 產生今日資料。" /><HistoryChart title="過去365天未實現損益變化" data={snapshotChartData} dataKey="unrealizedPnl" color="#dc2626" loading={snapshotsLoading} emptyText="尚無每日快照資料。每日台灣時間06:00後會自動累積。" /></div><div className="grid xl:grid-cols-3 gap-6"><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">月度統計</h2><div className="h-72"><ResponsiveContainer><BarChart data={monthlyReport}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v) => fmt(Number(v))} /><Legend /><Bar dataKey="buy" name="買進" fill="#2563eb" /><Bar dataKey="sell" name="賣出" fill="#16a34a" /><Bar dataKey="dividends" name="股利" fill="#f97316" /></BarChart></ResponsiveContainer></div></Card><Card><h2 className="text-xl font-semibold mb-4">市場配置</h2><div className="h-72"><ResponsiveContainer><PieChart><Pie data={allocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>{allocation.map((entry: any, index: number) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(v) => fmt(Number(v))} /><Legend /></PieChart></ResponsiveContainer></div><label className="text-sm flex items-center gap-2">USD/TWD<input type="number" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value) || 0)} className="input w-28" /></label></Card></div><HoldingsSummaryCard holdings={holdingsSummary} /></section>;
}

function HoldingsSummaryCard({ holdings }: any) {
  return <Card><div className="flex items-start justify-between gap-3 mb-4"><div><h2 className="text-xl font-semibold">庫存占比明細</h2><p className="text-sm text-slate-500">相同市場與相同代號已先整合，並依庫存占比由大到小排列</p></div><div className="text-sm text-slate-500">{holdings?.length || 0} 筆</div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-slate-100 text-slate-600"><th className="p-3 text-left">市場</th><th className="p-3 text-left">名稱</th><th className="p-3 text-right">市值</th><th className="p-3 text-right">損益</th><th className="p-3 text-right">庫存占比</th></tr></thead><tbody>{holdings && holdings.length > 0 ? holdings.map((h: any) => <tr key={h.id} className="border-b"><td className="p-3">{h.market === "US" ? "美股" : "台股"}</td><td className="p-3 font-medium">{h.name}</td><td className="p-3 text-right">{fmt(Number(h.valueTwd || 0))}</td><td className={`p-3 text-right font-semibold ${Number(h.pnlTwd || 0) >= 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(Number(h.pnlTwd || 0))}</td><td className="p-3 text-right font-semibold">{Number(h.weight || 0).toFixed(2)}%</td></tr>) : <tr><td className="p-6 text-center text-slate-500" colSpan={5}>目前沒有庫存資料</td></tr>}</tbody></table></div></Card>;
}

function HistoryChart({ title, data, dataKey, color, loading, emptyText }: any) {
  const hasData = Array.isArray(data) && data.length > 0;
  return <Card><div className="flex items-start justify-between gap-3 mb-4"><div><h2 className="text-xl font-semibold">{title}</h2><p className="text-sm text-slate-500">資料來源：Supabase daily_portfolio_snapshots</p></div>{hasData && <div className="text-right text-sm text-slate-500">{data.length} 筆</div>}</div>{loading ? <div className="h-72 flex items-center justify-center text-slate-500">讀取中...</div> : hasData ? <div className="h-72"><ResponsiveContainer><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" minTickGap={28} /><YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000).toLocaleString()}k`} /><Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={(label) => `日期：${label}`} /><Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <div className="h-72 flex items-center justify-center text-center text-slate-500 px-6">{emptyText}</div>}</Card>;
}

function PositionsSection({ positionForm, setPositionForm, addPosition, enriched, positions, setPositions, updatePosition, autoFillPositionFormBySymbol, autoFillExistingPositionBySymbol, setStatus }: any) {
  return (
    <section className="grid xl:grid-cols-[280px_minmax(0,1fr)] gap-4 items-stretch">
      <Card>
        <h2 className="text-xl font-semibold mb-3">新增庫存</h2>
        <div className="flex flex-col gap-3">
          <select className="input w-full" value={positionForm.market} onChange={(e) => setPositionForm({ ...positionForm, market: e.target.value, sector: "", name: "" })}>
            <option value="TW">台股</option>
            <option value="US">美股</option>
          </select>
          <input className="input w-full" placeholder="代號" value={positionForm.symbol} onChange={(e) => setPositionForm({ ...positionForm, symbol: e.target.value.trim().toUpperCase() })} onBlur={() => autoFillPositionFormBySymbol(positionForm.symbol, positionForm.market as Market)} />
          <input className="input w-full" placeholder="名稱" value={positionForm.name} onChange={(e) => setPositionForm({ ...positionForm, name: e.target.value })} />
          <input className="input w-full" type="number" placeholder="股數" value={positionForm.shares} onChange={(e) => setPositionForm({ ...positionForm, shares: e.target.value })} />
          <input className="input w-full" type="number" placeholder="平均成本" value={positionForm.avgCost} onChange={(e) => setPositionForm({ ...positionForm, avgCost: e.target.value })} />
          <input className="input w-full" type="number" placeholder="現價" value={positionForm.currentPrice} onChange={(e) => setPositionForm({ ...positionForm, currentPrice: e.target.value })} />
          <input className="input w-full" placeholder="備註" value={positionForm.note} onChange={(e) => setPositionForm({ ...positionForm, note: e.target.value })} />
        </div>
        <button onClick={addPosition} className="btn w-full mt-3"><Plus size={16} />新增持股</button>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-xl font-semibold">庫存明細</h2>
          <span className="text-sm text-slate-500">{enriched.length} 筆</span>
        </div>
        <div className="max-h-[520px] overflow-y-auto pr-1">
          <table className="w-full table-fixed text-xs md:text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 text-slate-600">
                <th className="p-2 text-left w-[7%]">市場</th>
                <th className="p-2 text-left w-[10%]">代號</th>
                <th className="p-2 text-left w-[14%]">名稱</th>
                <th className="p-2 text-right w-[9%]">股數</th>
                <th className="p-2 text-right w-[10%]">平均成本</th>
                <th className="p-2 text-right w-[9%]">現價</th>
                <th className="p-2 text-right w-[13%]">市值</th>
                <th className="p-2 text-right w-[14%]">損益</th>
                <th className="p-2 text-left w-[10%]">備註</th>
                <th className="p-2 text-center w-[4%]">刪</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((p: any) => (
                <tr key={p.id} className="border-b align-top">
                  <td className="p-1.5"><select className="input w-full px-1 py-1 text-xs" value={p.market} onChange={(e) => updatePosition(p.id, "market", e.target.value)}><option value="TW">TW</option><option value="US">US</option></select></td>
                  <td className="p-1.5"><input className="input w-full px-1 py-1 text-xs" value={p.symbol} onChange={(e) => updatePosition(p.id, "symbol", e.target.value.trim().toUpperCase())} onBlur={() => autoFillExistingPositionBySymbol(p.id, p.symbol, p.market)} /></td>
                  <td className="p-1.5"><input className="input w-full px-1 py-1 text-xs" value={p.name} onChange={(e) => updatePosition(p.id, "name", e.target.value)} /></td>
                  <td className="p-1.5 text-right"><input className="input w-full px-1 py-1 text-right text-xs" type="number" value={p.shares} onChange={(e) => updatePosition(p.id, "shares", e.target.value)} /></td>
                  <td className="p-1.5 text-right"><input className="input w-full px-1 py-1 text-right text-xs" type="number" value={p.avgCost} onChange={(e) => updatePosition(p.id, "avgCost", e.target.value)} />{p.currency === "USD" && <div className="text-[10px] text-slate-500 truncate">{fmt(p.avgCostTwd)}</div>}</td>
                  <td className="p-1.5 text-right"><input className="input w-full px-1 py-1 text-right text-xs" type="number" value={p.currentPrice} onChange={(e) => updatePosition(p.id, "currentPrice", e.target.value)} /></td>
                  <td className="p-1.5 text-right"><div className="font-medium truncate">{fmt(p.value, p.currency, p.currency === "USD" ? 2 : 0)}</div><div className="text-[10px] text-slate-500 truncate">{fmt(p.valueTwd)}</div></td>
                  <td className={`p-1.5 text-right font-semibold ${p.pnl >= 0 ? "text-red-600" : "text-emerald-600"}`}><div className="truncate">{fmt(p.pnl, p.currency, p.currency === "USD" ? 2 : 0)}</div><div className="text-[10px] text-slate-500 truncate">{fmt(p.pnlTwd)}</div></td>
                  <td className="p-1.5"><input className="input w-full px-1 py-1 text-xs" value={p.note} onChange={(e) => updatePosition(p.id, "note", e.target.value)} /></td>
                  <td className="p-1.5 text-center"><button onClick={() => { setPositions(positions.filter((x: Position) => x.id !== p.id)); setStatus("已從網站刪除。若要同步刪除雲端資料，請按同步到雲端。"); }} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function TradeSection({ tradeForm, setTradeForm, trades, setTrades, addTrade, realizedDetails }: any) {
  return <section className="grid xl:grid-cols-3 gap-6"><Card><h2 className="text-xl font-semibold mb-3">新增交易紀錄</h2><div className="grid grid-cols-2 gap-3"><input className="input" type="date" value={tradeForm.date} onChange={(e) => setTradeForm({ ...tradeForm, date: e.target.value })} /><select className="input" value={tradeForm.market} onChange={(e) => setTradeForm({ ...tradeForm, market: e.target.value })}><option value="TW">台股</option><option value="US">美股</option></select><input className="input" placeholder="代號" value={tradeForm.symbol} onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value.trim().toUpperCase() })} /><select className="input" value={tradeForm.side} onChange={(e) => setTradeForm({ ...tradeForm, side: e.target.value })}><option value="BUY">買進</option><option value="SELL">賣出</option></select><input className="input" type="number" placeholder="股數" value={tradeForm.shares} onChange={(e) => setTradeForm({ ...tradeForm, shares: e.target.value })} /><input className="input" type="number" placeholder="成交價" value={tradeForm.price} onChange={(e) => setTradeForm({ ...tradeForm, price: e.target.value })} /><input className="input" type="number" placeholder="手續費" value={tradeForm.fee} onChange={(e) => setTradeForm({ ...tradeForm, fee: e.target.value })} /><input className="input" type="number" placeholder="交易稅" value={tradeForm.tax} onChange={(e) => setTradeForm({ ...tradeForm, tax: e.target.value })} /><input className="input col-span-2" placeholder="備註" value={tradeForm.note} onChange={(e) => setTradeForm({ ...tradeForm, note: e.target.value })} /></div><button onClick={addTrade} className="btn w-full mt-3"><Plus size={16} />新增交易</button></Card><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">交易紀錄 / 已實現損益</h2><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-slate-100 text-slate-600"><th className="p-3">日期</th><th className="p-3">市場</th><th className="p-3">代號</th><th className="p-3">買賣</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">成交價</th><th className="p-3 text-right">費稅</th><th className="p-3 text-right">已實現TWD</th><th className="p-3">備註</th><th></th></tr></thead><tbody>{trades.map((t: Trade) => { const detail = realizedDetails.find((r: any) => r.id === t.id); const amountTwd = detail ? detail.pnlTwd : 0; return <tr key={t.id} className="border-b"><td className="p-2">{t.date}</td><td className="p-2">{t.market}</td><td className="p-2 font-semibold">{t.symbol}</td><td className="p-2">{t.side === "BUY" ? "買進" : "賣出"}</td><td className="p-2 text-right">{t.shares.toLocaleString()}</td><td className="p-2 text-right">{fmt(t.price, t.currency, t.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right">{fmt(t.fee + t.tax, t.currency, t.currency === "USD" ? 2 : 0)}</td><td className={`p-2 text-right font-semibold ${amountTwd >= 0 ? "text-red-600" : "text-emerald-600"}`}>{t.side === "SELL" ? fmt(amountTwd) : "-"}</td><td className="p-2">{t.note}</td><td className="p-2"><button onClick={() => setTrades(trades.filter((x: Trade) => x.id !== t.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>; })}</tbody></table></div></Card></section>;
}

function DividendSection({ dividendForm, setDividendForm, dividends, setDividends, addDividend, fxRate }: any) {
  return <section className="grid xl:grid-cols-3 gap-6"><Card><h2 className="text-xl font-semibold mb-3">新增股利配息</h2><div className="grid grid-cols-2 gap-3"><input className="input" type="date" value={dividendForm.payDate} onChange={(e) => setDividendForm({ ...dividendForm, payDate: e.target.value })} /><select className="input" value={dividendForm.market} onChange={(e) => setDividendForm({ ...dividendForm, market: e.target.value })}><option value="TW">台股</option><option value="US">美股</option></select><input className="input" placeholder="代號" value={dividendForm.symbol} onChange={(e) => setDividendForm({ ...dividendForm, symbol: e.target.value.trim().toUpperCase() })} /><input className="input" type="number" placeholder="股數" value={dividendForm.shares} onChange={(e) => setDividendForm({ ...dividendForm, shares: e.target.value })} /><input className="input" type="number" placeholder="每股股利/配息" value={dividendForm.amountPerShare} onChange={(e) => setDividendForm({ ...dividendForm, amountPerShare: e.target.value })} /><input className="input" type="number" placeholder="扣繳稅" value={dividendForm.withholdingTax} onChange={(e) => setDividendForm({ ...dividendForm, withholdingTax: e.target.value })} /><input className="input col-span-2" placeholder="備註" value={dividendForm.note} onChange={(e) => setDividendForm({ ...dividendForm, note: e.target.value })} /></div><button onClick={addDividend} className="btn w-full mt-3"><Plus size={16} />新增股利</button></Card><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">股利 / 配息紀錄</h2><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="bg-slate-100 text-slate-600"><th className="p-3">配息日</th><th className="p-3">市場</th><th className="p-3">代號</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">每股</th><th className="p-3 text-right">扣繳稅</th><th className="p-3 text-right">淨收入TWD</th><th className="p-3">備註</th><th></th></tr></thead><tbody>{dividends.map((d: Dividend) => { const net = (d.shares * d.amountPerShare - d.withholdingTax) * (d.currency === "USD" ? fxRate : 1); return <tr key={d.id} className="border-b"><td className="p-2">{d.payDate}</td><td className="p-2">{d.market}</td><td className="p-2 font-semibold">{d.symbol}</td><td className="p-2 text-right">{d.shares.toLocaleString()}</td><td className="p-2 text-right">{fmt(d.amountPerShare, d.currency, d.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right">{fmt(d.withholdingTax, d.currency, d.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right font-semibold text-red-600">{fmt(net)}</td><td className="p-2">{d.note}</td><td className="p-2"><button onClick={() => setDividends(dividends.filter((x: Dividend) => x.id !== d.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>; })}</tbody></table></div></Card></section>;
}

function ReportsSection({ totals }: any) {
  return <Card><h2 className="text-xl font-semibold">績效報表</h2><p className="text-slate-500 mt-1">目前顯示目前庫存、已實現損益與股利收入。下一版可加 XIRR / TWR。</p><div className="grid md:grid-cols-4 gap-4 mt-5"><Metric title="投入成本" value={fmt(totals.cost)} sub="目前庫存" /><Metric title="總報酬" value={fmt(totals.totalReturn)} sub="未實現+已實現+股利" positive={totals.totalReturn >= 0} /><Metric title="已實現" value={fmt(totals.realized)} sub="賣出交易估算" positive={totals.realized >= 0} /><Metric title="股利收入" value={fmt(totals.dividendIncome)} sub="配息紀錄" positive={totals.dividendIncome >= 0} /></div></Card>;
}

function SettingsSection({ email, setEmail, sessionEmail, signIn, signOut, saveCloud, loadCloud }: any) {
  return <Card><h2 className="text-xl font-semibold mb-4">登入 / Supabase 雲端同步</h2><p className="text-sm text-slate-500 mb-3">登入狀態：{sessionEmail || "未登入"}</p><div className="grid md:grid-cols-2 gap-3 max-w-3xl"><input className="input" placeholder="請輸入 Email" value={email} onChange={(e) => setEmail(e.target.value)} /><button onClick={signIn} className="btn"><LogIn size={16} />寄送登入連結</button></div><div className="flex flex-wrap gap-2 mt-3"><button onClick={signOut} className="btn bg-slate-700"><LogOut size={16} />登出</button><button onClick={saveCloud} className="btn"><Save size={16} />同步到雲端</button><button onClick={loadCloud} className="btn"><RefreshCw size={16} />讀取雲端</button></div><div className="mt-4 text-sm text-slate-600">本網站採 Email 無密碼登入。同步到雲端會讓 Supabase 資料完全等於目前網站資料。</div></Card>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

function Metric({ icon, title, value, sub, positive }: { icon?: React.ReactNode; title: string; value: string; sub?: string; positive?: boolean }) {
  return <Card><div className="flex justify-between"><div><p className="text-sm text-slate-500">{title}</p><p className={`text-2xl font-bold mt-2 ${positive === true ? "text-red-600" : positive === false ? "text-emerald-600" : ""}`}>{value}</p><p className="text-sm text-slate-500 mt-1">{sub}</p></div>{icon && <div className="text-blue-700 bg-blue-50 rounded-2xl p-3 h-fit">{icon}</div>}</div></Card>;
}
