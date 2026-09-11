import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type PerformanceRow = {
  position_date: string;
  total_cost_twd: number | null;
  total_market_value_twd: number | null;
  total_unrealized_pnl_twd: number | null;
  daily_realized_pnl_twd?: number | null;
  cumulative_realized_pnl_twd: number | null;
  total_pnl_twd: number | null;
  unrealized_return_rate: number | null;
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

function formatTwd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return `${(Number(value) * 100).toFixed(2)}%`;
}

function buildLinePoints(rows: PerformanceRow[], valueKey: keyof PerformanceRow) {
  const chartWidth = 920;
  const chartHeight = 260;
  const padding = 24;

  const values = rows
    .map((row) => Number(row[valueKey] ?? 0))
    .filter((value) => Number.isFinite(value));

  if (rows.length === 0 || values.length === 0) {
    return "";
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  return rows
    .map((row, index) => {
      const x = padding + (index / Math.max(rows.length - 1, 1)) * (chartWidth - padding * 2);
      const value = Number(row[valueKey] ?? 0);
      const y = chartHeight - padding - ((value - minValue) / range) * (chartHeight - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default async function PerformanceTestPage() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("daily_portfolio_performance")
    .select(
      "position_date,total_cost_twd,total_market_value_twd,total_unrealized_pnl_twd,daily_realized_pnl_twd,cumulative_realized_pnl_twd,total_pnl_twd,unrealized_return_rate"
    )
    .order("position_date", { ascending: true });

  if (error) {
    return (
      <main style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
        <h1>Portfolio Performance Test</h1>
        <p style={{ color: "#b91c1c" }}>讀取 daily_portfolio_performance 失敗：</p>
        <pre>{error.message}</pre>
      </main>
    );
  }

  const rows = (data || []) as PerformanceRow[];
  const latest = rows[rows.length - 1];
  const first = rows[0];
  const firstMarketValue = Number(first?.total_market_value_twd ?? 0);
  const latestMarketValue = Number(latest?.total_market_value_twd ?? 0);
  const marketValueChange = latestMarketValue - firstMarketValue;
  const marketValueChangeRate = firstMarketValue > 0 ? marketValueChange / firstMarketValue : null;

  const marketValuePoints = buildLinePoints(rows, "total_market_value_twd");
  const costPoints = buildLinePoints(rows, "total_cost_twd");
  const pnlPoints = buildLinePoints(rows, "total_pnl_twd");

  const recentRows = rows.slice(-20).reverse();

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: 32, fontFamily: "Arial, sans-serif" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: "#64748b", margin: "0 0 8px" }}>Portfolio Pro Test Page</p>
          <h1 style={{ fontSize: 34, margin: 0, color: "#0f172a" }}>投資組合歷史績效測試頁</h1>
          <p style={{ color: "#475569", marginTop: 10 }}>
            資料來源：daily_portfolio_performance。此頁面只做測試，不影響首頁。
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 24 }}>
          <Card title="最新市值" value={formatTwd(latest?.total_market_value_twd)} />
          <Card title="最新成本" value={formatTwd(latest?.total_cost_twd)} />
          <Card title="總損益" value={formatTwd(latest?.total_pnl_twd)} tone={Number(latest?.total_pnl_twd ?? 0) >= 0 ? "positive" : "negative"} />
          <Card title="期間市值變化" value={formatPercent(marketValueChangeRate)} tone={Number(marketValueChangeRate ?? 0) >= 0 ? "positive" : "negative"} />
        </div>

        <div style={{ background: "white", borderRadius: 18, padding: 24, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <h2 style={{ margin: 0, color: "#0f172a" }}>資產、成本與總損益曲線</h2>
            <span style={{ color: "#64748b", fontSize: 14 }}>
              {first?.position_date} 到 {latest?.position_date}，共 {rows.length} 筆每日資料
            </span>
          </div>

          <svg viewBox="0 0 920 260" style={{ width: "100%", height: 300, background: "#f8fafc", borderRadius: 12 }}>
            <line x1="24" y1="236" x2="896" y2="236" stroke="#cbd5e1" strokeWidth="1" />
            <line x1="24" y1="24" x2="24" y2="236" stroke="#cbd5e1" strokeWidth="1" />
            <polyline points={marketValuePoints} fill="none" stroke="#2563eb" strokeWidth="3" />
            <polyline points={costPoints} fill="none" stroke="#64748b" strokeWidth="3" />
            <polyline points={pnlPoints} fill="none" stroke="#16a34a" strokeWidth="3" />
          </svg>

          <div style={{ display: "flex", gap: 18, marginTop: 12, color: "#334155", fontSize: 14 }}>
            <Legend color="#2563eb" label="總市值" />
            <Legend color="#64748b" label="總成本" />
            <Legend color="#16a34a" label="總損益" />
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 18, padding: 24, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }}>
          <h2 style={{ marginTop: 0, color: "#0f172a" }}>最近 20 筆每日績效</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", color: "#334155" }}>
                  <th style={th}>日期</th>
                  <th style={th}>總成本</th>
                  <th style={th}>總市值</th>
                  <th style={th}>未實現損益</th>
                  <th style={th}>累計已實現損益</th>
                  <th style={th}>總損益</th>
                  <th style={th}>未實現報酬率</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.map((row) => (
                  <tr key={row.position_date} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={td}>{row.position_date}</td>
                    <td style={td}>{formatTwd(row.total_cost_twd)}</td>
                    <td style={td}>{formatTwd(row.total_market_value_twd)}</td>
                    <td style={tdColor(row.total_unrealized_pnl_twd)}>{formatTwd(row.total_unrealized_pnl_twd)}</td>
                    <td style={tdColor(row.cumulative_realized_pnl_twd)}>{formatTwd(row.cumulative_realized_pnl_twd)}</td>
                    <td style={tdColor(row.total_pnl_twd)}>{formatTwd(row.total_pnl_twd)}</td>
                    <td style={tdColor(row.unrealized_return_rate)}>{formatPercent(row.unrealized_return_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

function Card({ title, value, tone }: { title: string; value: string; tone?: "positive" | "negative" }) {
  const color = tone === "positive" ? "#15803d" : tone === "negative" ? "#b91c1c" : "#0f172a";

  return (
    <div style={{ background: "white", borderRadius: 18, padding: 20, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }}>
      <div style={{ color: "#64748b", fontSize: 14, marginBottom: 8 }}>{title}</div>
      <div style={{ color, fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 999, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

const th = {
  padding: "12px 10px",
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: "12px 10px",
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
  color: "#334155",
};

function tdColor(value: number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return {
    ...td,
    color: numberValue >= 0 ? "#15803d" : "#b91c1c",
    fontWeight: 600,
  };
}
