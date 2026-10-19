"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type PerformanceRow = {
  position_date: string;
  total_cost_twd: number | null;
  total_market_value_twd: number | null;
  total_unrealized_pnl_twd: number | null;
  cumulative_realized_pnl_twd: number | null;
  total_pnl_twd: number | null;
  unrealized_return_rate: number | null;
};

const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const CHART_WIDTH = 900;
const CHART_HEIGHT = 280;
const CHART_LEFT = 76;
const CHART_RIGHT = 20;
const CHART_TOP = 18;
const CHART_BOTTOM = 46;
const Y_AXIS_STEP = 500000;

function formatTwd(value: number | null | undefined) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "-";
  }

  return twd.format(Number(value));
}

function formatShortTwd(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 10000) {
    return `${sign}${Math.round(abs / 10000).toLocaleString("zh-TW")}萬`;
  }

  return `${sign}${Math.round(abs).toLocaleString("zh-TW")}`;
}

function formatPercent(value: number | null | undefined) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "-";
  }

  return `${(Number(value) * 100).toFixed(2)}%`;
}

function getChartX(index: number, total: number) {
  return (
    CHART_LEFT +
    (index / Math.max(total - 1, 1)) *
      (CHART_WIDTH - CHART_LEFT - CHART_RIGHT)
  );
}

function getChartY(
  value: number,
  minValue: number,
  maxValue: number
) {
  const range = maxValue - minValue || 1;

  return (
    CHART_HEIGHT -
    CHART_BOTTOM -
    ((value - minValue) / range) *
      (CHART_HEIGHT - CHART_TOP - CHART_BOTTOM)
  );
}

function roundAxisMax(value: number) {
  if (value <= 0) {
    return Y_AXIS_STEP;
  }

  return Math.ceil(value / Y_AXIS_STEP) * Y_AXIS_STEP;
}

function roundAxisMin(value: number) {
  if (value >= 0) {
    return 0;
  }

  return Math.floor(value / Y_AXIS_STEP) * Y_AXIS_STEP;
}

function buildPoints(
  rows: PerformanceRow[],
  key: keyof PerformanceRow,
  minValue: number,
  maxValue: number
) {
  if (rows.length === 0) {
    return "";
  }

  return rows
    .map((row, index) => {
      const x = getChartX(index, rows.length);
      const value = Number(row[key] ?? 0);
      const y = getChartY(value, minValue, maxValue);

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildMonthTicks(rows: PerformanceRow[]) {
  const ticks: Array<{
    index: number;
    label: string;
  }> = [];

  let previousMonth = "";

  rows.forEach((row, index) => {
    const month = row.position_date.slice(0, 7);

    if (month !== previousMonth) {
      const monthNumber = Number(month.slice(5, 7));
      const isFirstOrLast =
        index === 0 || index === rows.length - 1;
      const showMonth = monthNumber % 2 === 0;

      if (isFirstOrLast || showMonth) {
        ticks.push({
          index,
          label: month,
        });
      }

      previousMonth = month;
    }
  });

  return ticks;
}

export default function PerformanceSummary() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadPerformance() {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("daily_portfolio_performance")
        .select(
          "position_date,total_cost_twd,total_market_value_twd,total_unrealized_pnl_twd,cumulative_realized_pnl_twd,total_pnl_twd,unrealized_return_rate"
        )
        .order("position_date", {
          ascending: true,
        });

      if (ignore) {
        return;
      }

      if (queryError) {
        setError(queryError.message);
        setRows([]);
      } else {
        setRows((data || []) as PerformanceRow[]);
      }

      setLoading(false);
    }

    loadPerformance();

    return () => {
      ignore = true;
    };
  }, []);

  const latest = rows[rows.length - 1];
  const first = rows[0];

  const totalReturnRate = useMemo(() => {
    const totalPnl = Number(latest?.total_pnl_twd ?? 0);
    const totalCost = Number(latest?.total_cost_twd ?? 0);

    if (totalCost <= 0) {
      return null;
    }

    return totalPnl / totalCost;
  }, [latest]);

  const chartScale = useMemo(() => {
    const values = rows.flatMap((row) => [
      Number(row.total_market_value_twd ?? 0),
      Number(row.total_cost_twd ?? 0),
      Number(row.total_pnl_twd ?? 0),
      0,
    ]);

    const validValues = values.filter(Number.isFinite);
    const maxValue = Math.max(...validValues, 1);
    const minValue = Math.min(...validValues, 0);

    return {
      min: roundAxisMin(minValue),
      max: roundAxisMax(maxValue),
    };
  }, [rows]);

  const yAxisTicks = useMemo(() => {
    const ticks = [];

    for (
      let value = chartScale.max;
      value >= chartScale.min;
      value -= Y_AXIS_STEP
    ) {
      ticks.push({
        value,
        y: getChartY(
          value,
          chartScale.min,
          chartScale.max
        ),
      });
    }

    return ticks;
  }, [chartScale]);

  const zeroLineY = useMemo(
    () =>
      getChartY(
        0,
        chartScale.min,
        chartScale.max
      ),
    [chartScale]
  );

  const monthTicks = useMemo(
    () => buildMonthTicks(rows),
    [rows]
  );

  const marketValuePoints = useMemo(
    () =>
      buildPoints(
        rows,
        "total_market_value_twd",
        chartScale.min,
        chartScale.max
      ),
    [rows, chartScale]
  );

  const costPoints = useMemo(
    () =>
      buildPoints(
        rows,
        "total_cost_twd",
        chartScale.min,
        chartScale.max
      ),
    [rows, chartScale]
  );

  const pnlPoints = useMemo(
    () =>
      buildPoints(
        rows,
        "total_pnl_twd",
        chartScale.min,
        chartScale.max
      ),
    [rows, chartScale]
  );

  const hoverRow =
    hoverIndex === null
      ? null
      : rows[hoverIndex];

  const displayRow = hoverRow || latest;

  const hoverX =
    hoverIndex === null
      ? null
      : getChartX(
          hoverIndex,
          rows.length
        );

  const displayReturnRate = useMemo(() => {
    const totalPnl = Number(
      displayRow?.total_pnl_twd ?? 0
    );

    const totalCost = Number(
      displayRow?.total_cost_twd ?? 0
    );

    if (totalCost <= 0) {
      return null;
    }

    return totalPnl / totalCost;
  }, [displayRow]);

  function handleMouseMove(
    event: React.MouseEvent<SVGSVGElement>
  ) {
    if (!svgRef.current || rows.length === 0) {
      return;
    }

    const rect =
      svgRef.current.getBoundingClientRect();

    const xRatio =
      (event.clientX - rect.left) /
      rect.width;

    const svgX =
      xRatio * CHART_WIDTH;

    const chartStart = CHART_LEFT;
    const chartEnd =
      CHART_WIDTH - CHART_RIGHT;

    const clampedX = Math.min(
      Math.max(svgX, chartStart),
      chartEnd
    );

    const index = Math.round(
      ((clampedX - chartStart) /
        (chartEnd - chartStart)) *
        (rows.length - 1)
    );

    setHoverIndex(
      Math.min(
        Math.max(index, 0),
        rows.length - 1
      )
    );
  }

  if (loading) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          正在讀取歷史績效資料...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
        <p className="font-semibold">
          讀取歷史績效資料失敗
        </p>

        <p className="mt-2 text-sm">
          {error}
        </p>
      </section>
    );
  }

  if (!latest || !displayRow) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          目前沒有歷史績效資料。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Portfolio Performance
          </p>

          <h2 className="text-2xl font-bold text-slate-900">
            投資組合歷史績效
          </h2>
        </div>

        <p className="text-sm text-slate-500">
          {first?.position_date} 到{" "}
          {latest.position_date}，共{" "}
          {rows.length} 筆每日資料
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <MetricCard
          title="最新市值"
          value={formatTwd(
            latest.total_market_value_twd
          )}
        />

        <MetricCard
          title="最新成本"
          value={formatTwd(
            latest.total_cost_twd
          )}
        />

        <MetricCard
          title="總損益"
          value={formatTwd(
            latest.total_pnl_twd
          )}
          positive={
            Number(
              latest.total_pnl_twd ?? 0
            ) >= 0
          }
        />

        <MetricCard
          title="總報酬率"
          value={formatPercent(
            totalReturnRate
          )}
          positive={
            Number(totalReturnRate ?? 0) >= 0
          }
        />
      </div>

      <div className="rounded-2xl bg-slate-50 p-4">
        <div className="mb-3 flex flex-wrap gap-4 text-sm text-slate-600">
          <Legend
            color="bg-blue-600"
            label="總市值"
          />

          <Legend
            color="bg-slate-500"
            label="總成本"
          />

          <Legend
            color="bg-green-600"
            label="總損益"
          />

          <span className="ml-auto text-xs text-slate-400">
            將滑鼠移至圖表查看每日數值
          </span>
        </div>

        <div className="mb-4 border-b border-slate-200 pb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              日期：{displayRow.position_date}
            </p>

            <p className="text-xs text-slate-400">
              {hoverRow
                ? "目前指向日期"
                : "最新資料"}
            </p>
          </div>

          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <ChartValue
              color="bg-blue-600"
              title="總市值"
              value={formatTwd(
                displayRow.total_market_value_twd
              )}
            />

            <ChartValue
              color="bg-slate-500"
              title="總成本"
              value={formatTwd(
                displayRow.total_cost_twd
              )}
            />

            <ChartValue
              color="bg-green-600"
              title="總損益"
              value={formatTwd(
                displayRow.total_pnl_twd
              )}
              positive={
                Number(
                  displayRow.total_pnl_twd ?? 0
                ) >= 0
              }
            />

            <ChartValue
              color="bg-red-500"
              title="總報酬率"
              value={formatPercent(
                displayReturnRate
              )}
              positive={
                Number(
                  displayReturnRate ?? 0
                ) >= 0
              }
            />
          </div>
        </div>

        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-80 w-full rounded-xl bg-white"
            onMouseMove={handleMouseMove}
            onMouseLeave={() =>
              setHoverIndex(null)
            }
          >
            {yAxisTicks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={CHART_LEFT}
                  y1={tick.y}
                  x2={
                    CHART_WIDTH -
                    CHART_RIGHT
                  }
                  y2={tick.y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />

                <text
                  x={CHART_LEFT - 10}
                  y={tick.y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[11px]"
                >
                  {formatShortTwd(
                    tick.value
                  )}
                </text>
              </g>
            ))}

            <line
              x1={CHART_LEFT}
              y1={zeroLineY}
              x2={
                CHART_WIDTH -
                CHART_RIGHT
              }
              y2={zeroLineY}
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="5 5"
              opacity="0.45"
            />

            <text
              x={CHART_LEFT + 6}
              y={zeroLineY - 6}
              className="fill-red-500 text-[11px]"
            >
              0
            </text>

            <line
              x1={CHART_LEFT}
              y1={CHART_TOP}
              x2={CHART_LEFT}
              y2={
                CHART_HEIGHT -
                CHART_BOTTOM
              }
              stroke="#cbd5e1"
              strokeWidth="1"
            />

            <line
              x1={CHART_LEFT}
              y1={
                CHART_HEIGHT -
                CHART_BOTTOM
              }
              x2={
                CHART_WIDTH -
                CHART_RIGHT
              }
              y2={
                CHART_HEIGHT -
                CHART_BOTTOM
              }
              stroke="#cbd5e1"
              strokeWidth="1"
            />

            {monthTicks.map((tick) => {
              const x = getChartX(
                tick.index,
                rows.length
              );

              return (
                <g
                  key={`${tick.label}-${tick.index}`}
                >
                  <line
                    x1={x}
                    y1={
                      CHART_HEIGHT -
                      CHART_BOTTOM
                    }
                    x2={x}
                    y2={
                      CHART_HEIGHT -
                      CHART_BOTTOM +
                      5
                    }
                    stroke="#94a3b8"
                    strokeWidth="1"
                  />

                  <text
                    x={x}
                    y={CHART_HEIGHT - 14}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px]"
                  >
                    {tick.label}
                  </text>
                </g>
              );
            })}

            <polyline
              points={marketValuePoints}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
            />

            <polyline
              points={costPoints}
              fill="none"
              stroke="#64748b"
              strokeWidth="3"
            />

            <polyline
              points={pnlPoints}
              fill="none"
              stroke="#16a34a"
              strokeWidth="3"
            />

            {hoverRow &&
              hoverX !== null && (
                <>
                  <line
                    x1={hoverX}
                    y1={CHART_TOP}
                    x2={hoverX}
                    y2={
                      CHART_HEIGHT -
                      CHART_BOTTOM
                    }
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />

                  <circle
                    cx={hoverX}
                    cy={getChartY(
                      Number(
                        hoverRow.total_market_value_twd ??
                          0
                      ),
                      chartScale.min,
                      chartScale.max
                    )}
                    r="4"
                    fill="#2563eb"
                  />

                  <circle
                    cx={hoverX}
                    cy={getChartY(
                      Number(
                        hoverRow.total_cost_twd ??
                          0
                      ),
                      chartScale.min,
                      chartScale.max
                    )}
                    r="4"
                    fill="#64748b"
                  />

                  <circle
                    cx={hoverX}
                    cy={getChartY(
                      Number(
                        hoverRow.total_pnl_twd ??
                          0
                      ),
                      chartScale.min,
                      chartScale.max
                    )}
                    r="4"
                    fill="#16a34a"
                  />
                </>
              )}
          </svg>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  title,
  value,
  positive,
}: {
  title: string;
  value: string;
  positive?: boolean;
}) {
  const valueClass =
    positive === undefined
      ? "text-slate-900"
      : positive
        ? "text-green-700"
        : "text-red-700";

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p
        className={`mt-2 text-xl font-bold ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function Legend({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`h-3 w-3 rounded-full ${color}`}
      />

      {label}
    </span>
  );
}

function ChartValue({
  color,
  title,
  value,
  positive,
}: {
  color: string;
  title: string;
  value: string;
  positive?: boolean;
}) {
  const valueClass =
    positive === undefined
      ? "text-slate-900"
      : positive
        ? "text-green-700"
        : "text-red-700";

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
        />

        <p className="text-xs font-medium text-slate-500">
          {title}
        </p>
      </div>

      <p
        className={`mt-1 truncate text-base font-bold sm:text-lg ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}