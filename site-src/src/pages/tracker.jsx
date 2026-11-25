// The tracker: lookup and add, the tracked list, player popups, denicking.
// (The old hand-written page is kept, unlinked, as tracker-classic.html.)
// Needs a key (the html sends you to unlock.html without one).
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/tracker.css';
import '../styles/fx.css';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { mount } from '../lib/mount.js';
import { Shell } from '../ui/Shell.jsx';
import { Icon } from '../ui/icons.jsx';
import { ItemIcon } from '../ui/items.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { siteKey } from '../lib/key.js';
import { readJson, writeJson } from '../lib/storage.js';
import { sweats, load, startLive, lockedOut } from '../tracker/store.js';
import { Lookup } from '../tracker/Lookup.jsx';
import { Sweats, Sotd } from '../tracker/Sweats.jsx';
import { PlayerModal } from '../tracker/PlayerModal.jsx';
import { EditModal } from '../tracker/EditModal.jsx';
import { Denick } from '../tracker/Denick.jsx';
import { Activity } from '../tracker/Activity.jsx';
import { Status } from '../tracker/Status.jsx';
import { useSignal } from '../lib/signal.js';
import { keyOwner } from '../lib/key.js';
import { readUrl, writeUrl } from '../tracker/url.js';
import { prefs, setPref } from '../lib/prefs.js';
import { toast } from '../lib/toast.js';
import { play } from '../lib/audio.js';
import { installFx, bindTitle, flipClose, setChatNames } from '../lib/fx.js';
import { ROSTER } from '../tracker/model.js';
import { setupApp } from '../lib/app.js';
import { PullRefresh, BottomNav, InstallButton, useWhatsNew, useCurrentSection } from '../tracker/AppBits.jsx';

installFx();
setupApp();
// The old tracker's section links (home-screen shortcuts, shared links).
const OLD_HASH = { sweatLookupSection: 'lookup', defeatedSweatsSection: 'sweats', denickingSection: 'denick', activitySection: 'activity' };
const oldHash = OLD_HASH[location.hash.slice(1)];
if (oldHash) history.replaceState(null, '', `${location.pathname}${location.search}#${oldHash}`);
setChatNames(Object.entries(ROSTER).filter(([k]) => k !== 'key').map(([, r]) => r.label));

const SECTIONS = [['lookup', 'Sweat Lookup', 'search'], ['sweats', 'Defeated Sweats', 'trophy'], ['denick', 'Denicking', 'mask'], ['activity', 'Activity', 'history']];
const SECTION_TEXT = {
  lookup: { kicker: 'Lookup', title: 'Sweat Lookup', sub: 'Look a player up and log the win.', icon: 'search' },
  sweats: { kicker: 'Defeated', title: 'Defeated Sweats', sub: 'Everyone we\'ve beaten.', icon: 'trophy' },
  denick: { kicker: 'Unmask', title: 'Denicking', sub: 'Who\'s behind a nick, or every nick a player used.', icon: 'mask' },
  activity: { kicker: 'Log', title: 'Activity', sub: 'Every add, edit and removal.', icon: 'history' }
};

// The section tabs: sticky under the header, the one you're reading lit.
function SectionBar({ sections }) {
  const [current] = useCurrentSection(sections.map(s => s[0]));
  if (sections.length < 2) return null;
  return (
    <nav class="tbar" aria-label="Sections">
      <div class="tbar-inner">
        {sections.map(([id, label, icon]) => (
          <a key={id} href={`#${id}`} class={current === id ? 'on' : ''} aria-current={current === id ? 'true' : undefined} data-quiet onClick={() => play('view')}>
            <Icon name={icon} />{label}
          </a>
        ))}
      </div>
    </nav>
  );
}
const HIDDEN = 'trackerHiddenSections';
const SHORTCUTS = [['/', 'Search sweats'], ['K', 'Sweat Lookup'], ['G', 'Grid view'], ['T', 'Table view'], ['L', 'Leaderboard view'], ['M', 'Sound on or off'], ['?', 'Show this list'], ['Esc', 'Close a popup']];

function typing(e) {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
function clickTab(label) {
  const tab = [...document.querySelectorAll('#sweats [role="tab"]')].find(b => b.textContent.trim() === label);
  if (tab) tab.click();
}

function Tracker() {
  const [player, setPlayer] = useState(null);
  const [editId, setEditId] = useState(null);
  const [help, setHelp] = useState(false);
  const [hidden, setHidden] = useState(() => readJson(HIDDEN, []));
  const admin = useSignal(keyOwner) === 'admin';
  const sections = SECTIONS.filter(([id]) => id !== 'activity' || admin);
  const title = useRef(null);
  useEffect(() => bindTitle(title.current), []);
  useWhatsNew();
  const total = useSignal(sweats).length;
  const refresh = useCallback(() => { window.dispatchEvent(new Event('tracker-refresh')); return load({ quiet: true }); }, []);

  useEffect(() => {
    if (!siteKey.value) { lockedOut(); return; }
    load().then(() => {
      startLive();
      const name = readUrl().player;
      if (name) {
        const s = sweats.value.find(x => String(x.username).toLowerCase() === name.toLowerCase());
        setPlayer(s || { username: name });
      }
    });
  }, []);

  const open = useCallback(s => { setPlayer(s); writeUrl({ player: s.username }); }, []);
  const close = useCallback(() => {
    writeUrl({ player: '' });
    flipClose(document.querySelector('dialog.player-dialog')).then(() => setPlayer(null));
  }, []);
  const edit = useCallback(s => setEditId(s._id), []);
  const toggle = id => {
    const showing = hidden.includes(id);
    const next = showing ? hidden.filter(x => x !== id) : [...hidden, id];
    setHidden(next); writeJson(HIDDEN, next);
    play('slide', { open: showing });
  };

  useEffect(() => {
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e) || document.querySelector('dialog[open]')) return;
      const k = e.key;
      if (k === '/') { e.preventDefault(); const q = document.getElementById('f-q'); if (q) { q.focus(); q.scrollIntoView({ block: 'center' }); } else clickTab('Grid'); }
      else if (k === 'k' || k === 'K') { e.preventDefault(); const n = document.getElementById('lk-name'); if (n) { n.focus(); n.scrollIntoView({ block: 'center' }); } }
      else if (k === 'g' || k === 'G') clickTab('Grid');
      else if (k === 't' || k === 'T') clickTab('Table');
      else if (k === 'l' || k === 'L') clickTab('Leaderboard');
      else if (k === 'm' || k === 'M') { const on = !prefs.value.sound; setPref('sound', on); toast(on ? 'Sound on' : 'Sound off'); }
      else if (k === '?') setHelp(h => !h);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Shell bg="tracker">
      <div class="page wrap tracker">
        <header class="t-hero">
          <p class="t-kicker"><span aria-hidden="true" />Prism · Sweat Tracker<span aria-hidden="true" /></p>
          <h1 ref={title} class="t-title" data-title-stunt>Sweat Tracker</h1>
          <p class="t-sub">{total > 0 ? `${total.toLocaleString()} sweats beaten so far` : 'Every sweat we beat, in one place'} · <button type="button" class="linkish" onClick={() => setHelp(true)}>Shortcuts</button></p>
        </header>

        {!hidden.includes('sweats') && <Sotd onOpen={open} />}
        <SectionBar sections={sections} />

        <div class="tracker-stack">
          {sections.map(([id], i) => {
            const meta = SECTION_TEXT[id];
            const off = hidden.includes(id);
            const body = id === 'lookup' ? <Lookup onOpen={open} /> : id === 'sweats' ? <Sweats onOpen={open} onEdit={edit} /> : id === 'denick' ? <Denick /> : <Activity />;
            return (
              <section key={id} id={id} class={`tsec ${off ? 'off' : ''}`} aria-labelledby={`${id}-h`}>
                <header class="tsec-head">
                  <span class="tsec-icon" aria-hidden="true"><Icon name={meta.icon} /></span>
                  <div class="tsec-text">
                    <p class="tsec-kicker">{String(i + 1).padStart(2, '0')} / {meta.kicker}</p>
                    <h2 id={`${id}-h`}>{meta.title}</h2>
                    <p class="tsec-sub">{meta.sub}</p>
                  </div>
                  <span class="tsec-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <button type="button" class="btn small ghost tsec-toggle" aria-expanded={!off} onClick={() => toggle(id)}>{off ? 'Show' : 'Hide'}<Icon name="down" class={off ? '' : 'flip-up'} /></button>
                </header>
                {!off && body}
              </section>
            );
          })}
        </div>
        <footer class="tracker-foot">
          <span class="faint small"><span class="kbd-hint">Press <kbd>?</kbd> for shortcuts</span></span>
          <span class="foot-tools">
            <Status />
            <InstallButton />
            <button type="button" class="btn small ghost" onClick={() => { scrollTo({ top: 0, behavior: document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth' }); }}><Icon name="down" class="flip-up" />Back to top</button>
          </span>
        </footer>
      </div>
      <BottomNav sections={sections.filter(([id]) => !hidden.includes(id)).map(([id, label, icon]) => [id, label === 'Denicking' ? 'Denick' : label === 'Sweat Lookup' ? 'Lookup' : label === 'Defeated Sweats' ? 'Sweats' : label, icon])} />
      <PullRefresh onRefresh={refresh} />

      <PlayerModal target={player} onClose={close} onEdit={s => { setEditId(s._id); }} />
      <EditModal id={editId} onClose={() => setEditId(null)} />
      <Dialog open={help} onClose={() => setHelp(false)} title="Shortcuts" class="small-dialog">
        <ul class="shortcuts">{SHORTCUTS.map(([k, what]) => <li key={k}><kbd>{k}</kbd><span>{what}</span></li>)}</ul>
        <p class="faint small">They work anywhere on the page, except while typing.</p>
      </Dialog>
    </Shell>
  );
}

mount(<Tracker />);
