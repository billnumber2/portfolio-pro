"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Upload, Download, Plus, Trash2, RefreshCw, Save, LogIn, LogOut, WalletCards, TrendingUp, Coins, ReceiptText } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";

type Market = "TW" | "US";
type Position = { id: string; market: Market; symbol: string; name: string; shares: number; avgCost: number; currentPrice: number; currency: string; sector: string; note: string; updatedAt?: string; };
type Trade = { id: string; date: string; market: Market; symbol: string; side: "BUY" | "SELL"; shares: number; price: number; fee: number; tax: number; currency: string; note: string; };
type Dividend = { id: string; payDate: string; market: Market; symbol: string; shares: number; amountPerShare: number; withholdingTax: number; currency: string; note: string; };

const STORAGE_KEY = "portfolio-pro-local-v1";
const colors = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];
const defaultPositions: Position[] = [
  { id: crypto.randomUUID(), market: "TW", symbol: "2330", name: "台積電", shares: 10, avgCost: 850, currentPrice: 980, currency: "TWD", sector: "半導體", note: "示範資料" },
  { id: crypto.randomUUID(), market: "US", symbol: "AAPL", name: "Apple", shares: 5, avgCost: 185, currentPrice: 212, currency: "USD", sector: "科技", note: "示範資料" },
];

function today() { return new Date().toISOString().slice(0, 10); }
function marketCurrency(market: Market) { return market === "US" ? "USD" : "TWD"; }
function fmt(v: number, c = "TWD", d = 0) { return `${c === "USD" ? "US$" : "NT$"}${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })}`; }
function pct(v: number) { return `${v >= 0 ? "+" : ""}${Number(v || 0).toFixed(2)}%`; }
function normMarket(v: any): Market { return String(v || "TW").toUpperCase().includes("US") ? "US" : "TW"; }
function normalizePosition(r: any): Position {
  const market = normMarket(r.market || r.市場);
  const price = Number(r.currentPrice ?? r.current_price ?? r.現價 ?? r.price ?? r.avgCost ?? r.avg_cost ?? r.平均成本 ?? 0);
  return {
    id: r.id || crypto.randomUUID(), market, symbol: String(r.symbol || r.代號 || "").trim().toUpperCase(),
    name: String(r.name || r.stock_name || r.名稱 || "").trim(), shares: Number(r.shares || r.股數 || 0),
    avgCost: Number(r.avgCost ?? r.avg_cost ?? r.平均成本 ?? 0), currentPrice: price,
    currency: r.currency || r.幣別 || marketCurrency(market), sector: String(r.sector || r.產業 || "未分類"), note: String(r.note || r.備註 || ""), updatedAt: r.updated_at || r.updatedAt
  };
}
function normalizeTrade(r: any): Trade {
  const market = normMarket(r.market || r.市場);
  const side = String(r.side || r.買賣 || "BUY").toUpperCase().includes("SELL") || String(r.買賣 || "").includes("賣") ? "SELL" : "BUY";
  return { id: r.id || crypto.randomUUID(), date: r.date || r.trade_date || r.交易日期 || today(), market, symbol: String(r.symbol || r.代號 || "").trim().toUpperCase(), side, shares: Number(r.shares || r.股數 || 0), price: Number(r.price || r.成交價 || 0), fee: Number(r.fee || r.手續費 || 0), tax: Number(r.tax || r.交易稅 || 0), currency: r.currency || marketCurrency(market), note: String(r.note || r.備註 || "") };
}
function normalizeDividend(r: any): Dividend {
  const market = normMarket(r.market || r.市場);
  return { id: r.id || crypto.randomUUID(), payDate: r.payDate || r.pay_date || r.配息日 || today(), market, symbol: String(r.symbol || r.代號 || "").trim().toUpperCase(), shares: Number(r.shares || r.股數 || 0), amountPerShare: Number(r.amountPerShare ?? r.amount_per_share ?? r.每股股利 ?? 0), withholdingTax: Number(r.withholdingTax ?? r.withholding_tax ?? r.扣繳稅 ?? 0), currency: r.currency || marketCurrency(market), note: String(r.note || r.備註 || "") };
}

export default function Page() {
  const [tab, setTab] = useState("dashboard");
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [fxRate, setFxRate] = useState(32.2);
  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");
  const [status, setStatus] = useState("本機 localStorage 已啟用；登入後可同步 Supabase。");
  const [form, setForm] = useState({ market: "TW", symbol: "", name: "", shares: "", avgCost: "", currentPrice: "", sector: "", note: "" });

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const s = JSON.parse(raw); setPositions(s.positions || defaultPositions); setTrades(s.trades || []); setDividends(s.dividends || []); setFxRate(s.fxRate || 32.2); }
    else setPositions(defaultPositions);
    supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email || ""));
  }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, trades, dividends, fxRate })); }, [positions, trades, dividends, fxRate]);

  const enriched = useMemo(() => positions.map(p => {
    const toTwd = p.currency === "USD" ? fxRate : 1; const cost = p.shares * p.avgCost; const value = p.shares * p.currentPrice; const pnl = value - cost;
    return { ...p, avgCostTwd: p.avgCost * toTwd, costTwd: cost * toTwd, value, valueTwd: value * toTwd, pnl, pnlTwd: pnl * toTwd, pnlPct: cost ? pnl / cost * 100 : 0 };
  }), [positions, fxRate]);
  const totals = useMemo(() => {
    const cost = enriched.reduce((s, p) => s + p.costTwd, 0); const value = enriched.reduce((s, p) => s + p.valueTwd, 0);
    const realized = trades.filter(t => t.side === "SELL").reduce((s, t) => { const p = positions.find(p => p.market === t.market && p.symbol === t.symbol); return s + ((t.price - (p?.avgCost || 0)) * t.shares - t.fee - t.tax) * (t.currency === "USD" ? fxRate : 1); }, 0);
    const div = dividends.reduce((s, d) => s + (d.shares * d.amountPerShare - d.withholdingTax) * (d.currency === "USD" ? fxRate : 1), 0);
    return { cost, value, unrealized: value - cost, pnlPct: cost ? (value - cost) / cost * 100 : 0, realized, div, totalReturn: value - cost + realized + div };
  }, [enriched, trades, dividends, fxRate, positions]);
  const allocation = [{ name: "台股", value: enriched.filter(p => p.market === "TW").reduce((s, p) => s + p.valueTwd, 0) }, { name: "美股", value: enriched.filter(p => p.market === "US").reduce((s, p) => s + p.valueTwd, 0) }].filter(x => x.value > 0);
  const monthlyReport = useMemo(() => {
    const m = new Map<string, any>();
    trades.forEach(t => { const k = String(t.date).slice(0,7); const o = m.get(k) || { month:k,buy:0,sell:0,dividends:0 }; o[t.side === "BUY" ? "buy" : "sell"] += t.shares*t.price*(t.currency === "USD" ? fxRate : 1); m.set(k,o); });
    dividends.forEach(d => { const k = String(d.payDate).slice(0,7); const o = m.get(k) || { month:k,buy:0,sell:0,dividends:0 }; o.dividends += (d.shares*d.amountPerShare-d.withholdingTax)*(d.currency === "USD" ? fxRate : 1); m.set(k,o); });
    return Array.from(m.values()).sort((a,b)=>a.month.localeCompare(b.month));
  }, [trades, dividends, fxRate]);

  async function signIn() { if (!email) return setStatus("請輸入 Email"); const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); setStatus(error ? error.message : "已寄出 Magic Link，請到信箱點擊登入連結。") }
  async function signOut() { await supabase.auth.signOut(); setSessionEmail(""); setStatus("已登出。") }
  async function loadCloud() {
    const { data: sess } = await supabase.auth.getSession(); const user = sess.session?.user; if (!user) return setStatus("請先登入。 "); setSessionEmail(user.email || "");
    const [p,t,d] = await Promise.all([supabase.from("positions").select("*").eq("user_id", user.id), supabase.from("trades").select("*").eq("user_id", user.id), supabase.from("dividends").select("*").eq("user_id", user.id)]);
    if (p.error || t.error || d.error) return setStatus((p.error || t.error || d.error)?.message || "讀取失敗");
    setPositions((p.data || []).map(normalizePosition)); setTrades((t.data || []).map(normalizeTrade)); setDividends((d.data || []).map(normalizeDividend)); setStatus("已從 Supabase 讀取資料。");
  }
  async function saveCloud() {
    const { data: sess } = await supabase.auth.getSession(); const user = sess.session?.user; if (!user) return setStatus("請先登入。 ");
    const posRows = positions.map(p => ({ id:p.id, user_id:user.id, market:p.market, symbol:p.symbol, stock_name:p.name, name:p.name, shares:p.shares, avg_cost:p.avgCost, current_price:p.currentPrice, currency:p.currency, sector:p.sector, note:p.note, updated_at:new Date().toISOString() }));
    const tradeRows = trades.map(t => ({ id:t.id, user_id:user.id, trade_date:t.date, date:t.date, market:t.market, symbol:t.symbol, side:t.side, shares:t.shares, price:t.price, fee:t.fee, tax:t.tax, currency:t.currency, note:t.note }));
    const divRows = dividends.map(d => ({ id:d.id, user_id:user.id, pay_date:d.payDate, market:d.market, symbol:d.symbol, shares:d.shares, amount_per_share:d.amountPerShare, withholding_tax:d.withholdingTax, currency:d.currency, note:d.note }));
    const [p,t,d] = await Promise.all([supabase.from("positions").upsert(posRows), supabase.from("trades").upsert(tradeRows), supabase.from("dividends").upsert(divRows)]);
    if (p.error || t.error || d.error) return setStatus((p.error || t.error || d.error)?.message || "同步失敗");
    setStatus("已同步至 Supabase。")
  }
  function addPosition() { if (!form.symbol || !form.shares || !form.avgCost) return setStatus("股票代號、股數、平均成本為必填。"); const market = form.market as Market; setPositions([{ id: crypto.randomUUID(), market, symbol: form.symbol.toUpperCase(), name: form.name, shares: Number(form.shares), avgCost: Number(form.avgCost), currentPrice: Number(form.currentPrice || form.avgCost), currency: marketCurrency(market), sector: form.sector || "未分類", note: form.note }, ...positions]); setForm({ market:"TW", symbol:"", name:"", shares:"", avgCost:"", currentPrice:"", sector:"", note:"" }); }
  function exportCsv() { const header = ["market","symbol","name","shares","avgCost","currentPrice","currency","sector","note"]; const rows = positions.map(p => header.map(h => `"${String((p as any)[h] ?? "").replaceAll('"','""')}"`).join(",")); const blob = new Blob(["\ufeff"+[header.join(","),...rows].join("\n")], {type:"text/csv;charset=utf-8"}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download="positions.csv"; a.click(); URL.revokeObjectURL(a.href); }
  async function importExcel(e: any) { const file = e.target.files?.[0]; if (!file) return; const wb = XLSX.read(await file.arrayBuffer()); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:"" }); setPositions([...rows.map(normalizePosition).filter(p => p.symbol), ...positions]); setStatus(`已匯入 ${rows.length} 筆 Excel 資料。`); e.target.value=""; }

  return <main className="min-h-screen p-4 md:p-8 bg-slate-50">
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div><p className="text-blue-700 font-medium">Portfolio Pro</p><h1 className="text-3xl md:text-4xl font-bold">台股 + 美股投資庫存與績效追蹤</h1><p className="text-slate-600 mt-2">localStorage + Supabase 雲端同步版</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={exportCsv} className="btn"><Download size={16}/>匯出CSV</button><label className="btn bg-white text-slate-700 cursor-pointer"><Upload size={16}/>匯入Excel<input type="file" accept=".xlsx,.xls" onChange={importExcel} className="hidden"/></label></div>
      </header>
      <nav className="bg-white p-2 rounded-3xl shadow-sm flex flex-wrap gap-2">{[["dashboard","總覽"],["positions","庫存"],["reports","報表"],["settings","登入/雲端"]].map(([k,l])=><button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-2xl ${tab===k?"bg-blue-600 text-white":"hover:bg-slate-100"}`}>{l}</button>)}</nav>
      <div className="bg-blue-50 text-blue-900 rounded-2xl p-3 text-sm">{status}</div>

      {tab === "dashboard" && <section className="space-y-6">
        <div className="grid md:grid-cols-4 gap-4"><Metric icon={<WalletCards/>} title="總市值" value={fmt(totals.value)} sub={`成本 ${fmt(totals.cost)}`}/><Metric icon={<TrendingUp/>} title="未實現損益" value={fmt(totals.unrealized)} sub={pct(totals.pnlPct)} positive={totals.unrealized>=0}/><Metric icon={<ReceiptText/>} title="已實現損益" value={fmt(totals.realized)} sub="依交易紀錄估算" positive={totals.realized>=0}/><Metric icon={<Coins/>} title="股利收入" value={fmt(totals.div)} sub={`總報酬 ${fmt(totals.totalReturn)}`} positive={totals.div>=0}/></div>
        <div className="grid xl:grid-cols-3 gap-6"><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">月度統計</h2><div className="h-72"><ResponsiveContainer><BarChart data={monthlyReport}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis/><Tooltip formatter={(v)=>fmt(Number(v))}/><Legend/><Bar dataKey="buy" name="買進" fill="#2563eb"/><Bar dataKey="sell" name="賣出" fill="#16a34a"/><Bar dataKey="dividends" name="股利" fill="#f97316"/></BarChart></ResponsiveContainer></div></Card><Card><h2 className="text-xl font-semibold mb-4">市場配置</h2><div className="h-72"><ResponsiveContainer><PieChart><Pie data={allocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>{allocation.map((e,i)=><Cell key={e.name} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={(v)=>fmt(Number(v))}/><Legend/></PieChart></ResponsiveContainer></div><label className="text-sm flex items-center gap-2">USD/TWD <input type="number" value={fxRate} onChange={e=>setFxRate(Number(e.target.value)||0)} className="input w-28"/></label></Card></div>
      </section>}

      {tab === "positions" && <section className="grid xl:grid-cols-3 gap-6"><Card><h2 className="text-xl font-semibold mb-3">新增庫存</h2><div className="grid grid-cols-2 gap-3"><select className="input" value={form.market} onChange={e=>setForm({...form, market:e.target.value})}><option value="TW">台股</option><option value="US">美股</option></select><input className="input" placeholder="代號" value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value})}/><input className="input" placeholder="名稱" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input className="input" placeholder="產業" value={form.sector} onChange={e=>setForm({...form,sector:e.target.value})}/><input className="input" type="number" placeholder="股數" value={form.shares} onChange={e=>setForm({...form,shares:e.target.value})}/><input className="input" type="number" placeholder="平均成本" value={form.avgCost} onChange={e=>setForm({...form,avgCost:e.target.value})}/><input className="input" type="number" placeholder="現價" value={form.currentPrice} onChange={e=>setForm({...form,currentPrice:e.target.value})}/><input className="input" placeholder="備註" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></div><button onClick={addPosition} className="btn w-full mt-3"><Plus size={16}/>新增持股</button></Card><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">庫存明細</h2><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-slate-100 text-slate-600"><th className="p-3 text-left">市場</th><th className="p-3 text-left">代號/名稱</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">平均成本</th><th className="p-3 text-right">現價</th><th className="p-3 text-right">市值</th><th className="p-3 text-right">損益</th><th></th></tr></thead><tbody>{enriched.map(p=><tr key={p.id} className="border-b"><td className="p-3">{p.market}</td><td className="p-3 font-semibold">{p.symbol}<span className="text-slate-500 font-normal ml-2">{p.name}</span><div className="text-xs text-slate-500">{p.sector}</div></td><td className="p-3 text-right">{p.shares.toLocaleString()}</td><td className="p-3 text-right"><div>{fmt(p.avgCost,p.currency,p.currency==="USD"?2:0)}</div>{p.currency==="USD"&&<div className="text-xs text-slate-500">{fmt(p.avgCostTwd)}</div>}</td><td className="p-3 text-right"><input className="input w-24 text-right" type="number" value={p.currentPrice} onChange={e=>setPositions(positions.map(x=>x.id===p.id?{...x,currentPrice:Number(e.target.value)}:x))}/></td><td className="p-3 text-right"><div>{fmt(p.value,p.currency,p.currency==="USD"?2:0)}</div><div className="text-xs text-slate-500">{fmt(p.valueTwd)}</div></td><td className={`p-3 text-right font-semibold ${p.pnl>=0?"text-red-600":"text-emerald-600"}`}>{fmt(p.pnl,p.currency,p.currency==="USD"?2:0)}<div className="text-xs text-slate-500">{fmt(p.pnlTwd)}</div></td><td><button onClick={()=>setPositions(positions.filter(x=>x.id!==p.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={16}/></button></td></tr>)}</tbody></table></div></Card></section>}

      {tab === "reports" && <Card><h2 className="text-xl font-semibold">績效報表</h2><p className="text-slate-500 mt-1">目前顯示總投入、未實現、已實現與股利收入。下一版可加 XIRR / TWR。</p><div className="grid md:grid-cols-4 gap-4 mt-5"><Metric title="投入成本" value={fmt(totals.cost)} sub="目前庫存"/><Metric title="總報酬" value={fmt(totals.totalReturn)} sub="未實現+已實現+股利" positive={totals.totalReturn>=0}/><Metric title="已實現" value={fmt(totals.realized)} sub="交易紀錄" positive={totals.realized>=0}/><Metric title="股利收入" value={fmt(totals.div)} sub="配息紀錄" positive={totals.div>=0}/></div></Card>}

      {tab === "settings" && <Card><h2 className="text-xl font-semibold mb-4">登入 / Supabase 雲端同步</h2><p className="text-sm text-slate-500 mb-3">登入狀態：{sessionEmail || "未登入"}</p><div className="flex flex-wrap gap-2"><input className="input min-w-72" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><button onClick={signIn} className="btn"><LogIn size={16}/>寄送登入連結</button><button onClick={signOut} className="btn bg-slate-700"><LogOut size={16}/>登出</button><button onClick={saveCloud} className="btn"><Save size={16}/>同步到雲端</button><button onClick={loadCloud} className="btn"><RefreshCw size={16}/>讀取雲端</button></div><div className="mt-4 text-sm text-slate-600">請先在 Supabase Authentication 開啟 Email Provider，並在 Vercel 設定 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。</div></Card>}
    </div>
  </main>;
}
function Card({children, className=""}: any){ return <div className={`bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div> }
function Metric({ icon, title, value, sub, positive }: any){ return <Card><div className="flex justify-between"><div><p className="text-sm text-slate-500">{title}</p><p className={`text-2xl font-bold mt-2 ${positive===true?"text-red-600":positive===false?"text-emerald-600":""}`}>{value}</p><p className="text-sm text-slate-500 mt-1">{sub}</p></div>{icon&&<div className="text-blue-700 bg-blue-50 rounded-2xl p-3 h-fit">{icon}</div>}</div></Card> }
