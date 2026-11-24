// The tracker, rebuilt: lookup and add, the tracked list, player popups.
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
import { Dialog } from '../ui/Dialog.jsx';
import { siteKey } from '../lib/key.js';
import { readJson, writeJson } from '../lib/storage.js';
import { sweats, load, startLive, lockedOut } from '../tracker/store.js';
import { Lookup } from '../tracker/Lookup.jsx';
import { Sweats } from '../tracker/Sweats.jsx';
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

installFx();
setChatNames(Object.entries(ROSTER).filter(([k]) => k !== 'key').map(([, r]) => r.label));

const SECTIONS = [['lookup', 'Lookup', 'search'], ['denick', 'Denicking', 'mask'], ['sweats', 'Sweats', 'trophy'], ['activity', 'Activity', 'history']];
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
    <Shell>
      <div class="page wrap tracker">
        <header class="page-head">
          <div class="grow">
            <p class="eyebrow"><Icon name="list" />Tracker</p>
            <h1 ref={title} data-title-stunt>Sweat Tracker</h1>
          </div>
          <nav class="jump" aria-label="Sections">
            {sections.map(([id, label, icon]) => (
              <span key={id} class="jump-item">
                <a href={`#${id}`} class="btn small ghost"><Icon name={icon} />{label}</a>
                <button type="button" data-quiet class="btn icon small ghost" aria-pressed={!hidden.includes(id)} aria-label={`${hidden.includes(id) ? 'Show' : 'Hide'} ${label}`} title={hidden.includes(id) ? 'Show' : 'Hide'} onClick={() => toggle(id)}><Icon name={hidden.includes(id) ? 'down' : 'check'} /></button>
              </span>
            ))}
            <button type="button" class="btn icon small ghost" aria-label="Keyboard shortcuts" title="Shortcuts (?)" onClick={() => setHelp(true)}><Icon name="info" /></button>
          </nav>
        </header>

        <div class="tracker-grid">
          {(!hidden.includes('lookup') || !hidden.includes('denick')) && (
            <div class="tracker-side">
              {!hidden.includes('lookup') && <Lookup onOpen={open} />}
              {!hidden.includes('denick') && <Denick />}
            </div>
          )}
          {!hidden.includes('sweats') && <Sweats onOpen={open} onEdit={edit} />}
        </div>
        {admin && !hidden.includes('activity') && <Activity />}
        <footer class="tracker-foot">
          <Status />
          <span class="faint small">Press <kbd>?</kbd> for shortcuts</span>
        </footer>
      </div>

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
