import Link from "next/link";
import { formatNum } from "@/lib/format";

export type FantasyRow = {
  player_id: string;
  name: string;
  team: string;
  pos: string;
  opponent: string;
  game_id: string;
  mean: number;
  p10: number;
  p90: number;
  scoring: string;
};

export function FantasyTable({ rows }: { rows: FantasyRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#121a2b]">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">Player</th>
            <th className="px-3 py-3">Pos</th>
            <th className="px-3 py-3">Team</th>
            <th className="px-3 py-3">Opp</th>
            <th className="px-3 py-3">Mean</th>
            <th className="px-3 py-3">p10</th>
            <th className="px-3 py-3">p90</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.game_id}-${row.player_id}`} className="border-t border-white/5">
              <td className="px-3 py-2 font-mono text-slate-500">{i + 1}</td>
              <td className="px-3 py-2">
                <Link href={`/games/${row.game_id}`} className="font-medium text-white hover:text-emerald-300">
                  {row.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-slate-400">{row.pos}</td>
              <td className="px-3 py-2 text-slate-300">{row.team}</td>
              <td className="px-3 py-2 text-slate-400">{row.opponent}</td>
              <td className="px-3 py-2 font-mono text-emerald-300">{formatNum(row.mean)}</td>
              <td className="px-3 py-2 font-mono text-slate-400">{formatNum(row.p10)}</td>
              <td className="px-3 py-2 font-mono text-slate-400">{formatNum(row.p90)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
