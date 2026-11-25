// Download: the public Prism injectable. Reads the newest build straight from
// GitHub releases, so publishing a release there is all it takes to go live.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/download.css';
import { mount } from '../lib/mount.js';
import { Shell, Logo } from '../ui/Shell.jsx';
import { Icon } from '../ui/icons.jsx';
import { Loading, ErrorBox, copyText, HeadEmblem } from '../ui/common.jsx';
import { ItemIcon } from '../ui/items.jsx';
import { useAsync } from '../lib/useAsync.js';
import { date, num } from '../lib/format.js';
import { toast } from '../lib/toast.js';

const REPO = 'MonsterMilo/prism';
const REPO_URL = `https://github.com/${REPO}`;
const ASSET_PREFIX = `${REPO_URL}/releases/download/`;

// Newest published build, pre-releases included (Prism is early). null = none yet.
async function latestRelease(signal) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
    signal, headers: { Accept: 'application/vnd.github+json' }, referrerPolicy: 'no-referrer'
  });
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is busy. Try again in a minute.');
  if (!res.ok) throw new Error("Couldn't reach GitHub.");
  const list = await res.json();
  const rel = Array.isArray(list) ? list.find(r => r && !r.draft) : null;
  if (!rel) return null;
  // Only ever link files that live in this repo's releases.
  const assets = (rel.assets || []).filter(a => typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(ASSET_PREFIX));
  return { ...rel, assets };
}

function size(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}
const sha = a => (typeof a.digest === 'string' && a.digest.startsWith('sha256:') ? a.digest.slice(7) : null);

// Release notes as plain text: headings, "- " bullets and paragraphs. No HTML.
function Notes({ body }) {
  const text = String(body || '').replace(/\r/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
  if (!text) return null;
  const blocks = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[-+]\s+(.*)/);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'ul') last.items.push(bullet[1]); else blocks.push({ type: 'ul', items: [bullet[1]] });
    } else if (/^#{1,6}\s/.test(line)) blocks.push({ type: 'h', text: line.replace(/^#+\s*/, '') });
    else blocks.push({ type: 'p', text: line });
  }
  return (
    <div class="dl-notes">
      {blocks.map((b, i) => b.type === 'ul'
        ? <ul key={i}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
        : b.type === 'h' ? <h3 key={i}>{b.text}</h3> : <p key={i}>{b.text}</p>)}
    </div>
  );
}

function Release({ rel }) {
  const main = rel.assets.find(a => /\.exe$/i.test(a.name)) || rel.assets[0];
  const others = rel.assets.filter(a => a !== main);
  const hash = main && sha(main);
  return (
    <section class="panel pad lit dl-card" aria-labelledby="dl-version">
      <div class="dl-top">
        <div class="dl-logo" aria-hidden="true"><Logo size={34} /></div>
        <div class="grow">
          <h2 id="dl-version">Prism {rel.tag_name || rel.name}</h2>
          <p class="faint small">
            {date(Date.parse(rel.published_at || rel.created_at))}
            {rel.prerelease && <span class="chip warn">Pre-release</span>}
          </p>
        </div>
      </div>
      {main ? (
        <>
          <div class="dl-actions">
            <a class="btn primary dl-btn" href={main.browser_download_url} rel="noopener noreferrer">
              <Icon name="download" />Download {main.name}<span class="dl-size">{size(main.size)}</span>
            </a>
            <a class="btn" href={rel.html_url} target="_blank" rel="noopener noreferrer"><Icon name="external" />On GitHub</a>
          </div>
          {hash && (
            <div class="dl-hash">
              <span class="faint small">SHA-256</span>
              <code class="mono">{hash}</code>
              <button type="button" class="btn icon small ghost" aria-label="Copy SHA-256" onClick={() => copyText(hash, toast)}><Icon name="copy" /></button>
            </div>
          )}
        </>
      ) : <p class="faint">This build has no files yet.</p>}
      {others.length > 0 && (
        <details class="dl-more">
          <summary>Other files ({others.length})</summary>
          <ul>
            {others.map(a => (
              <li key={a.id}>
                <a class="link" href={a.browser_download_url} rel="noopener noreferrer">{a.name}</a>
                <span class="faint small">{size(a.size)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Notes body={rel.body} />
      {main && main.download_count > 0 && <p class="faint small">{num(rel.assets.reduce((n, a) => n + (a.download_count || 0), 0))} downloads</p>}
    </section>
  );
}

function ComingSoon() {
  return (
    <section class="panel pad lit dl-card dl-soon" aria-labelledby="dl-soon">
      <div class="dl-top">
        <div class="dl-logo" aria-hidden="true"><Logo size={34} /></div>
        <div class="grow">
          <h2 id="dl-soon">Coming soon</h2>
          <p class="faint">The first public build isn't out yet. It will show up here when it is.</p>
        </div>
      </div>
      <div class="dl-actions">
        <button type="button" class="btn primary dl-btn" disabled><Icon name="download" />Download</button>
        <a class="btn" href={REPO_URL} target="_blank" rel="noopener noreferrer"><Icon name="code" />Source on GitHub</a>
      </div>
    </section>
  );
}

const STEPS = [
  ['Start Lunar Client', 'Launch Minecraft 1.8.9.'],
  ['Run Prism.exe', 'It loads into the game by itself, or press Inject.'],
  ['Check chat', 'You’ll see "[Prism] Loaded".'],
  ['Add plugins', 'Drop .jar files in the plugins folder. They reload on their own.']
];

function Download() {
  const { data, error, loading, reload } = useAsync(signal => latestRelease(signal), []);
  return (
    <Shell bg="download">
      <div class="page wrap">
        <header class="page-head">
          <div class="grow">
            <p class="eyebrow"><ItemIcon id="block:enchanting" />Download</p>
            <h1>Prism</h1>
            <p>An open-source plugin platform for Minecraft 1.8.9. It runs inside Lunar Client.</p>
          </div>
          <HeadEmblem id="block:enchanting" />
        </header>

        <div class="dl-layout">
          <div class="dl-main">
            {loading && <div class="panel pad"><Loading lines={4} label="Checking for the latest build" /></div>}
            {error && (
              <>
                <ErrorBox error={error} onRetry={reload} what="the latest build" />
                <a class="btn" href={`${REPO_URL}/releases`} target="_blank" rel="noopener noreferrer"><Icon name="external" />Releases on GitHub</a>
              </>
            )}
            {!loading && !error && (data ? <Release rel={data} /> : <ComingSoon />)}

            <section class="panel pad" aria-labelledby="dl-how">
              <h2 class="panel-title" id="dl-how"><Icon name="list" />How to use it</h2>
              <ol class="dl-steps">
                {STEPS.map(([t, d], i) => <li key={i}><b>{t}</b><span class="faint">{d}</span></li>)}
              </ol>
              <p class="faint small">Files live in <code class="mono">%APPDATA%\Prism</code>: plugins, data and logs.</p>
            </section>
          </div>

          <aside class="dl-side">
            <section class="panel pad" aria-labelledby="dl-needs">
              <h2 class="panel-title" id="dl-needs"><Icon name="check" />Needs</h2>
              <ul class="dl-list">
                <li>Windows 10 or 11, 64-bit</li>
                <li>Lunar Client, Minecraft 1.8.9</li>
              </ul>
            </section>
            <section class="panel pad" aria-labelledby="dl-safe">
              <h2 class="panel-title" id="dl-safe"><Icon name="shield" />Safety</h2>
              <ul class="dl-list">
                <li>Only download it from this page or GitHub.</li>
                <li>Check the SHA-256 matches the file you got.</li>
                <li>All the code is public on GitHub.</li>
              </ul>
            </section>
            <section class="panel pad" aria-labelledby="dl-dev">
              <h2 class="panel-title" id="dl-dev"><Icon name="code" />Make plugins</h2>
              <p class="faint small">Build against <code class="mono">prism-api.jar</code> (Java 8).</p>
              <a class="link small" href={`${REPO_URL}#writing-a-plugin`} target="_blank" rel="noopener noreferrer">Plugin guide <Icon name="external" size={14} /></a>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

mount(<Download />);
