// Cheater tags from blacklists, each with where it came from (Urchin only
// for key holders, Astrus rollup, Aurora, Xadia, Zumo).
import { Icon } from '../ui/icons.jsx';
import { get } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { date } from '../lib/format.js';

// Seconds, ms or a date string -> ms.
export function tagTime(at) {
  if (!at) return null;
  if (typeof at === 'number') return at < 1e12 ? at * 1000 : at;
  const n = Number(at);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const p = Date.parse(at);
  return Number.isNaN(p) ? null : p;
}
const SRC_CLASS = { urchin: 'src-urchin', aurora: 'src-aurora', xadia: 'src-xadia', astrus: 'src-astrus', antisniper: 'src-antisniper', zumo: 'src-zumo' };
export const srcClass = s => SRC_CLASS[String(s || '').toLowerCase()] || 'src-other';

export function TagList({ uuid, compact = false }) {
  const { data, error, loading, reload } = useAsync(signal => get(`/site/tags/${uuid}`, { signal, maxAge: 5 * 60_000 }), [uuid], { skip: !uuid });
  const tags = (data && data.tags) || [];
  return (
    <div class={`t-tags ${compact ? 'compact' : ''} ${tags.length ? 'has' : ''}`}>
      <div class="t-tags-head">
        <Icon name="shield" /><span>Tags</span>
        {loading && <span class="faint small">Checking…</span>}
        {data && <span class={`chip ${tags.length ? 'bad' : 'good'}`}>{tags.length ? `${tags.length} tag${tags.length > 1 ? 's' : ''}` : 'Clean'}</span>}
        {error && <button type="button" class="link small" onClick={reload}>Unavailable. Retry</button>}
      </div>
      {tags.length > 0 && (
        <ul class="t-tag-list">
          {tags.map((t, i) => {
            const ms = tagTime(t.at);
            return (
              <li key={i} class="t-tag">
                <span class="t-tag-type">{String(t.type || 'tag').replace(/_/g, ' ')}</span>
                <span class="t-tag-reason">{t.reason || 'No reason given'}</span>
                <span class="t-tag-meta">
                  {t.source && <span class={`t-src ${srcClass(t.source)}`}>{t.source}</span>}
                  {ms && <span>{date(ms)}</span>}
                  {t.automatic && <span>Automatic</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
