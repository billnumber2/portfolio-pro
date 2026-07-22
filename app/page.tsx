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
  side: "BUY" | "SELL";
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

const STORAGE_KEY = "portfolio-pro-local-v2";

const colors = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#9333ea",
  "#dc2626",
  "#0891b2",
];

const defaultPositions: Position[] = [
  {
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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

  const currentPrice = Number(
    raw.currentPrice ??
      raw.current_price ??
      raw.現價 ??
      raw.price ??
      raw.avgCost ??
      raw.avg_cost ??
      raw.平均成本 ??
      0
  );

  return {
    id: raw.id || crypto.randomUUID(),
    market,
    symbol: String(raw.symbol || raw.代號 || "").trim().toUpperCase(),
    name: String(raw.name || raw.stock_name || raw.名稱 || "").trim(),
    shares: Number(raw.shares || raw.股數 || 0),
    avgCost: Number(raw.avgCost ?? raw.avg_cost ?? raw.平均成本 ?? 0),
    currentPrice,
    currency: raw.currency || raw.幣別 || marketCurrency(market),
    sector: String(raw.sector || raw.產業 || "未分類"),
    note: String(raw.note || raw.備註 || ""),
    updatedAt: raw.updated_at || raw.updatedAt,
  };
}

function normalizeTrade(raw: any): Trade {
  const market = normMarket(raw.market || raw.市場);
  const rawSide = String(raw.side || raw.買賣 || "BUY");

  const side =
    rawSide.toUpperCase().includes("SELL") || rawSide.includes("賣")
      ? "SELL"
      : "BUY";

  return {
    id: raw.id || crypto.randomUUID(),
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
    id: raw.id || crypto.randomUUID(),
    payDate: raw.payDate || raw.pay_date || raw.配息日 || today(),
    market,
    symbol: String(raw.symbol || raw.代號 || "").trim().toUpperCase(),
    shares: Number(raw.shares || raw.股數 || 0),
    amountPerShare: Number(
      raw.amountPerShare ?? raw.amount_per_share ?? raw.每股股利 ?? 0
    ),
    withholdingTax: Number(
      raw.withholdingTax ?? raw.withholding_tax ?? raw.扣繳稅 ?? 0
    ),
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

  const [status, setStatus] = useState(
    "本機 localStorage 已啟用；登入後可同步 Supabase。"
  );

  const [form, setForm] = useState({
    market: "TW",
    symbol: "",
    name: "",
    shares: "",
    avgCost: "",
    currentPrice: "",
    sector: "",
    note: "",
  });

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

      if (userEmail) {
        setStatus(`已登入：${userEmail}`);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userEmail = session?.user.email || "";
      setSessionEmail(userEmail);

      if (userEmail) {
        setStatus(`已登入：${userEmail}`);
      } else {
        setStatus("目前未登入。");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        positions,
        trades,
        dividends,
        fxRate,
      })
    );
  }, [positions, trades, dividends, fxRate]);

  const enriched = useMemo(() => {
    return positions.map((p) => {
      const toTwd = p.currency === "USD" ? fxRate : 1;
      const cost = Number(p.shares) * Number(p.avgCost);
      const value = Number(p.shares) * Number(p.currentPrice);
      const pnl = value - cost;
      const pnlPct = cost ? (pnl / cost) * 100 : 0;

      return {
        ...p,
        cost,
        value,
        pnl,
        pnlPct,
        avgCostTwd: Number(p.avgCost) * toTwd,
        costTwd: cost * toTwd,
        valueTwd: value * toTwd,
        pnlTwd: pnl * toTwd,
      };
    });
  }, [positions, fxRate]);

  const totals = useMemo(() => {
    const cost = enriched.reduce((sum, p) => sum + p.costTwd, 0);
    const value = enriched.reduce((sum, p) => sum + p.valueTwd, 0);
    const unrealized = value - cost;

    const realized = trades
      .filter((t) => t.side === "SELL")
      .reduce((sum, t) => {
        const position = positions.find(
          (p) => p.market === t.market && p.symbol === t.symbol
        );

        const avgCost = position?.avgCost || 0;

        const pnl =
          (Number(t.price) - avgCost) * Number(t.shares) -
          Number(t.fee || 0) -
          Number(t.tax || 0);

        return sum + pnl * (t.currency === "USD" ? fxRate : 1);
      }, 0);

    const dividendIncome = dividends.reduce((sum, d) => {
      const income =
        Number(d.shares) * Number(d.amountPerShare) -
        Number(d.withholdingTax || 0);

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
  }, [enriched, trades, dividends, fxRate, positions]);

  const allocation = useMemo(() => {
    const tw = enriched
      .filter((p) => p.market === "TW")
      .reduce((sum, p) => sum + p.valueTwd, 0);

    const us = enriched
      .filter((p) => p.market === "US")
      .reduce((sum, p) => sum + p.valueTwd, 0);

    return [
      { name: "台股", value: tw },
      { name: "美股", value: us },
    ].filter((item) => item.value > 0);
  }, [enriched]);

  const monthlyReport = useMemo(() => {
    const map = new Map<string, any>();

    trades.forEach((t) => {
      const key = String(t.date).slice(0, 7);

      const item = map.get(key) || {
        month: key,
        buy: 0,
        sell: 0,
        dividends: 0,
      };

      const amount =
        Number(t.shares) *
        Number(t.price) *
        (t.currency === "USD" ? fxRate : 1);

      if (t.side === "BUY") {
        item.buy += amount;
      } else {
        item.sell += amount;
      }

      map.set(key, item);
    });

    dividends.forEach((d) => {
      const key = String(d.payDate).slice(0, 7);

      const item = map.get(key) || {
        month: key,
        buy: 0,
        sell: 0,
        dividends: 0,
      };

      item.dividends +=
        (Number(d.shares) * Number(d.amountPerShare) -
          Number(d.withholdingTax || 0)) *
        (d.currency === "USD" ? fxRate : 1);

      map.set(key, item);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );
  }, [trades, dividends, fxRate]);

  async function signIn() {
    if (!email) {
      return setStatus("請輸入 Email。");
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: location.origin,
      },
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("已寄出 Magic Link，請到信箱點擊登入連結。");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSessionEmail("");
    setStatus("已登出。");
  }

  async function loadCloud() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      return setStatus("請先登入。");
    }

    setSessionEmail(user.email || "");

    const [positionsResult, tradesResult, dividendsResult] =
      await Promise.all([
        supabase
          .from("positions")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
        supabase.from("trades").select("*").eq("user_id", user.id),
        supabase.from("dividends").select("*").eq("user_id", user.id),
      ]*;

    if (positionsResult.error |* tradesResult.error || dividendsRe*ult.error) {
      return setStatu*(
        positionsResult.error?.m*ssage ||
          tradesResult.er*or?.message ||
          dividends*esult.error?.message ||
          *讀取雲端資料失敗。"
      );
    }

    set*ositions((positionsResult.data || *]).map(normalizePosition));
    se*Trades((tradesResult.data || []).m*p(normalizeTrade));
    setDividen*s((dividendsResult.data || []).map*normalizeDividend));

    setStatu*("已從 Supabase 讀取資料。");
  }

  asyn* function saveCloud() {
    const * data: sessionData } = await supab*se.auth.getSession();
    const us*r = sessionData.session?.user;

  * if (!user) {
      return setStat*s("請先登入。");
    }

    const posRo*s = positions.map((p) => ({
      *d: p.id,
      user_id: user.id,
 *    market: p.market,
      symbol* p.symbol,
      stock_name: p.nam*,
      name: p.name,
      shares* p.shares,
      avg_cost: p.avgCo*t,
      current_price: p.currentP*ice,
      currency: p.currency,
 *    sector: p.sector,
      note: *.note,
      updated_at: new Date(*
