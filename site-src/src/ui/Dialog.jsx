// A modal built on <dialog>: focus is trapped, Esc closes, focus returns.
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './icons.jsx';

export function Dialog({ open, onClose, title, children, class: cls = '', side = false, labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = e => { e.preventDefault(); onClose(); };
    const onClick = e => { if (e.target === d) onClose(); };
    d.addEventListener('cancel', onCancel);
    d.addEventListener('click', onClick);
    return () => { d.removeEventListener('cancel', onCancel); d.removeEventListener('click', onClick); };
  }, [onClose]);
  const id = labelledBy || `dlg-${title ? title.replace(/\W+/g, '-').toLowerCase() : 'x'}`;
  return (
    <dialog ref={ref} class={`dialog ${side ? 'side' : ''} ${cls}`} aria-labelledby={id}>
      {open && (
        <div class="dialog-body">
          <header class="dialog-head">
            <h2 id={id}>{title}</h2>
            <button class="btn icon ghost" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
