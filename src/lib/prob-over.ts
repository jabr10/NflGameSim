import type { Quantiles } from "./types";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Approximate P(X > line) from mean/p10/p50/p90 via piecewise-linear
 * survival between quantile anchors.
 */
export function approxProbOver(line: number, q: Quantiles): number {
  const points: [number, number][] = [
    [q.p10, 0.9],
    [q.p50, 0.5],
    [q.p90, 0.1],
  ];

  if (line <= points[0][0]) {
    const span = points[1][0] - points[0][0] || 1;
    const slope = (points[1][1] - points[0][1]) / span;
    return clamp(points[0][1] + slope * (line - points[0][0]), 0.01, 0.99);
  }

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (line >= last[0]) {
    const span = last[0] - prev[0] || 1;
    const slope = (last[1] - prev[1]) / span;
    return clamp(last[1] + slope * (line - last[0]), 0.01, 0.99);
  }

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (line >= x0 && line <= x1) {
      const t = (line - x0) / (x1 - x0 || 1);
      return clamp(y0 + t * (y1 - y0), 0.01, 0.99);
    }
  }

  return 0.5;
}

export function marginQuantiles(leans: {
  proj_margin_home: number;
  margin_p10: number;
  margin_p90: number;
}): Quantiles {
  return {
    mean: leans.proj_margin_home,
    p10: leans.margin_p10,
    p50: leans.proj_margin_home,
    p90: leans.margin_p90,
  };
}

export function totalQuantiles(leans: {
  proj_total: number;
  total_p10: number;
  total_p90: number;
}): Quantiles {
  return {
    mean: leans.proj_total,
    p10: leans.total_p10,
    p50: leans.proj_total,
    p90: leans.total_p90,
  };
}
