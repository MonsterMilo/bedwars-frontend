// Enter, check and forget the site key.
import { useState } from 'preact/hooks';
import { Dialog } from './Dialog.jsx';
import { Icon } from './icons.jsx';
import { siteKey, keyOwner, keyInfo, setKey } from '../lib/key.js';
import { useSignal } from '../lib/signal.js';
import { get } from '../lib/api.js';
import { toast } from '../lib/toast.js';

export async function checkKey() {
  if (!siteKey.value) { keyOwner.value = null; return null; }
  try {
    const who = await get('/whoami', { maxAge: 5 * 60_000 });
    keyOwner.value = who && who.who ? who.who : false;
    keyInfo.value = who && who.who ? { admin: !!who.admin, editWindowDays: who.editWindowDays, deleteWindowDays: who.deleteWindowDays } : {};
  } catch { /* offline: leave it unknown */ }
  return keyOwner.value;
}

// The key form on its own (the dialog and the unlock page both use it).
export function KeyForm({ onDone, autofocus = false }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    setError('');
    const before = siteKey.value;
    setKey(v);
    const who = await checkKey();
    setBusy(false);
    if (who) { toast(`Unlocked as ${who}`); setValue(''); if (onDone) onDone(who); }
    else { setKey(before); setError(who === false ? 'That key isn\'t valid.' : 'Couldn\'t check the key. Try again.'); }
  }

  return (
    <form class="stack" onSubmit={submit}>
      <label class="field">
        <span>Key</span>
        <div class="input-row">
          <input class="input" type={show ? 'text' : 'password'} value={value} onInput={e => setValue(e.currentTarget.value)} autofocus={autofocus}
            autocomplete="current-password" spellcheck={false} required maxLength={256} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'key-err' : undefined} />
          <button class="btn" type="button" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </label>
      {error && <p id="key-err" class="notice bad" role="alert"><Icon name="alert" />{error}</p>}
      <button class="btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Unlock'}</button>
    </form>
  );
}

export function KeyDialog({ open, onClose }) {
  const key = useSignal(siteKey);
  const owner = useSignal(keyOwner);
  function forget() { setKey(''); toast('Key removed from this browser'); }
  return (
    <Dialog open={open} onClose={onClose} title={key && owner ? 'Your key' : 'Enter your key'} class="key-dialog">
      {key && owner ? (
        <div class="stack">
          <p class="notice"><Icon name="unlock" /> <span>Unlocked as <strong>{owner}</strong>. Private pages and live stats are on in this browser.</span></p>
          <button class="btn" type="button" onClick={forget}>Remove key from this browser</button>
        </div>
      ) : (
        <div class="stack">
          <p class="dim">A key unlocks the tracker and recordings, and makes lookups live. It stays in this browser only.</p>
          <KeyForm onDone={onClose} />
        </div>
      )}
    </Dialog>
  );
}
