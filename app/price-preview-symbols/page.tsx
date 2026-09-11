"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type PositionRecord = {
  market?: string;
  symbol?: string;
  stock_name?: string;
  name?: string;
  shares?: number | string;
  avg_cost?: number | string;
  current_price?: number | string;
  currency?: string;
};

export default function PricePreviewSymbolsPage() {
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadPositions() {
      setLoading(true);
      setMessage("");

      const result = await supabase
        .from("positions")
        .select("*");

      if (result.error) {
        setMessage("讀取 positions 失敗：" + result.error.message);
        setPositions([]);
      } else {
        setPositions(result.data || []);
        setMessage("成功讀取 " + (result.data || []).length + " 筆 positions 資料。");
      }

      setLoading(false);
    }

    loadPositions();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm font-medium text-blue-600">Portfolio Pro</p>
          <h1 className="text-3xl font-bold">Positions 股票代碼測試頁</h1>
          <p className="mt-2 text-slate-600">
            這個頁面只讀取 Supabase positions，不會寫回資料庫，也不會影響首頁。
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-5 text-slate-600 shadow-sm">
            正在讀取 Supabase positions...
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-700">
            {message}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Positions 資料</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left">市場</th>
                  <th className="p-3 text-left">代碼</th>
                  <th className="p-3 text-left">名稱</th>
                  <th className="p-3 text-right">股數</th>
                  <th className="p-3 text-right">平均成本</th>
                  <th className="p-3 text-right">目前價格</th>
                  <th className="p-3 text-left">幣別</th>
                </tr>
              </thead>

              <tbody>
                {positions.map((item, index) => (
                  <tr key={(item.symbol || "symbol") + "-" + index} className="border-t">
                    <td className="p-3">{item.market || "-"}</td>
                    <td className="p-3 font-medium">{item.symbol || "-"}</td>
                    <td className="p-3">{item.stock_name || item.name || "-"}</td>
                    <td className="p-3 text-right">{item.shares || "-"}</td>
                    <td className="p-3 text-right">{item.avg_cost || "-"}</td>
                    <td className="p-3 text-right">{item.current_price || "-"}</td>
                    <td className="p-3">{item.currency || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {positions.length === 0 && !loading ? (
            <p className="mt-4 text-sm text-slate-500">
              目前沒有讀取到 positions 資料。
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
