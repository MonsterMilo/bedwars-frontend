// Edit a tracked entry: logged stats, Beaten By, flags and its notes.
import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { ErrorBox } from '../ui/common.jsx';
import { useSignal } from '../lib/signal.js';
import { keyInfo } from '../lib/key.js';
import { toast } from '../lib/toast.js';
import { sweats, updateSweat } from './store.js';
import { ROSTER_KEYS, canEdit, indexOf } from './model.js';
import { RosterPicker, FlagPicker, TierBadge, whole } from './ui.jsx';
import { Notes } from './Notes.jsx';

const FIELDS = [['star', 'Stars', 1], ['fkdr', 'FKDR', 0.01], ['wlr', 'WLR', 0.01], ['bblr', 'BBLR', 0.01], ['kdr', 'KDR', 0.01]];

export function EditModal({ id, onClose }) {
  const all = useSignal(sweats);
  const info = useSignal(keyInfo);
  const s = id ? all.find(x => x._id === id) : null;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!s) { setForm(null); return; }
    setForm({
      ...Object.fromEntries(FIELDS.map(([k]) => [k, s[k] == null ? '' : String(Math.round(Number(s[k]) * 100) / 100)])),
      beaten: Object.fromEntries(ROSTER_KEYS.map(k => [k, !!s[k]])),
      cheating: !!s.cheating, boosting: !!s.boosting
    });
    setError(null);
  }, [id]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = { ...form.beaten, cheating: form.cheating, boosting: form.boosting };
    for (const [k] of FIELDS) if (form[k] !== '') body[k] = Number(form[k]);
    try { await updateSweat(s._id, body); toast(`Saved ${s.username}`); onClose(); } catch (err) { setError(err); } finally { setBusy(false); }
  }

  const ok = s && canEdit(s);
  const preview = form ? indexOf({ fkdr: form.fkdr, star: form.star }) : 0;
  return (
    <Dialog open={!!s} onClose={onClose} title={s ? `Edit ${s.username}` : 'Edit'} class="edit-dialog">
      {s && form && (
        <form class="edit" onSubmit={save}>
          {!ok && <div class="notice"><Icon name="lock" /><span>Entries can be changed for {info.editWindowDays || 30} days. Only full access keys can change older ones.</span></div>}
          <fieldset class="edit-stats" disabled={!ok}>
            <legend>Logged stats</legend>
            {FIELDS.map(([k, label, step]) => (
              <div class="field" key={k}>
                <label for={`ed-${k}`}>{label}</label>
                <input id={`ed-${k}`} class="input mono" type="number" min="0" step={step} value={form[k]} onInput={e => setForm({ ...form, [k]: e.currentTarget.value })} />
              </div>
            ))}
            <div class="edit-index"><span class="faint small">Index</span><b class="mono">{whole(preview)}</b><TierBadge index={preview} /></div>
          </fieldset>
          <RosterPicker value={form.beaten} disabled={!ok} onChange={b => setForm({ ...form, beaten: b })} />
          <FlagPicker cheating={form.cheating} boosting={form.boosting} disabled={!ok} onChange={fl => setForm({ ...form, ...fl })} />
          <ErrorBox error={error} />
          <div class="dialog-actions">
            <button type="button" class="btn" onClick={onClose}>Cancel</button>
            <button type="submit" class="btn primary" disabled={!ok || busy}><Icon name="check" />{busy ? 'Saving…' : 'Save'}</button>
          </div>
          <Notes entries={[s]} />
        </form>
      )}
    </Dialog>
  );
}
