"use client";

import { useEffect, useMemo, useState } from "react";

type TradeSide = "buy" | "sell" | "dividend" | "split";
type Market = "US" | "TW";

type TradeForm = {
  trade_date: string;
  market: Market;
  symbol: string;
  stock_name: string;
  side: TradeSide;
  shares: string;
  price: string;
  cash_amount: string;
  fee: string;
  tax: string;
  exchange_rate: string;
  split_from: string;
  split_to: string;
  memo: string;
};

type TradeRow = {
  id: string;
  trade_date: string;
  market: string;
  symbol: string;
  stock_name: string | null;
  side: string;
  shares: number | string | null;
  price: number | string | null;
  cash_amount: number | string | null;
  currency: string | null;
  fee: number | string | null;
  tax: number | string | null;
  exchange_rate: number | string | null;
  split_from: number | string | null;
  split_to: number | string | null;
  memo: string | null;
  created_at?: string | null;
};

const today = new Date().toISOString().slice(0, 10);

const initialForm: TradeForm = {
  trade_date: today,
  market: "US",
  symbol: "",
  stock_name: "",
  side: "buy",
  shares: "",
  price: "",
  cash_amount: "",
  fee: "0",
  tax: "0",
  exchange_rate: "1",
  split_from: "",
  split_to: "",
  memo: "manual",
};

const sideOptions: TradeSide[] = ["buy", "sell", "dividend", "split"];
const marketOptions: Market[] = ["US", "TW"];

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function getCurrency(market: string) {
  return market === "US" ? "USD" : "TWD";
}

function valueToString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toNumber(value: unknown, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sameNumber(a: unknown, b: unknown) {
  return Math.abs(toNumber(a) - toNumber(b)) < 0.000001;
}

function rowToForm(row: TradeRow): TradeForm {
  return {
    trade_date: valueToString(row.trade_date),
    market: (row.market === "TW" ? "TW" : "US") as Market,
    symbol: valueToString(row.symbol),
    stock_name: valueToString(row.stock_name || row.symbol),
    side: (sideOptions.includes(row.side as TradeSide) ? row.side : "buy") as TradeSide,
    shares: valueToString(row.shares),
    price: valueToString(row.price),
    cash_amount: valueToString(row.cash_amount),
    fee: valueToString(row.fee || 0),
    tax: valueToString(row.tax || 0),
    exchange_rate: valueToString(row.exchange_rate || 1),
    split_from: valueToString(row.split_from),
    split_to: valueToString(row.split_to),
    memo: valueToString(row.memo || "manual"),
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-slate-700">{children}</label>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      required={required}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    />
  );
}

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    >
      {children}
    </select>
  );
}

export default function ManualTradePage() {
  const [form, setForm] = useState<TradeForm>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [filterSymbol, setFilterSymbol] = useState("");
  const [showAllMemo, setShowAllMemo] = useState(true);

  const currency = useMemo(() => getCurrency(form.market), [form.market]);

  const possibleDuplicate = useMemo(() => {
    const symbol = normalizeSymbol(form.symbol);
    if (!form.trade_date || !symbol || !form.side) return null;

    return (
      trades.find((row) => {
        if (editingId && row.id === editingId) return false;
        return (
          row.trade_date === form.trade_date &&
          row.market === form.market &&
          row.symbol === symbol &&
          String(row.side || "").toLowerCase() === form.side &&
          sameNumber(row.shares, form.shares) &&
          sameNumber(row.price, form.price)
        );
      }) || null
    );
  }, [form, trades, editingId]);

  function updateForm<K extends keyof TradeForm>(key: K, value: TradeForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleMarketChange(market: Market) {
    setForm((current) => ({
      ...current,
      market,
      exchange_rate: market === "TW" ? "1" : current.exchange_rate || "1",
    }));
  }

  async function loadTrades() {
    setLoadingTrades(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (filterSymbol.trim()) params.set("symbol", normalizeSymbol(filterSymbol));
      if (!showAllMemo) params.set("memo", "manual");

      const response = await fetch(`/api/trades/manual?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "讀取交易清單失敗");
      }

      setTrades(result.trades || []);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setLoadingTrades(false);
    }
  }

  useEffect(() => {
    loadTrades();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("送出中...");
    setLastResult(null);

    try {
      if (!editingId && possibleDuplicate) {
        throw new Error(
          `發現疑似重複交易：${possibleDuplicate.trade_date} ${possibleDuplicate.symbol} ${possibleDuplicate.side}，請先確認下方最近50筆交易紀錄。`
        );
      }

      const payload = {
        ...form,
        symbol: normalizeSymbol(form.symbol),
        stock_name: form.stock_name.trim() || normalizeSymbol(form.symbol),
      };

      const response = await fetch("/api/trades/manual", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });

      const result = await response.json();
      setLastResult(result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || (editingId ? "更新交易失敗" : "新增交易失敗"));
      }

      setMessage(editingId ? "交易更新成功。可以按一鍵更新投資組合。" : "新增成功，已加入最近50筆交易清單。可以繼續新增下一筆。");
      setEditingId(null);
      setForm((current) => ({
        ...initialForm,
        trade_date: current.trade_date,
        market: current.market,
        exchange_rate: current.market === "TW" ? "1" : current.exchange_rate,
        memo: current.memo || "manual",
      }));
      await loadTrades();
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(row: TradeRow) {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setMessage("正在編輯既有交易。修改後請按更新交易。");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
    setMessage("");
  }

  async function handleDelete(row: TradeRow) {
    const ok = window.confirm(`確認刪除 ${row.trade_date} ${row.symbol} ${row.side} 這筆交易？`);
    if (!ok) return;

    setMessage("刪除中...");
    try {
      const response = await fetch(`/api/trades/manual?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const result = await response.json();
      setLastResult(result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || "刪除交易失敗");
      }

      if (editingId === row.id) cancelEdit();

      setMessage("交易已刪除。可以按一鍵更新投資組合。");
      await loadTrades();
    } catch (error: any) {
      setMessage(error?.message || String(error));
    }
  }

  async function handleUpdatePortfolio() {
    setUpdating(true);
    setUpdateMessage("投資組合更新中...");
    setUpdateResult(null);

    try {
      const endDate = new Date().toISOString().slice(0, 10);
      const response = await fetch(
        `/api/portfolio/update-all?start=2024-08-06&end=${endDate}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = await response.json();
      setUpdateResult(result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || "一鍵更新失敗");
      }

      setUpdateMessage("一鍵更新完成。請回首頁重新整理查看最新績效。");
      await loadTrades();
    } catch (error: any) {
      setUpdateMessage(error?.message || String(error));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <section className="mx-auto max-w-7xl space-y-6">
        <div>
          <a href="/" className="text-sm font-medium text-blue-600 hover:underline">
            ← 回首頁
          </a>
          <h1 className="mt-2 text-3xl font-bold">手動新增 / 編輯交易</h1>
          <p className="mt-2 text-slate-600">
            可以新增、編輯、刪除 trades 資料。下方會顯示最近50筆交易，避免重複填入。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-sm">
          {editingId && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              目前正在編輯交易 ID：{editingId}
            </div>
          )}

          {possibleDuplicate && !editingId && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-bold">⚠ 發現疑似重複交易</p>
              <p className="mt-1">
                下方最近50筆中已有：{possibleDuplicate.trade_date} {possibleDuplicate.market} {possibleDuplicate.symbol} {possibleDuplicate.side}，股數 {valueToString(possibleDuplicate.shares)}，價格 {valueToString(possibleDuplicate.price)}。
              </p>
              <p className="mt-1">請確認是否已經填入過，避免重複新增。</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>交易日期</FieldLabel>
              <TextInput type="date" required value={form.trade_date} onChange={(value) => updateForm("trade_date", value)} />
            </div>

            <div>
              <FieldLabel>市場</FieldLabel>
              <SelectInput value={form.market} onChange={(value) => handleMarketChange(value as Market)}>
                {marketOptions.map((market) => (
                  <option key={market} value={market}>{market}</option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>股票代號</FieldLabel>
              <TextInput required value={form.symbol} placeholder="例如 AAPL、2330、006208" onChange={(value) => updateForm("symbol", value)} />
            </div>

            <div>
              <FieldLabel>股票名稱</FieldLabel>
              <TextInput value={form.stock_name} placeholder="可留空，預設等於股票代號" onChange={(value) => updateForm("stock_name", value)} />
            </div>

            <div>
              <FieldLabel>交易類型</FieldLabel>
              <SelectInput value={form.side} onChange={(value) => updateForm("side", value as TradeSide)}>
                {sideOptions.map((side) => (
                  <option key={side} value={side}>{side}</option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>幣別</FieldLabel>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{currency}</div>
            </div>

            <div>
              <FieldLabel>股數</FieldLabel>
              <TextInput required value={form.shares} placeholder="例如 1、0.5、1000" onChange={(value) => updateForm("shares", value)} />
            </div>

            <div>
              <FieldLabel>價格</FieldLabel>
              <TextInput value={form.price} placeholder="buy / sell 使用，dividend 可填 0" onChange={(value) => updateForm("price", value)} />
            </div>

            <div>
              <FieldLabel>股利金額 cash_amount</FieldLabel>
              <TextInput value={form.cash_amount} placeholder="只有 dividend 需要填 gross amount" onChange={(value) => updateForm("cash_amount", value)} />
            </div>

            <div>
              <FieldLabel>手續費 fee</FieldLabel>
              <TextInput value={form.fee} onChange={(value) => updateForm("fee", value)} />
            </div>

            <div>
              <FieldLabel>稅額 tax</FieldLabel>
              <TextInput value={form.tax} onChange={(value) => updateForm("tax", value)} />
            </div>

            <div>
              <FieldLabel>匯率 exchange_rate</FieldLabel>
              <TextInput value={form.exchange_rate} placeholder="TW 請填 1，US 請填 USD/TWD" onChange={(value) => updateForm("exchange_rate", value)} />
            </div>

            <div>
              <FieldLabel>split_from</FieldLabel>
              <TextInput value={form.split_from} placeholder="只有 split 需要填，例如 1" onChange={(value) => updateForm("split_from", value)} />
            </div>

            <div>
              <FieldLabel>split_to</FieldLabel>
              <TextInput value={form.split_to} placeholder="只有 split 需要填，例如 4" onChange={(value) => updateForm("split_to", value)} />
            </div>

            <div className="md:col-span-2">
              <FieldLabel>備註 memo</FieldLabel>
              <TextInput value={form.memo} onChange={(value) => updateForm("memo", value)} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {submitting ? "處理中..." : editingId ? "更新交易" : "新增交易"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-xl border border-amber-300 bg-white px-5 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
              >
                取消編輯
              </button>
            )}

            <button
              type="button"
              onClick={() => setForm(initialForm)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              清空
            </button>
          </div>
        </form>

        {message && (
          <div className={`rounded-2xl p-4 text-sm shadow-sm ${message.includes("成功") || message.includes("刪除") || message.includes("新增") ? "border border-green-200 bg-green-50 text-green-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
            {message}
          </div>
        )}

        <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">一鍵更新投資組合</h2>
          <p className="mt-2 text-sm text-slate-600">
            新增、編輯或刪除多筆交易後，可以按這個按鈕依序同步 Yahoo 歷史股價、重建 positions，並重建 daily_stock_positions。
          </p>
          <button
            type="button"
            onClick={handleUpdatePortfolio}
            disabled={updating}
            className="mt-4 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {updating ? "更新中..." : "一鍵更新投資組合"}
          </button>

          {updateMessage && (
            <div className={`mt-4 rounded-xl p-4 text-sm ${updateMessage.includes("完成") ? "border border-green-200 bg-green-50 text-green-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
              {updateMessage}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">最近50筆新增交易紀錄</h2>
              <p className="mt-1 text-sm text-slate-600">用來確認剛剛新增了哪些交易，避免同一筆交易重複填入。預設顯示最近50筆，不限 memo。</p>
            </div>
            <button
              type="button"
              onClick={loadTrades}
              disabled={loadingTrades}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {loadingTrades ? "重新整理中..." : "重新整理最近50筆"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div>
              <FieldLabel>篩選股票代號</FieldLabel>
              <TextInput value={filterSymbol} placeholder="例如 NVDA，可留空" onChange={setFilterSymbol} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="showAllMemo"
                type="checkbox"
                checked={showAllMemo}
                onChange={(event) => setShowAllMemo(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="showAllMemo" className="text-sm text-slate-700">
                顯示所有 memo，不只 manual
              </label>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={loadTrades}
                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                套用篩選
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {["日期", "市場", "代號", "名稱", "類型", "股數", "價格", "股利", "手續費", "稅", "匯率", "memo", "操作"].map((header) => (
                    <th key={header} className="p-3 text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-3">{row.trade_date}</td>
                    <td className="p-3">{row.market}</td>
                    <td className="p-3 font-medium">{row.symbol}</td>
                    <td className="p-3">{row.stock_name}</td>
                    <td className="p-3">{row.side}</td>
                    <td className="p-3 text-right">{valueToString(row.shares)}</td>
                    <td className="p-3 text-right">{valueToString(row.price)}</td>
                    <td className="p-3 text-right">{valueToString(row.cash_amount)}</td>
                    <td className="p-3 text-right">{valueToString(row.fee)}</td>
                    <td className="p-3 text-right">{valueToString(row.tax)}</td>
                    <td className="p-3 text-right">{valueToString(row.exchange_rate)}</td>
                    <td className="p-3">{row.memo}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleEdit(row)} className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                          編輯
                        </button>
                        <button type="button" onClick={() => handleDelete(row)} className="rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {trades.length === 0 && (
                  <tr>
                    <td className="p-4 text-slate-500" colSpan={13}>目前沒有符合條件的交易資料。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {lastResult && (
          <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100 shadow-sm">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        )}

        {updateResult && (
          <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100 shadow-sm">
            {JSON.stringify(updateResult, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
