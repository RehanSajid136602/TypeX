"use client";

import React from "react";

interface LiveSparklineProps {
  dataPoints: number[]; // sliding window of WPM values, newest last
  visible: boolean;
}

export const LiveSparkline: React.FC<LiveSparklineProps> = ({
  dataPoints,
  visible,
}) => {
  if (!visible || dataPoints.length < 2) {
    return <div className="h-8" />;
  }

  const W = 120;
  const H = 32;
  const PAD = 2;

  const maxVal = Math.max(...dataPoints, 40);
  const minVal = Math.min(...dataPoints, 0);
  const range = maxVal - minVal || 1;

  const getX = (i: number) =>
    PAD + (i / (dataPoints.length - 1)) * (W - PAD * 2);
  const getY = (v: number) =>
    H - PAD - ((v - minVal) / range) * (H - PAD * 2);

  let path = `M ${getX(0)} ${getY(dataPoints[0])}`;
  for (let i = 1; i < dataPoints.length; i++) {
    const x0 = getX(i - 1);
    const x1 = getX(i);
    const cpX = (x0 + x1) / 2;
    path += ` C ${cpX} ${getY(dataPoints[i - 1])}, ${cpX} ${getY(dataPoints[i])}, ${x1} ${getY(dataPoints[i])}`;
  }

  const currentWpm = dataPoints[dataPoints.length - 1];

  return (
    <div
      className={`flex items-center gap-3 transition-opacity duration-700 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Sparkline SVG */}
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="overflow-visible"
        style={{ opacity: 0.7 }}
      >
        <path
          d={path}
          fill="none"
          stroke="var(--accent-color)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Current point dot */}
        <circle
          cx={getX(dataPoints.length - 1)}
          cy={getY(currentWpm)}
          r="2.5"
          fill="var(--accent-color)"
          opacity="0.9"
        />
      </svg>

      {/* Live WPM label */}
      <span className="text-sm font-mono-custom tabular-nums text-[var(--accent-color)] opacity-85 tracking-tight">
        {Math.round(currentWpm)}
        <span className="text-[10px] text-[var(--inactive-color)] opacity-70 ml-1 font-normal">wpm</span>
      </span>
    </div>
  );
};
