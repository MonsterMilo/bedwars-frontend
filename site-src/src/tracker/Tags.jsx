// Cheater tags from blacklists (Astrus rollup, then Aurora). Never Urchin:
// Urchin is only for players in Milo's live games.
import { Icon } from '../ui/icons.jsx';
import { get } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { date } from '../lib/format.js';

export function TagList({ uuid, compact = false }) {
  const { data, error, loading, reload } = useAsync(signal => get(`/site/tags/${uuid}`, { signal, maxAge: 5 * 60_000 }), [uuid], { skip: !uuid });
  const tags = (data && data.tags) || [];
  return (
    <div class={`t-tags ${compact ? 'compact' : ''}`}>
      <div class="t-tags-head">
        <Icon name="shield" /><span>Tags</span>
        {loading && <span class="faint small">Checking…</span>}
        {data && <span class={`chip ${tags.length ? 'bad' : 'good'}`}>{tags.length ? `${tags.length} tag${tags.length > 1 ? 's' : ''}` : 'Clean'}</span>}
        {error && <button type="button" class="link small" onClick={reload}>Unavailable. Retry</button>}
      </div>
      {tags.length > 0 && (
        <ul class="tags">
          {tags.map((t, i) => (
            <li key={i} class="tag-row">
              <span class="chip bad">{String(t.type || 'tag').replace(/_/g, ' ')}</span>
              <span class="grow">
                <span class="tag-reason">{t.reason || 'No reason given'}</span>
                <span class="faint small">{t.source}{t.at ? ` · ${date(typeof t.at === 'number' && t.at < 1e12 ? t.at * 1000 : t.at)}` : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
