// Unlock: private pages send people here without a key, then take them back.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import { mount } from '../lib/mount.js';
import { Shell } from '../ui/Shell.jsx';
import { ItemIcon } from '../ui/items.jsx';
import { KeyForm } from '../ui/KeyDialog.jsx';
import { ALL_PAGES } from '../lib/site.js';

const q = new URLSearchParams(location.search);
const raw = q.get('next') || '';
// Only our own private pages, never another site.
const next = /^(tracker|tracker-next|tracker-classic|recordings|hall-of-fame)\.html(?:[?#][^\s]*)?$/.test(raw) ? raw : 'tracker.html';
const page = ALL_PAGES.find(p => next.startsWith(p.href));

function Unlock() {
  return (
    <Shell bg="unlock">
      <div class="wrap">
        <section class="panel lit pad lock-card reveal" aria-labelledby="unlock-h">
          <span class="tile big" style={{ '--hue': '#ff7a8a' }}><ItemIcon id={(page && page.item) || 'ui:book'} /></span>
          <h1 id="unlock-h">{page ? page.label : 'This page'} needs a key</h1>
          <p class="dim">{q.get('bad') ? 'Your saved key didn\'t work. Enter it again.' : 'Enter your key to open it. It stays in this browser only.'}</p>
          <div class="unlock-form"><KeyForm autofocus onDone={() => location.replace(next)} /></div>
          <a class="link" href="index.html">Back to home</a>
        </section>
      </div>
    </Shell>
  );
}

mount(<Unlock />);
