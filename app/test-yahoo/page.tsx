"use client";

import React, { useState } from "react";

type YahooQuote = {
  symbol: string;
  name?: string;
  price?: number | null;
  change?: number | null;
  changePercent?: number | null;
  currency?: string | null;
  marketState?: string | null;
};

export default function TestYahooPage() {
  const [quotes, setQuotes] = useState<YahooQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function testYahoo() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        "/api/yahoo/quote?symbols=NVDA,MSFT,QQQ,TSM,2330.TW"
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setMessage(`測試失敗：${result.error || "Unknown error"}`);
        setQuotes([]);
        return;
      }

      setQuotes(result.quotes || []);
      setMessage(`成功取得 ${result.quotes.length} 筆 Yahoo Finance 報價。`);
    } catch (error) {
      console.error(error);
      setMessage("測試時發生錯誤，請查看 Terminal 或 Console。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-medium text-blue-600">Portfolio Pro</p>
          <h1 className="text-3xl font-bold">Yahoo Finance API 測試頁</h1>
          <p className="mt-2 text-slate-600">
            這個頁面只用來測試 Yahoo Finance 報價 API，不會影響首頁。
          </p>
        </div>

        <button
          onClick={testYahoo}
          disabled={loading}
          className="rounded-2xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
        >
          {loading ? "測試中..." : "測試 Yahoo Finance 報價"}
        </button>

        {message && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-700">
            {message}
          </div>
        )}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">報價結果</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">代碼</th>
                  <th className="p-3 text-left">名稱</th>
                  <th className="p-3 text-right">價格</th>
                  <th className="p-3 text-left">幣別</th>
                  <th className="p-3 text-right">漲跌</th>
                  <th className="p-3 text-right">漲跌幅</th>
                  <th className="p-3 text-left">市場狀態</th>
                </tr>
              </thead>

              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.symbol} className="border-t">
                    <td className="p-3 font-medium">{quote.symbol}</td>
                    <td className="p-3">{quote.name}</td>
                    <td className="p-3 text-right">{quote.price}</td>
                    <td className="p-3">{quote.currency}</td>
                    <td className="p-3 text-right">{quote.change}</td>
                    <td className="p-3 text-right">
                      {typeof quote.changePercent === "number"
                        ? `${quote.changePercent.toFixed(2)}%`
                        : ""}
                    </td>
                    <td className="p-3">{quote.marketState}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {quotes.length === 0 && !loading && (
            <p className="mt-4 text-sm text-slate-500">
              尚未取得報價，請按上方「測試 Yahoo Finance 報價」。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
