import { DISPLAY_TIMEZONE } from "./constants";
import type { Weather } from "./types";

export function formatKickoff(iso: string, timeZone = DISPLAY_TIMEZONE): string {
  if (!iso) return "Kickoff TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Kickoff TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

export function formatPct(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export function formatNum(n: number, digits = 1): string {
  return n.toFixed(digits);
}

export function formatSigned(n: number, digits = 1): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

export function formatWeather(w: Weather): string {
  const bits: string[] = [w.condition];
  if (w.temp_f != null) bits.push(`${w.temp_f}°F`);
  if (w.wind_mph != null && w.wind_mph > 0) bits.push(`wind ${w.wind_mph} mph`);
  if (w.precip_pct != null && w.precip_pct > 0) bits.push(`${w.precip_pct}% precip`);
  return bits.join(" · ");
}

export function propLabel(key: string): string {
  return key.replaceAll("_", " ");
}
