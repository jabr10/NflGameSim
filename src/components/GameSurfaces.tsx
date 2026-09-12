import { formatNum } from "@/lib/format";
import type { Driver, FootageRef, PlayerSim, UsageAssumption } from "@/lib/types";

export function DriverList({
  drivers,
  limit,
  compact = false,
}: {
  drivers: Driver[];
  limit?: number;
  compact?: boolean;
}) {
  const rows = limit != null ? drivers.slice(0, limit) : drivers;
  if (rows.length === 0) return null;
  return (
    <ul className={compact ? "space-y-1" : "space-y-2"}>
      {rows.map((d) => (
        <li key={d.id}>
          <p className={compact ? "text-sm text-slate-200" : "font-medium text-white"}>{d.title}</p>
          {!compact && d.detail ? <p className="text-sm text-slate-400">{d.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function FootageChips({ refs, limit }: { refs: FootageRef[]; limit?: number }) {
  const rows = limit != null ? refs.slice(0, limit) : refs;
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((ref) => (
        <span
          key={`${ref.player_id}-${ref.kind}-${ref.label}`}
          className={`rounded px-1.5 py-0.5 text-[11px] uppercase ${
            ref.kind === "elevate"
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {ref.kind}
          {ref.status ? ` · ${ref.status}` : ""} · {ref.player_name || ref.player_id}
        </span>
      ))}
    </div>
  );
}

export function UsageAssumptionList({
  assumptions,
  compact = false,
  limit,
}: {
  assumptions: UsageAssumption[];
  compact?: boolean;
  limit?: number;
}) {
  const rows = limit != null ? assumptions.slice(0, limit) : assumptions;
  if (rows.length === 0) return null;
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {rows.map((a) => (
          <span
            key={a.id}
            className="rounded bg-sky-400/10 px-1.5 py-0.5 text-[11px] text-sky-200"
          >
            {a.title}
          </span>
        ))}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((a) => (
        <li key={a.id} className="text-sm text-slate-300">
          <p className="font-medium text-white">
            {a.title}
            {a.player_name ? (
              <span className="ml-2 text-xs font-normal text-slate-500">
                {a.player_name}
                {a.team || a.pos ? ` · ${[a.team, a.pos].filter(Boolean).join(" ")}` : ""}
              </span>
            ) : null}
          </p>
          {a.detail ? <p className="text-slate-400">{a.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function FantasyChips({
  players,
  limit = 3,
}: {
  players: PlayerSim[];
  limit?: number;
}) {
  const rows = [...players]
    .filter((p) => Number.isFinite(p.fantasy.mean))
    .sort((a, b) => b.fantasy.mean - a.fantasy.mean)
    .slice(0, limit);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((p) => (
        <span
          key={p.player_id}
          className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 font-mono text-[11px] text-slate-200"
        >
          <span className="text-white">{p.name.split(" ").slice(-1)[0]}</span>{" "}
          <span className="text-emerald-300">{formatNum(p.fantasy.mean)}</span>
          <span className="text-slate-500">
            {" "}
            {formatNum(p.fantasy.p10)}–{formatNum(p.fantasy.p90)}
          </span>
        </span>
      ))}
    </div>
  );
}
