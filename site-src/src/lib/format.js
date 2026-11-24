// Numbers, ratios and dates, following the person's settings.
import { prefs } from './prefs.js';

const nf = new Intl.NumberFormat('en-US');
export function num(v) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (prefs.value.numbers === 'short' && Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }
  return nf.format(Math.round(n));
}
// A ratio: a / b, with b = 0 counting as 1 (how Hypixel overlays show it).
export function ratio(a, b, decimals = prefs.value.decimals) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  if (!x && !y) return '—';
  return (x / (y || 1)).toFixed(decimals);
}
export const ratioValue = (a, b) => (Number(a) || 0) / ((Number(b) || 0) || 1);
export function pct(a, total, decimals = 1) {
  const t = Number(total) || 0;
  return t ? `${((Number(a) || 0) / t * 100).toFixed(decimals)}%` : '—';
}

function zone() {
  const z = prefs.value.timeZone;
  return z && z !== 'local' ? z : undefined;
}
export function date(ms, { time = false } = {}) {
  if (!ms) return '—';
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { timeZone: zone(), year: 'numeric', month: 'short', day: 'numeric' };
  if (time) Object.assign(opts, { hour: 'numeric', minute: '2-digit', hour12: prefs.value.hour12 });
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}
export function time(ms) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: zone(), hour: 'numeric', minute: '2-digit', hour12: prefs.value.hour12 }).format(new Date(Number(ms)));
}
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function ago(ms) {
  if (!ms) return '—';
  const diff = (Number(ms) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const steps = [[60, 'second'], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400], [2629800, 'week', 604800], [31557600, 'month', 2629800], [Infinity, 'year', 31557600]];
  for (const [limit, unit, div = 1] of steps) if (abs < limit) return rtf.format(Math.round(diff / div), unit);
  return '—';
}
export function duration(ms) {
  const m = Math.round((Number(ms) || 0) / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
