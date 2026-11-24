// Notes on a player: everyone's notes across their entries, oldest first.
// New notes go on the entry that was opened.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { useSignal } from '../lib/signal.js';
import { keyOwner } from '../lib/key.js';
import { toast } from '../lib/toast.js';
import { notesOf, canWrite, canChangeNote, personColor } from './model.js';
import { addNote, editNote, deleteNote } from './store.js';
import { NoteAuthor } from './ui.jsx';

const MAX = 280;

function Editor({ initial = '', onSave, onCancel, label }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const owner = useSignal(keyOwner);
  async function save(e) {
    if (e) e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr('');
    try { await onSave(t); } catch (x) { setErr(x.message || 'Couldn\'t save that note.'); setBusy(false); }
  }
  return (
    <form class="note-editor" onSubmit={save}>
      <label class="sr-only" for="note-ed">{label}</label>
      <textarea id="note-ed" class="input" rows={3} maxLength={MAX} value={text} autofocus
        onInput={e => setText(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(e); if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }} />
      <div class="note-editor-bar">
        {owner && <NoteAuthor id={owner} />}
        <span class={`faint small ${text.length > MAX - 20 ? 'warn' : ''}`}>{text.length}/{MAX}</span>
        <span class="grow" />
        {err && <span class="bad small" role="alert">{err}</span>}
        <button type="button" class="btn small ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" class="btn small primary" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

export function Notes({ entries }) {
  useSignal(keyOwner);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const all = entries.flatMap(s => notesOf(s).map(n => ({ n, s }))).sort((a, b) => new Date(a.n.createdAt || 0) - new Date(b.n.createdAt || 0));
  const target = entries[0];

  async function remove(n, s) {
    setConfirming(null);
    try { await deleteNote(s._id, n._id); toast('Note deleted'); } catch (x) { toast(x.message || 'Couldn\'t delete that note.'); }
  }

  return (
    <section class="notes" aria-labelledby="notes-h">
      <div class="notes-head">
        <h3 id="notes-h"><Icon name="list" />Notes {all.length > 0 && <span class="count-badge">{all.length}</span>}</h3>
        <span class="grow" />
        {target && canWrite() && !adding && <button type="button" class="btn small" onClick={() => setAdding(true)}>Add note</button>}
      </div>
      {!all.length && !adding && <p class="faint small">No notes yet.</p>}
      {all.length > 0 && (
        <ul class="note-list">
          {all.map(({ n, s }) => (
            <li key={n._id || n.createdAt} class="note" style={{ '--c': personColor(n.author || 'admin') }}>
              <div class="note-top">
                <NoteAuthor id={n.author} at={n.createdAt} />
                {n.editedAt && <span class="faint small">edited</span>}
                <span class="grow" />
                {editing !== n._id && confirming !== n._id && (
                  <>
                    {canChangeNote(n, 'edit') && <button type="button" class="btn icon small ghost" aria-label="Edit note" onClick={() => setEditing(n._id)}><Icon name="settings" /></button>}
                    {canChangeNote(n, 'delete') && <button type="button" class="btn icon small ghost danger" aria-label="Delete note" onClick={() => setConfirming(n._id)}><Icon name="close" /></button>}
                  </>
                )}
              </div>
              {editing === n._id
                ? <Editor label="Edit note" initial={n.text} onCancel={() => setEditing(null)} onSave={async t => { await editNote(s._id, n._id, t); setEditing(null); }} />
                : <p class="note-text">{n.text}</p>}
              {confirming === n._id && (
                <div class="note-confirm" role="alert">
                  <span class="grow small">Delete this note?</span>
                  <button type="button" class="btn small ghost" onClick={() => setConfirming(null)}>Keep</button>
                  <button type="button" class="btn small danger-solid" onClick={() => remove(n, s)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <Editor label="New note" onCancel={() => setAdding(false)} onSave={async t => { await addNote(target._id, t); setAdding(false); toast('Note added'); }} />}
    </section>
  );
}
