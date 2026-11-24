// Sources status: one pill, and the full list in a popup.
import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { get } from '../lib/api.js';
import { ago } from '../lib/format.js';

const WORDS = { ok: 'Working', warn: 'Partly working', down: 'Down', off: 'Off', checking: 'Checking…' };

export function Status() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  async function load(fresh = false) {
    setBusy(true);
    try { setData(await get(`/status${fresh ? '?fresh=1' : ''}`, { maxAge: fresh ? 0 : 60_000 })); } catch { setData(d => d || { overall: 'down', summary: 'Couldn\'t check', sources: [] }); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);
  const state = busy && !data ? 'checking' : (data && data.overall) || 'checking';
  return (
    <>
      <button type="button" class="btn small ghost status-pill" onClick={() => setOpen(true)}>
        <span class="status-dot" data-state={state} aria-hidden="true" />
        {state === 'ok' ? 'All sources working' : state === 'checking' ? 'Checking sources…' : data.summary || WORDS[state]}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Sources" class="small-dialog">
        {data && (
          <>
            <ul class="status-list">
              {(data.sources || []).map(s => (
                <li key={s.id || s.name}>
                  <span class="status-dot" data-state={s.state} title={WORDS[s.state] || s.state} />
                  <span class="grow"><b>{s.name}</b><span class="faint small">{s.detail || WORDS[s.state] || ''}</span></span>
                </li>
              ))}
            </ul>
            <div class="dialog-actions">
              {data.checkedAt && <span class="faint small grow">Checked {ago(Date.parse(data.checkedAt) || data.checkedAt)}</span>}
              <button type="button" class="btn small" disabled={busy} onClick={() => load(true)}><Icon name="refresh" />{busy ? 'Checking…' : 'Check again'}</button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
