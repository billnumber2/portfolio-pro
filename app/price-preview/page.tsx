"use client";

import { useState } from "react";

type Quote = {
  symbol: string;
  name?: string;
  price?: number | null;
  currency?: string | null;
  marketState?: string | null;
};

export default function PricePreviewPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function updatePrices() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        "/api/yahoo/quote?symbols=NVDA,MSFT,QQQ,TSM,2330.TW"
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setMessage("Yahoo Finance 更新失敗");
        setQuotes([]);
        return;
      }

      setQuotes(result.quotes || []);
      setMessage("成功取得 " + (result.quotes || []).length + " 筆 Yahoo Finance 報價。");
    } catch (error) {
      console.error(error);
      setMessage("更新 Yahoo Finance 價格時發生錯誤。");
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-medium text-blue-600">Portfolio Pro</p>
          <h1 className="text-3xl font-bold">Price Preview 價格更新預覽</h1>
          <p className="mt-2 text-slate-600">
            這個頁面只測試 Yahoo Finance 最新報價，不會寫回資料庫，也不會影響首頁。
          </p>
        </div>

        <button
          type="button"
          onClick={updatePrices}
          disabled={loading}
          className="rounded-2xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
        >
          {loading ? "更新中..." : "更新 Yahoo 價格"}
        </button>

        {message ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-700">
            {message}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Yahoo 報價結果</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">代碼</th>
                  <th className="p-3 text-left">名稱</th>
                  <th className="p-3 text-right">價格</th>
                  <th className="p-3 text-left">幣別</th>
                  <th className="p-3 text-left">市場狀態</th>
                </tr>
              </thead>

              <tbody>
                {quotes.map((quote, index) => (
                  <tr key={quote.symbol + "-" + index} className="border-t">
                    <td className="p-3 font-medium">{quote.symbol}</td>
                    <td className="p-3">{quote.name || "-"}</td>
                    <td className="p-3 text-right">{quote.price ?? "-"}</td>
                    <td className="p-3">{quote.currency || "-"}</td>
                    <td className="p-3">{quote.marketState || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {quotes.length === 0 && !loading ? (
            <p className="mt-4 text-sm text-slate-500">
              尚未取得報價，請按上方「更新 Yahoo 價格」。
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
