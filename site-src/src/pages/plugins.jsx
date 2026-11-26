// Plugins: community plugins for Prism. Anyone can submit a public GitHub
// release; Milo reviews that exact release before it's listed. We never
// host the files, the cards link to the release on GitHub.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/plugins.css';
import { useState, useMemo } from 'preact/hooks';
import { mount } from '../lib/mount.js';
import { Shell } from '../ui/Shell.jsx';
import { Icon } from '../ui/icons.jsx';
import { Tabs, Loading, ErrorBox, Empty, HeadEmblem } from '../ui/common.jsx';
import { ItemIcon } from '../ui/items.jsx';
import { Select } from '../ui/controls.jsx';
import { get, post, enc } from '../lib/api.js';
import { useAsync, useParam } from '../lib/useAsync.js';
import { date, ago } from '../lib/format.js';
import { useSignal } from '../lib/signal.js';
import { keyOwner, siteKey } from '../lib/key.js';
import { toast } from '../lib/toast.js';

const CATEGORIES = ['Overlay', 'Chat', 'Stats', 'Utility', 'Cosmetic', 'Other'];
const CAT_ICON = { Overlay: 'eye', Chat: 'list', Stats: 'trophy', Utility: 'settings', Cosmetic: 'sparkle', Other: 'code' };

function PluginCard({ p, children }) {
  return (
    <article class="plug">
      <div class="plug-top">
        <span class="plug-ico"><Icon name={CAT_ICON[p.category] || 'code'} /></span>
        <div class="plug-title">
          <h3>{p.name}</h3>
          <p class="faint small">by {p.author} · <span class="mono">{p.tag}</span></p>
        </div>
        <span class="chip">{p.category}</span>
      </div>
      <p class="plug-desc">{p.description}</p>
      {children}
      <a class="btn small plug-link" href={p.url} target="_blank" rel="noopener noreferrer"><Icon name="external" />Release on GitHub</a>
    </article>
  );
}

function Browse({ onSubmit }) {
  const { data, error, loading, reload } = useAsync(signal => get('/site/plugins', { signal, maxAge: 60_000 }), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const list = (data && data.plugins) || [];
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(p => (cat === 'all' || p.category === cat) && (!s || `${p.name} ${p.author} ${p.description}`.toLowerCase().includes(s)));
  }, [data, q, cat]);
  if (loading && !data) return <div class="panel pad"><Loading lines={4} label="Loading plugins" /></div>;
  if (error) return <ErrorBox error={error} onRetry={reload} what="plugins" />;
  if (!list.length) {
    return (
      <div class="panel pad plug-empty">
        <Empty icon="code">No plugins yet.</Empty>
        <button type="button" class="btn primary" onClick={onSubmit}><Icon name="plus" />Submit one</button>
      </div>
    );
  }
  const cats = CATEGORIES.filter(c => list.some(p => p.category === c));
  return (
    <>
      <div class="plug-tools">
        <Tabs label="Category" value={cat} onChange={setCat} options={[['all', 'All'], ...cats.map(c => [c, c])]} />
        <input class="input plug-search" type="search" placeholder="Find a plugin" value={q} onInput={e => setQ(e.currentTarget.value)} aria-label="Find a plugin" />
      </div>
      <div class="plug-grid">{shown.map(p => <PluginCard key={p.id} p={p} />)}</div>
      {!shown.length && <div class="panel pad"><Empty>No plugin matches.</Empty></div>}
    </>
  );
}

const BLANK = { name: '', description: '', author: '', category: '', repo: '', tag: '', contact: '', website: '' };
const REPO_OK = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/?$|^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

function Submit() {
  const [f, setF] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const set = k => e => setF(x => ({ ...x, [k]: e && e.currentTarget ? e.currentTarget.value : e }));
  function problem() {
    if (f.name.trim().length < 2) return 'Give it a name.';
    if (f.description.trim().length < 10) return 'Say what it does (at least 10 characters).';
    if (!f.author.trim()) return 'Who made it?';
    if (!f.category) return 'Pick a category.';
    if (!REPO_OK.test(f.repo.trim())) return 'The repo is a GitHub link, like github.com/you/plugin.';
    if (!/^[A-Za-z0-9._\-/+]{1,60}$/.test(f.tag.trim())) return 'The release tag is like v1.0.0.';
    return '';
  }
  async function send(e) {
    e.preventDefault();
    const p = problem();
    if (p) { setErr(p); return; }
    setBusy(true); setErr('');
    try { await post('/site/plugins', f); setDone(true); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  if (done) {
    return (
      <div class="panel pad plug-done">
        <Icon name="check" />
        <h2>Submitted</h2>
        <p class="faint">It shows here once it's approved.</p>
        <button type="button" class="btn" onClick={() => { setF(BLANK); setDone(false); }}>Submit another</button>
      </div>
    );
  }
  return (
    <form class="panel pad plug-form" onSubmit={send} noValidate>
      <p class="faint small plug-rules">Link a public GitHub repo and one release. We review that exact release, so a new version needs a new submission.</p>
      <div class="plug-fields">
        <label class="field"><span>Name</span><input class="input" value={f.name} onInput={set('name')} maxLength={40} required /></label>
        <label class="field"><span>Author</span><input class="input" value={f.author} onInput={set('author')} maxLength={32} required /></label>
        <div class="field"><span id="pl-cat">Category</span><Select label="Category" value={f.category} onChange={set('category')} options={CATEGORIES.map(c => [c, c])} placeholder="Pick one" /></div>
        <label class="field wide"><span>What it does</span><textarea class="input" rows={3} value={f.description} onInput={set('description')} maxLength={300} required /><small class="faint">{f.description.length}/300</small></label>
        <label class="field"><span>GitHub repo</span><input class="input" value={f.repo} onInput={set('repo')} placeholder="github.com/you/plugin" maxLength={140} spellcheck={false} required /></label>
        <label class="field"><span>Release tag</span><input class="input mono" value={f.tag} onInput={set('tag')} placeholder="v1.0.0" maxLength={60} spellcheck={false} required /></label>
        <label class="field wide"><span>Contact <em class="faint">(optional, only we see it)</em></span><input class="input" value={f.contact} onInput={set('contact')} placeholder="Discord name" maxLength={60} /></label>
        {/* People never see this; bots fill it in. */}
        <label class="plug-trap" aria-hidden="true">Website<input tabIndex={-1} autocomplete="off" value={f.website} onInput={set('website')} /></label>
      </div>
      {err && <p class="bad-text small" role="alert">{err}</p>}
      <button type="submit" class="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Submit for review'}</button>
    </form>
  );
}

function Review() {
  const key = useSignal(siteKey);
  const { data, error, loading, reload } = useAsync(signal => get('/site/plugins/review', { signal, maxAge: 0 }), [key]);
  const [show, setShow] = useState('pending');
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState('');
  const all = (data && data.submissions) || [];
  const list = show === 'pending' ? all.filter(s => s.status === 'pending') : all;
  async function act(s, action) {
    setBusy(s.id + action);
    try {
      await post(`/site/plugins/${enc(s.id)}/review`, { action, note: notes[s.id] || '' });
      toast(action === 'approve' ? 'Approved' : 'Rejected');
      reload();
    } catch (x) { toast(x.message); } finally { setBusy(''); }
  }
  if (loading && !data) return <div class="panel pad"><Loading lines={4} label="Loading submissions" /></div>;
  if (error) return <ErrorBox error={error} onRetry={reload} what="submissions" />;
  const pending = all.filter(s => s.status === 'pending').length;
  return (
    <>
      <div class="plug-tools">
        <Tabs label="Show" value={show} onChange={setShow} options={[['pending', `Pending (${pending})`], ['all', 'All']]} />
      </div>
      {!list.length && <div class="panel pad"><Empty icon="check">{show === 'pending' ? 'Nothing to review.' : 'No submissions yet.'}</Empty></div>}
      <div class="plug-grid">
        {list.map(s => (
          <PluginCard key={s.id} p={s}>
            <p class="faint small">Sent {ago(s.submittedAt)}{s.contact ? ` · ${s.contact}` : ''}</p>
            {s.status === 'pending' ? (
              <div class="plug-review">
                <input class="input" placeholder="Note (optional)" value={notes[s.id] || ''} onInput={e => { const v = e.currentTarget.value; setNotes(n => ({ ...n, [s.id]: v })); }} maxLength={300} aria-label={`Note for ${s.name}`} />
                <div class="row">
                  <button type="button" class="btn small primary" disabled={!!busy} onClick={() => act(s, 'approve')}><Icon name="check" />Approve</button>
                  <button type="button" class="btn small" disabled={!!busy} onClick={() => act(s, 'reject')}><Icon name="close" />Reject</button>
                </div>
              </div>
            ) : (
              <p class="small"><span class={`chip ${s.status === 'approved' ? 'good' : 'bad'}`}>{s.status === 'approved' ? 'Approved' : 'Rejected'}</span> <span class="faint">{date(s.reviewedAt)}{s.note ? ` · ${s.note}` : ''}</span>
                {s.status === 'approved' && <button type="button" class="linkish small plug-undo" disabled={!!busy} onClick={() => act(s, 'reject')}>Unlist</button>}
              </p>
            )}
          </PluginCard>
        ))}
      </div>
    </>
  );
}

function Plugins() {
  const owner = useSignal(keyOwner);
  const reviewer = owner === 'milo' || owner === 'admin';
  const [tab, setTab] = useParam('tab', 'browse');
  const tabs = [['browse', 'Browse'], ['submit', 'Submit'], ...(reviewer ? [['review', 'Review']] : [])];
  const cur = tabs.some(t => t[0] === tab) ? tab : 'browse';
  return (
    <Shell>
      <div class="page wrap">
        <header class="page-head">
          <div class="grow">
            <p class="eyebrow"><ItemIcon id="block:crafting" />Plugins</p>
            <h1>Plugins</h1>
            <p>Plugins for Prism. Each release is reviewed before it's listed.</p>
          </div>
          <HeadEmblem id="block:crafting" />
        </header>
        <Tabs label="Plugins" value={cur} onChange={setTab} options={tabs} class="plug-tabs" />
        {cur === 'browse' && <Browse onSubmit={() => setTab('submit')} />}
        {cur === 'submit' && <Submit />}
        {cur === 'review' && <Review />}
      </div>
    </Shell>
  );
}

mount(<Plugins />);
