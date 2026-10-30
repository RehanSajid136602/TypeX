"use client";

import React, { useState } from "react";

interface WpmChartProps {
  perSecondWpm: number[];
  errorSeconds: number[];
  rawWpm: number;
}

export const WpmChart: React.FC<WpmChartProps> = ({
  perSecondWpm,
  errorSeconds,
  rawWpm,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<{
    second: number;
    wpm: number;
    x: number;
    y: number;
  } | null>(null);

  if (!perSecondWpm || perSecondWpm.length === 0) {
    return (
      <div className="w-full h-40 flex items-center justify-center text-[#646669] font-mono-custom text-xs">
        telemetry curve unavailable
      </div>
    );
  }

  const width = 800;
  const height = 180;
  const padding = { top: 16, right: 24, bottom: 28, left: 36 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(rawWpm, ...perSecondWpm, 40);
  const yMax = Math.ceil((maxVal * 1.15) / 20) * 20;

  const totalPoints = perSecondWpm.length;
  const getX = (index: number) => {
    if (totalPoints <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (totalPoints - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    const ratio = Math.max(0, Math.min(1, val / yMax));
    return padding.top + chartHeight - ratio * chartHeight;
  };

  const points = perSecondWpm.map((wpm, idx) => ({
    second: idx + 1,
    wpm,
    x: getX(idx),
    y: getY(wpm),
  }));

  // Build smooth curved path
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpX = (p0.x + p1.x) / 2;
    linePath += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const baselineY = padding.top + chartHeight;
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;

  const ySteps = [0, yMax * 0.5, yMax];

  return (
    <div className="w-full rounded-xl bg-white/[0.015] border border-white/[0.05] p-4 relative overflow-hidden font-mono-custom select-none">
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="text-[var(--inactive-color)] text-[11px] tracking-wider uppercase opacity-75">
          pace telemetry (wpm / second)
        </span>
        {errorSeconds.length > 0 && (
          <span className="text-[11px] text-[#e06c75] opacity-80">
            {errorSeconds.length} error marker{errorSeconds.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="relative w-full aspect-[800/180] max-h-48">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="wpmGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Minimalist Hairline Gridlines */}
          {ySteps.map((val, idx) => {
            const y = getY(val);
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.04)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--inactive-color, #64748B)"
                  opacity="0.7"
                  fontSize="9"
                >
                  {Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#wpmGradient)" />

          {/* Line stroke */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent-color)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Error markers */}
          {errorSeconds.map((sec, i) => {
            const point = points[sec - 1];
            if (!point) return null;
            return (
              <g key={`err-${i}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill="#e06c75"
                  stroke="var(--bg-color)"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {/* Capture rects */}
          {points.map((pt, idx) => (
            <g key={idx}>
              <rect
                x={pt.x - (chartWidth / totalPoints) / 2}
                y={padding.top}
                width={Math.max(10, chartWidth / totalPoints)}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredPoint(pt)}
                className="cursor-crosshair"
              />
            </g>
          ))}

          {/* Hover Crosshair & Tooltip */}
          {hoveredPoint && (
            <g>
              <line
                x1={hoveredPoint.x}
                y1={padding.top}
                x2={hoveredPoint.x}
                y2={padding.top + chartHeight}
                stroke="white"
                strokeOpacity="0.2"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="3.5"
                fill="var(--accent-color)"
                stroke="var(--bg-color)"
                strokeWidth="1.5"
              />

              {/* Minimal Floating Tooltip */}
              <g
                transform={`translate(${Math.min(
                  width - padding.right - 80,
                  Math.max(padding.left, hoveredPoint.x - 40)
                )}, ${Math.max(4, hoveredPoint.y - 32)})`}
              >
                <rect
                  width="80"
                  height="22"
                  rx="4"
                  fill="var(--bg-color)"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="1"
                />
                <text
                  x="40"
                  y="14"
                  textAnchor="middle"
                  fill="var(--typed-color)"
                  fontSize="10"
                >
                  {hoveredPoint.wpm} wpm ({hoveredPoint.second}s)
                </text>
              </g>
            </g>
          )}

          {/* X axis labels */}
          <text
            x={padding.left}
            y={height - 8}
            textAnchor="start"
            fill="var(--inactive-color, #64748B)"
            opacity="0.7"
            fontSize="9"
          >
            1s
          </text>
          <text
            x={width - padding.right}
            y={height - 8}
            textAnchor="end"
            fill="var(--inactive-color, #64748B)"
            opacity="0.7"
            fontSize="9"
          >
            {totalPoints}s
          </text>
        </svg>
      </div>
    </div>
  );
};
