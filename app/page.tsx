"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Upload,
  Download,
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

const STORAGE_KEY = "portfolio-pro-local-email-only-v1";
const colors = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

const defaultPositions: Position[] = [
  {
    id: "demo-tw-2330",
    market: "TW",
    symbol: "2330",
    name: "台積電",
    shares: 10,
    avgCost: 850,
    currentPrice: 980,
    currency: "TWD",
    sector: "半導體",
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
    sector: "科技",
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

function fmt(value: number, currency = "TWD", digits = 0) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const symbol = currency === "USD" ? "US$" : "NT$";
  return `${symbol}${safe.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

function pct(value: number) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${safe >= 0 ? "+" : ""}${safe.toFixed(2)}%`;
}

function normMarket(value: any): Market {
  return String(value || "TW").toUpperCase().includes("US") ? "US" : "TW";
}

function normalizePosition(raw: any): Position {
  const market = normMarket(raw.market || raw.市場);
  return {
    id: raw.id || makeId(),
    market,
    symbol: String(raw.symbol || raw.代號 || "").trim().toUpperCase(),
    name: String(raw.name || raw.stock_name || raw.名稱 || "").trim(),
    shares: Number(raw.shares || raw.股數 || 0),
    avgCost: Number(raw.avgCost ?? raw.avg_cost ?? raw.平均成本 ?? 0),
    currentPrice: Number(raw.currentPrice ?? raw.current_price ?? raw.現價 ?? raw.price ?? raw.avgCost ?? raw.avg_cost ?? raw.平均成本 ?? 0),
    currency: raw.currency || raw.幣別 || marketCurrency(market),
    sector: String(raw.sector || raw.產業 || "未分類"),
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
    symbol: String(raw.symbol || raw.代號 || "").trim().toUpperCase(),
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
    symbol: String(raw.symbol || raw.代號 || "").trim().toUpperCase(),
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
  const [fxRate, setFxRate] = useState(32.2);
  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");
  const [status, setStatus] = useState("輸入 Email 後寄送登入連結。登入後瀏覽器會保留登入狀態。");
  const [positionForm, setPositionForm] = useState({ market: "TW", symbol: "", name: "", shares: "", avgCost: "", currentPrice: "", sector: "", note: "" });
  const [tradeForm, setTradeForm] = useState({ date: today(), market: "TW", symbol: "", side: "BUY", shares: "", price: "", fee: "", tax: "", note: "" });
  const [dividendForm, setDividendForm] = useState({ payDate: today(), market: "TW", symbol: "", shares: "", amountPerShare: "", withholdingTax: "", note: "" });

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        setPositions(saved.positions || defaultPositions);
        setTrades(saved.trades || []);
        setDividends(saved.dividends || []);
        setFxRate(saved.fxRate || 32.2);
      } catch {
        setPositions(defaultPositions);
      }
    } else {
      setPositions(defaultPositions);
    }

    supabase.auth.getSession().then(({ data }) => {
      const userEmail = data.session?.user.email || "";
      setSessionEmail(userEmail);
      if (userEmail) setStatus(`已登入：${userEmail}`);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userEmail = session?.user.email || "";
      setSessionEmail(userEmail);
      setStatus(userEmail ? `已登入：${userEmail}` : "目前未登入。請輸入 Email 並寄送登入連結。");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, trades, dividends, fxRate }));
  }, [positions, trades, dividends, fxRate]);

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
    return { cost, value, unrealized, pnlPct: cost ? (unrealized / cost) * 100 : 0, realized, dividendIncome, totalReturn: unrealized + realized + dividendIncome };
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

  async function signIn() {
    if (!email) return setStatus("請輸入 Email。");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) return setStatus(error.message);
    setStatus("已寄出登入連結，請到信箱點擊連結。登入後瀏覽器會保留登入狀態。");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSessionEmail("");
    setStatus("已登出。");
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
    setStatus("已從 Supabase 讀取資料。");
  }

  async function saveCloud() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return setStatus("請先登入。");

    const posRows = positions.map((p) => ({ id: p.id, user_id: user.id, market: p.market, symbol: p.symbol, stock_name: p.name, name: p.name, shares: p.shares, avg_cost: p.avgCost, current_price: p.currentPrice, currency: p.currency, sector: p.sector, note: p.note, updated_at: new Date().toISOString() }));
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
      if (field === "symbol") updated.symbol = String(value).toUpperCase();
      return updated;
    }));
  }

  function addPosition() {
    if (!positionForm.symbol || !positionForm.shares || !positionForm.avgCost) return setStatus("股票代號、股數、平均成本為必填。");
    const market = positionForm.market as Market;
    const newPosition: Position = { id: makeId(), market, symbol: positionForm.symbol.trim().toUpperCase(), name: positionForm.name.trim(), shares: Number(positionForm.shares), avgCost: Number(positionForm.avgCost), currentPrice: Number(positionForm.currentPrice || positionForm.avgCost), currency: marketCurrency(market), sector: positionForm.sector.trim() || "未分類", note: positionForm.note.trim() };
    setPositions([newPosition, ...positions]);
    setPositionForm({ market: "TW", symbol: "", name: "", shares: "", avgCost: "", currentPrice: "", sector: "", note: "" });
    setStatus("已新增庫存。本機已自動保存。");
  }

  function addTrade() {
    if (!tradeForm.symbol || !tradeForm.shares || !tradeForm.price) return setStatus("交易紀錄至少需輸入代號、股數與成交價。");
    const market = tradeForm.market as Market;
    const trade: Trade = { id: makeId(), date: tradeForm.date || today(), market, symbol: tradeForm.symbol.trim().toUpperCase(), side: tradeForm.side as TradeSide, shares: Number(tradeForm.shares), price: Number(tradeForm.price), fee: Number(tradeForm.fee || 0), tax: Number(tradeForm.tax || 0), currency: marketCurrency(market), note: tradeForm.note.trim() };
    setTrades([trade, ...trades]);
    setTradeForm({ date: today(), market: "TW", symbol: "", side: "BUY", shares: "", price: "", fee: "", tax: "", note: "" });
    setStatus("已新增交易紀錄。若要永久保存，請按同步到雲端。");
  }

  function addDividend() {
    if (!dividendForm.symbol || !dividendForm.shares || !dividendForm.amountPerShare) return setStatus("股利紀錄至少需輸入代號、股數與每股股利。");
    const market = dividendForm.market as Market;
    const dividend: Dividend = { id: makeId(), payDate: dividendForm.payDate || today(), market, symbol: dividendForm.symbol.trim().toUpperCase(), shares: Number(dividendForm.shares), amountPerShare: Number(dividendForm.amountPerShare), withholdingTax: Number(dividendForm.withholdingTax || 0), currency: marketCurrency(market), note: dividendForm.note.trim() };
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
            <p className="text-slate-600 mt-2">Email 無密碼登入 + Supabase 雲端同步版</p>
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

        {tab === "dashboard" && (
          <section className="space-y-6">
            <div className="grid md:grid-cols-4 gap-4">
              <Metric icon={<WalletCards />} title="總市值" value={fmt(totals.value)} sub={`成本 ${fmt(totals.cost)}`} />
              <Metric icon={<TrendingUp />} title="未實現損益" value={fmt(totals.unrealized)} sub={pct(totals.pnlPct)} positive={totals.unrealized >= 0} />
              <Metric icon={<ReceiptText />} title="已實現損益" value={fmt(totals.realized)} sub="依賣出交易估算" positive={totals.realized >= 0} />
              <Metric icon={<Coins />} title="股利收入" value={fmt(totals.dividendIncome)} sub={`總報酬 ${fmt(totals.totalReturn)}`} positive={totals.dividendIncome >= 0} />
            </div>
            <div className="grid xl:grid-cols-3 gap-6">
              <Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">月度統計</h2><div className="h-72"><ResponsiveContainer><BarChart data={monthlyReport}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v) => fmt(Number(v))} /><Legend /><Bar dataKey="buy" name="買進" fill="#2563eb" /><Bar dataKey="sell" name="賣出" fill="#16a34a" /><Bar dataKey="dividends" name="股利" fill="#f97316" /></BarChart></ResponsiveContainer></div></Card>
              <Card><h2 className="text-xl font-semibold mb-4">市場配置</h2><div className="h-72"><ResponsiveContainer><PieChart><Pie data={allocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>{allocation.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(v) => fmt(Number(v))} /><Legend /></PieChart></ResponsiveContainer></div><label className="text-sm flex items-center gap-2">USD/TWD<input type="number" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value) || 0)} className="input w-28" /></label></Card>
            </div>
          </section>
        )}

        {tab === "positions" && (
          <section className="grid xl:grid-cols-3 gap-6">
            <Card>
              <h2 className="text-xl font-semibold mb-3">新增庫存</h2>
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={positionForm.market} onChange={(e) => setPositionForm({ ...positionForm, market: e.target.value })}><option value="TW">台股</option><option value="US">美股</option></select>
                <input className="input" placeholder="代號" value={positionForm.symbol} onChange={(e) => setPositionForm({ ...positionForm, symbol: e.target.value })} />
                <input className="input" placeholder="名稱" value={positionForm.name} onChange={(e) => setPositionForm({ ...positionForm, name: e.target.value })} />
                <input className="input" placeholder="產業" value={positionForm.sector} onChange={(e) => setPositionForm({ ...positionForm, sector: e.target.value })} />
                <input className="input" type="number" placeholder="股數" value={positionForm.shares} onChange={(e) => setPositionForm({ ...positionForm, shares: e.target.value })} />
                <input className="input" type="number" placeholder="平均成本" value={positionForm.avgCost} onChange={(e) => setPositionForm({ ...positionForm, avgCost: e.target.value })} />
                <input className="input" type="number" placeholder="現價" value={positionForm.currentPrice} onChange={(e) => setPositionForm({ ...positionForm, currentPrice: e.target.value })} />
                <input className="input" placeholder="備註" value={positionForm.note} onChange={(e) => setPositionForm({ ...positionForm, note: e.target.value })} />
              </div>
              <button onClick={addPosition} className="btn w-full mt-3"><Plus size={16} />新增持股</button>
            </Card>
            <Card className="xl:col-span-2">
              <h2 className="text-xl font-semibold mb-4">庫存明細（可直接修改所有欄位）</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead><tr className="bg-slate-100 text-slate-600"><th className="p-3">市場</th><th className="p-3">代號</th><th className="p-3">名稱</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">平均成本</th><th className="p-3 text-right">現價</th><th className="p-3">產業</th><th className="p-3 text-right">市值</th><th className="p-3 text-right">損益</th><th className="p-3">備註</th><th className="p-3 text-center">操作</th></tr></thead>
                  <tbody>{enriched.map((p) => <tr key={p.id} className="border-b">
                    <td className="p-2"><select className="input w-20" value={p.market} onChange={(e) => updatePosition(p.id, "market", e.target.value)}><option value="TW">TW</option><option value="US">US</option></select></td>
                    <td className="p-2"><input className="input w-24" value={p.symbol} onChange={(e) => updatePosition(p.id, "symbol", e.target.value)} /></td>
                    <td className="p-2"><input className="input w-32" value={p.name} onChange={(e) => updatePosition(p.id, "name", e.target.value)} /></td>
                    <td className="p-2 text-right"><input className="input w-24 text-right" type="number" value={p.shares} onChange={(e) => updatePosition(p.id, "shares", e.target.value)} /></td>
                    <td className="p-2 text-right"><input className="input w-24 text-right" type="number" value={p.avgCost} onChange={(e) => updatePosition(p.id, "avgCost", e.target.value)} />{p.currency === "USD" && <div className="text-xs text-slate-500">{fmt(p.avgCostTwd)}</div>}</td>
                    <td className="p-2 text-right"><input className="input w-24 text-right" type="number" value={p.currentPrice} onChange={(e) => updatePosition(p.id, "currentPrice", e.target.value)} /></td>
                    <td className="p-2"><input className="input w-28" value={p.sector} onChange={(e) => updatePosition(p.id, "sector", e.target.value)} /></td>
                    <td className="p-2 text-right"><div>{fmt(p.value, p.currency, p.currency === "USD" ? 2 : 0)}</div><div className="text-xs text-slate-500">{fmt(p.valueTwd)}</div></td>
                    <td className={`p-2 text-right font-semibold ${p.pnl >= 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(p.pnl, p.currency, p.currency === "USD" ? 2 : 0)}<div className="text-xs text-slate-500">{fmt(p.pnlTwd)}</div></td>
                    <td className="p-2"><input className="input w-40" value={p.note} onChange={(e) => updatePosition(p.id, "note", e.target.value)} /></td>
                    <td className="p-2 text-center"><button onClick={() => { setPositions(positions.filter((x) => x.id !== p.id)); setStatus("已從網站刪除。若要同步刪除雲端資料，請按同步到雲端。"); }} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {tab === "trades" && <TradeSection tradeForm={tradeForm} setTradeForm={setTradeForm} trades={trades} setTrades={setTrades} addTrade={addTrade} realizedDetails={realizedDetails} fxRate={fxRate} />}
        {tab === "dividends" && <DividendSection dividendForm={dividendForm} setDividendForm={setDividendForm} dividends={dividends} setDividends={setDividends} addDividend={addDividend} fxRate={fxRate} />}

        {tab === "reports" && <Card><h2 className="text-xl font-semibold">績效報表</h2><p className="text-slate-500 mt-1">目前顯示目前庫存、已實現損益與股利收入。下一版可加 XIRR / TWR。</p><div className="grid md:grid-cols-4 gap-4 mt-5"><Metric title="投入成本" value={fmt(totals.cost)} sub="目前庫存" /><Metric title="總報酬" value={fmt(totals.totalReturn)} sub="未實現+已實現+股利" positive={totals.totalReturn >= 0} /><Metric title="已實現" value={fmt(totals.realized)} sub="賣出交易估算" positive={totals.realized >= 0} /><Metric title="股利收入" value={fmt(totals.dividendIncome)} sub="配息紀錄" positive={totals.dividendIncome >= 0} /></div></Card>}

        {tab === "settings" && <Card><h2 className="text-xl font-semibold mb-4">登入 / Supabase 雲端同步</h2><p className="text-sm text-slate-500 mb-3">登入狀態：{sessionEmail || "未登入"}</p><div className="grid md:grid-cols-2 gap-3 max-w-3xl"><input className="input" placeholder="請輸入 Email" value={email} onChange={(e) => setEmail(e.target.value)} /><button onClick={signIn} className="btn"><LogIn size={16} />寄送登入連結</button></div><div className="flex flex-wrap gap-2 mt-3"><button onClick={signOut} className="btn bg-slate-700"><LogOut size={16} />登出</button><button onClick={saveCloud} className="btn"><Save size={16} />同步到雲端</button><button onClick={loadCloud} className="btn"><RefreshCw size={16} />讀取雲端</button></div><div className="mt-4 text-sm text-slate-600">本網站採 Email 無密碼登入。第一次登入需到信箱點擊登入連結；登入後，瀏覽器會保留登入狀態，通常不需要每次重新收信。同步到雲端會讓 Supabase 資料完全等於目前網站資料。</div></Card>}
      </div>
    </main>
  );
}

function TradeSection({ tradeForm, setTradeForm, trades, setTrades, addTrade, realizedDetails, fxRate }: any) {
  return <section className="grid xl:grid-cols-3 gap-6"><Card><h2 className="text-xl font-semibold mb-3">新增交易紀錄</h2><div className="grid grid-cols-2 gap-3"><input className="input" type="date" value={tradeForm.date} onChange={(e) => setTradeForm({ ...tradeForm, date: e.target.value })} /><select className="input" value={tradeForm.market} onChange={(e) => setTradeForm({ ...tradeForm, market: e.target.value })}><option value="TW">台股</option><option value="US">美股</option></select><input className="input" placeholder="代號" value={tradeForm.symbol} onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value })} /><select className="input" value={tradeForm.side} onChange={(e) => setTradeForm({ ...tradeForm, side: e.target.value })}><option value="BUY">買進</option><option value="SELL">賣出</option></select><input className="input" type="number" placeholder="股數" value={tradeForm.shares} onChange={(e) => setTradeForm({ ...tradeForm, shares: e.target.value })} /><input className="input" type="number" placeholder="成交價" value={tradeForm.price} onChange={(e) => setTradeForm({ ...tradeForm, price: e.target.value })} /><input className="input" type="number" placeholder="手續費" value={tradeForm.fee} onChange={(e) => setTradeForm({ ...tradeForm, fee: e.target.value })} /><input className="input" type="number" placeholder="交易稅" value={tradeForm.tax} onChange={(e) => setTradeForm({ ...tradeForm, tax: e.target.value })} /><input className="input col-span-2" placeholder="備註" value={tradeForm.note} onChange={(e) => setTradeForm({ ...tradeForm, note: e.target.value })} /></div><button onClick={addTrade} className="btn w-full mt-3"><Plus size={16} />新增交易</button></Card><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">交易紀錄 / 已實現損益</h2><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-slate-100 text-slate-600"><th className="p-3">日期</th><th className="p-3">市場</th><th className="p-3">代號</th><th className="p-3">買賣</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">成交價</th><th className="p-3 text-right">費稅</th><th className="p-3 text-right">已實現TWD</th><th className="p-3">備註</th><th></th></tr></thead><tbody>{trades.map((t: Trade) => { const detail = realizedDetails.find((r: any) => r.id === t.id); const amountTwd = detail ? detail.pnlTwd : 0; return <tr key={t.id} className="border-b"><td className="p-2">{t.date}</td><td className="p-2">{t.market}</td><td className="p-2 font-semibold">{t.symbol}</td><td className="p-2">{t.side === "BUY" ? "買進" : "賣出"}</td><td className="p-2 text-right">{t.shares.toLocaleString()}</td><td className="p-2 text-right">{fmt(t.price, t.currency, t.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right">{fmt(t.fee + t.tax, t.currency, t.currency === "USD" ? 2 : 0)}</td><td className={`p-2 text-right font-semibold ${amountTwd >= 0 ? "text-red-600" : "text-emerald-600"}`}>{t.side === "SELL" ? fmt(amountTwd) : "-"}</td><td className="p-2">{t.note}</td><td className="p-2"><button onClick={() => setTrades(trades.filter((x: Trade) => x.id !== t.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>})}</tbody></table></div></Card></section>;
}

function DividendSection({ dividendForm, setDividendForm, dividends, setDividends, addDividend, fxRate }: any) {
  return <section className="grid xl:grid-cols-3 gap-6"><Card><h2 className="text-xl font-semibold mb-3">新增股利配息</h2><div className="grid grid-cols-2 gap-3"><input className="input" type="date" value={dividendForm.payDate} onChange={(e) => setDividendForm({ ...dividendForm, payDate: e.target.value })} /><select className="input" value={dividendForm.market} onChange={(e) => setDividendForm({ ...dividendForm, market: e.target.value })}><option value="TW">台股</option><option value="US">美股</option></select><input className="input" placeholder="代號" value={dividendForm.symbol} onChange={(e) => setDividendForm({ ...dividendForm, symbol: e.target.value })} /><input className="input" type="number" placeholder="股數" value={dividendForm.shares} onChange={(e) => setDividendForm({ ...dividendForm, shares: e.target.value })} /><input className="input" type="number" placeholder="每股股利/配息" value={dividendForm.amountPerShare} onChange={(e) => setDividendForm({ ...dividendForm, amountPerShare: e.target.value })} /><input className="input" type="number" placeholder="扣繳稅" value={dividendForm.withholdingTax} onChange={(e) => setDividendForm({ ...dividendForm, withholdingTax: e.target.value })} /><input className="input col-span-2" placeholder="備註" value={dividendForm.note} onChange={(e) => setDividendForm({ ...dividendForm, note: e.target.value })} /></div><button onClick={addDividend} className="btn w-full mt-3"><Plus size={16} />新增股利</button></Card><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">股利 / 配息紀錄</h2><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="bg-slate-100 text-slate-600"><th className="p-3">配息日</th><th className="p-3">市場</th><th className="p-3">代號</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">每股</th><th className="p-3 text-right">扣繳稅</th><th className="p-3 text-right">淨收入TWD</th><th className="p-3">備註</th><th></th></tr></thead><tbody>{dividends.map((d: Dividend) => { const net = (d.shares * d.amountPerShare - d.withholdingTax) * (d.currency === "USD" ? fxRate : 1); return <tr key={d.id} className="border-b"><td className="p-2">{d.payDate}</td><td className="p-2">{d.market}</td><td className="p-2 font-semibold">{d.symbol}</td><td className="p-2 text-right">{d.shares.toLocaleString()}</td><td className="p-2 text-right">{fmt(d.amountPerShare, d.currency, d.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right">{fmt(d.withholdingTax, d.currency, d.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right font-semibold text-red-600">{fmt(net)}</td><td className="p-2">{d.note}</td><td className="p-2"><button onClick={() => setDividends(dividends.filter((x: Dividend) => x.id !== d.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>})}</tbody></table></div></Card></section>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

function Metric({ icon, title, value, sub, positive }: { icon?: React.ReactNode; title: string; value: string; sub?: string; positive?: boolean }) {
  return <Card><div className="flex justify-between"><div><p className="text-sm text-slate-500">{title}</p><p className={`text-2xl font-bold mt-2 ${positive === true ? "text-red-600" : positive === false ? "text-emerald-600" : ""}`}>{value}</p><p className="text-sm text-slate-500 mt-1">{sub}</p></div>{icon && <div className="text-blue-700 bg-blue-50 rounded-2xl p-3 h-fit">{icon}</div>}</div></Card>;
}
