"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
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

const STORAGE_KEY = "portfolio-pro-local-v1";

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
    note: "示範資料",
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
    note: "示範資料",
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
      const saved = JSON.parse(raw);
      setPositions(saved.positions || defaultPositions);
      setTrades(saved.trades || []);
      setDividends(saved.dividends || []);
      setFxRate(saved.fxRate || 32.2);
    } else {
      setPositions(defaultPositions);
    }

    supabase.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user.email || "");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email || "");

      if (session?.user.email) {
        setStatus(`已登入：${session.user.email}`);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect((
