// Holiday looks: which one is on today. Christmas runs from Dec 1 to Jan 1
// (local time). Adding ?season=christmas to any page previews it, and
// ?season=off hides it; either is kept for the rest of the visit, and
// ?season=auto goes back to the calendar.
const KEY = 'prismSeasonPreview';
export const SEASONS = { christmas: { label: 'Christmas look' } };

export function seasonFor(d = new Date()) {
  if (d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() === 1)) return 'christmas';
  return null;
}

let forced = null;
if (typeof window !== 'undefined') {
  try {
    const url = new URL(location.href);
    const q = url.searchParams.get('season');
    if (q != null) {
      if (q === 'auto' || q === '') sessionStorage.removeItem(KEY);
      else if (q === 'off' || SEASONS[q]) sessionStorage.setItem(KEY, q);
      // Keep the address clean (old tracker links on the home page use ?query).
      url.searchParams.delete('season');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    forced = sessionStorage.getItem(KEY);
  } catch { /* storage blocked: the calendar decides */ }
}
let previewed = forced && SEASONS[forced] ? forced : null;

// While previewing, the Settings switch turns the preview on and off
// instead of changing the saved setting.
export const overridden = () => forced != null;
export function setOverride(on) {
  forced = on ? (previewed || seasonFor() || 'off') : 'off';
  try { sessionStorage.setItem(KEY, forced); } catch { /* kept for this page only */ }
}

// The season that should show, given the "Holiday looks" setting.
export function activeSeason(enabled = true) {
  if (forced === 'off') return null;
  if (forced && SEASONS[forced]) return forced;
  return enabled ? seasonFor() : null;
}
// The season the Settings switch is about (on by date or previewed).
export function availableSeason() {
  return previewed || seasonFor();
}

// True while a ?season= preview is on.
export const previewing = () => !!(forced && SEASONS[forced]);

// Home page line: how long until Christmas.
export function christmasLine(d = new Date()) {
  const m = d.getMonth(), day = d.getDate();
  if (m === 0) return 'Happy New Year!';
  if (m === 11 && day === 25) return 'Merry Christmas!';
  if (m === 11 && day === 24) return 'Christmas Eve';
  if (m === 11 && day > 25) return day === 31 ? "New Year's Eve" : 'Happy holidays';
  const xmas = new Date(m === 11 || m < 11 ? d.getFullYear() : d.getFullYear() + 1, 11, 25);
  const days = Math.round((xmas - new Date(d.getFullYear(), m, day)) / 86400000);
  return `${days} days to Christmas`;
}
