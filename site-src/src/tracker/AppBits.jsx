// The tracker's app extras: pull to refresh (home-screen app only), the
// phone section bar, the footer's tally and Install button, What's new.
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { useSignal } from '../lib/signal.js';
import { read, write } from '../lib/storage.js';
import { standalone, installable, install } from '../lib/app.js';
import { eggToast } from '../lib/fx.js';
import { play } from '../lib/audio.js';
import { toast } from '../lib/toast.js';

// ---- Pull to refresh ----
// A home-screen app has no refresh button, so pulling down from the very
// top reloads. In a browser tab the browser's own pull does this.
const READY = 72;
export function PullRefresh({ onRefresh }) {
  const el = useRef(null);
  useEffect(() => {
    if (!standalone || !('ontouchstart' in window)) return undefined;
    const node = el.current;
    let startY = null, pull = 0, ready = false, busy = false;
    const blocked = t => t.closest('dialog, input, textarea, select, .table-wrap, .clip-strip');
    const show = () => {
      const d = Math.min(pull, 110);
      node.style.transform = `translate(-50%, ${d - 56}px) rotate(${d * 3}deg)`;
      node.style.opacity = String(Math.min(1, d / READY));
    };
    const reset = () => {
      node.classList.remove('ready', 'spinning');
      node.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      node.style.transform = 'translate(-50%, -56px)';
      node.style.opacity = '0';
      setTimeout(() => { node.style.transition = ''; }, 260);
    };
    const start = e => {
      if (busy || e.touches.length !== 1 || scrollY > 0 || blocked(e.target)) { startY = null; return; }
      startY = e.touches[0].clientY; pull = 0; ready = false;
    };
    const move = e => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || scrollY > 0) { pull = 0; show(); return; }
      pull = dy * 0.55;
      if (!ready && pull >= READY) { ready = true; play('ui'); } else if (ready && pull < READY) ready = false;
      node.classList.toggle('ready', ready);
      show();
    };
    const end = async () => {
      if (startY === null) return;
      startY = null;
      if (!ready) { reset(); return; }
      busy = true;
      node.classList.add('spinning');
      node.style.transform = `translate(-50%, ${READY - 56}px)`;
      try { await onRefresh(); } finally { busy = false; reset(); }
    };
    addEventListener('touchstart', start, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', end);
    return () => { removeEventListener('touchstart', start); removeEventListener('touchmove', move); removeEventListener('touchend', end); };
  }, [onRefresh]);
  if (!standalone) return null;
  return <div ref={el} class="pull-refresh" aria-hidden="true"><Icon name="refresh" /></div>;
}

// ---- Phone section bar ----
// Jumps between sections, lighting the one you're in.
export function BottomNav({ sections }) {
  const [current, setCurrent] = useState(sections[0] && sections[0][0]);
  const ids = sections.map(s => s[0]).join(',');
  useEffect(() => {
    const els = sections.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!els.length || !('IntersectionObserver' in window)) return undefined;
    const seen = new Map();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      let best = null, ratio = 0;
      for (const [id, r] of seen) if (r > ratio) { best = id; ratio = r; }
      if (best) setCurrent(best);
    }, { threshold: [0, 0.15, 0.4, 0.7], rootMargin: '-15% 0px -35% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  if (sections.length < 2) return null;
  return (
    <nav class="bottom-nav" aria-label="Sections">
      {sections.map(([id, label, icon]) => (
        <a key={id} href={`#${id}`} class={current === id ? 'on' : ''} aria-current={current === id ? 'true' : undefined}
          onClick={() => { setCurrent(id); play('view'); }} data-quiet>
          <Icon name={icon} /><span>{label}</span>
        </a>
      ))}
    </nav>
  );
}

// ---- Install app ----
export function InstallButton() {
  const can = useSignal(installable);
  if (!can) return null;
  async function go() {
    const r = await install();
    if (r === 'ios') eggToast(['To install: tap ', ['Share'], ', then ', ['Add to Home Screen'], '.'], 7000);
    else if (r === true) toast('Installed. The tracker is on your home screen now.');
  }
  return <button type="button" class="btn small ghost" onClick={go}><Icon name="download" />Install app</button>;
}

// ---- What's new ----
// One toast per update, once per browser. Newest first; only the top one shows.
const WHATS_NEW = [
  { id: '2026-11-rebuild', parts: ['✨ ', ['New tracker.'], ' Same features, new look. Change the look and sounds in Settings.'] }
];
export function useWhatsNew() {
  useEffect(() => {
    const latest = WHATS_NEW[0];
    if (!latest || read('whatsNewSeen') === latest.id) return undefined;
    write('whatsNewSeen', latest.id);
    const t = setTimeout(() => eggToast(latest.parts, 7000), 1800);
    return () => clearTimeout(t);
  }, []);
}
