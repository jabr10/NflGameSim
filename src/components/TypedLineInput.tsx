"use client";

import { useMemo, useState } from "react";
import { approxProbOver } from "@/lib/prob-over";
import { formatPct } from "@/lib/format";
import type { Quantiles } from "@/lib/types";

export function TypedLineInput({
  label,
  quantiles,
  step = "0.5",
  placeholder = "Your line",
}: {
  label: string;
  quantiles: Quantiles;
  step?: string;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState("");
  const parsed = raw.trim() === "" ? null : Number(raw);
  const pOver = useMemo(() => {
    if (parsed == null || !Number.isFinite(parsed)) return null;
    return approxProbOver(parsed, quantiles);
  }, [parsed, quantiles]);

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <span className="font-mono text-[11px] text-slate-500">
          mean {quantiles.mean} · p10 {quantiles.p10} · p50 {quantiles.p50} · p90 {quantiles.p90}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="number"
          step={step}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={placeholder}
          className="w-32 rounded-md border border-white/10 bg-[#0b1220] px-2 py-1.5 font-mono text-sm text-white outline-none focus:border-emerald-400"
        />
        <p className="text-sm text-slate-300">
          {pOver == null ? (
            <span className="text-slate-500">Type a line for approx P(over)</span>
          ) : (
            <>
              approx P(over){" "}
              <span className="font-mono font-semibold text-emerald-300">{formatPct(pOver)}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
