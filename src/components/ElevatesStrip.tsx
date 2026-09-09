import Link from "next/link";
import type { ElevateRow } from "@/lib/types";

export function ElevatesStrip({ rows }: { rows: ElevateRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-[#121a2b] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Film notes
        </h2>
        <span className="text-xs text-slate-500">fixture source · current week</span>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {rows.map((row) => {
          const elevate = row.kind === "elevate";
          return (
            <li key={`${row.game_id}-${row.player_id}`}>
              <Link
                href={`/games/${row.game_id}`}
                className="block rounded-lg border border-white/5 bg-black/20 p-3 hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
                      elevate
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {elevate ? "elevate" : "downgrade"}
                    {row.status ? ` · ${row.status}` : ""}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {row.team} {row.pos}
                  </span>
                </div>
                <p className="mt-2 font-medium text-white">{row.player_name}</p>
                <p className="text-sm text-slate-300">{row.headline}</p>
                <p className="mt-1 text-xs text-slate-500">{row.note}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
