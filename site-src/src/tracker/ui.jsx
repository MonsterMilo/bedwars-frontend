// Small pieces every tracker view uses.
import { ROSTER, ROSTER_KEYS, personColor, personInitials, personLabel, tierOf, gaugeOf, TIERS } from './model.js';
import { Icon } from '../ui/icons.jsx';
import { ago } from '../lib/format.js';

export function RosterDot({ id, size = 26, title }) {
  return (
    <span class="r-dot" style={{ '--c': personColor(id), '--s': `${size}px` }} title={title || personLabel(id)} aria-label={title || personLabel(id)} role="img">
      {personInitials(id)}
    </span>
  );
}
export function RosterDots({ ids, empty = 'Nobody yet' }) {
  if (!ids.length) return <span class="faint small">{empty}</span>;
  return <span class="r-dots">{ids.map(k => <RosterDot key={k} id={k} />)}</span>;
}

// Toggle chips for Beaten By. value = { milo: true, ... }
export function RosterPicker({ value, onChange, label = 'Beaten by', disabled }) {
  return (
    <fieldset class="r-picker" disabled={disabled}>
      <legend>{label}</legend>
      <div class="r-picker-row">
        {ROSTER_KEYS.map(k => (
          <button key={k} type="button" class={`r-chip ${value[k] ? 'on' : ''}`} style={{ '--c': ROSTER[k].color }} aria-pressed={!!value[k]} onClick={() => onChange({ ...value, [k]: !value[k] })}>
            <span class="r-chip-dot" aria-hidden="true">{ROSTER[k].initials}</span>{ROSTER[k].label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function FlagPicker({ cheating, boosting, onChange, disabled }) {
  return (
    <div class="flag-picker" role="group" aria-label="Flags">
      <button type="button" class={`flag-chip cheat ${cheating ? 'on' : ''}`} aria-pressed={!!cheating} disabled={disabled} onClick={() => onChange({ cheating: !cheating, boosting })}><Icon name="alert" />Cheating</button>
      <button type="button" class={`flag-chip boost ${boosting ? 'on' : ''}`} aria-pressed={!!boosting} disabled={disabled} onClick={() => onChange({ cheating, boosting: !boosting })}><Icon name="alert" />Boosting</button>
    </div>
  );
}
export function Flags({ s }) {
  if (!s.cheating && !s.boosting) return null;
  return (
    <span class="flags">
      {s.cheating && <span class="chip bad">Cheater</span>}
      {s.boosting && <span class="chip warn">Boosting</span>}
    </span>
  );
}

export function TierBadge({ index }) {
  const t = tierOf(index);
  return <span class={`tier ${t.key}`}>{t.name}</span>;
}

// Threat meter: the index on a log scale with the tier marks.
export function Gauge({ index }) {
  const fill = gaugeOf(index);
  const t = tierOf(index);
  return (
    <div class={`gauge ${t.key}`} role="meter" aria-label="Player index" aria-valuemin={0} aria-valuemax={7} aria-valuenow={Math.log10(Math.max(1, index)).toFixed(2)} aria-valuetext={`${Math.round(index).toLocaleString()} (${t.name})`}>
      <div class="gauge-track"><span class="gauge-fill" style={{ width: `${fill * 100}%`, '--f': fill }} /></div>
      <div class="gauge-marks" aria-hidden="true">
        {TIERS.slice(0, -1).map(x => <span key={x.key} style={{ left: `${Math.log10(x.max) / 7 * 100}%` }} />)}
      </div>
      <div class="gauge-scale" aria-hidden="true">{TIERS.map(x => <span key={x.key} class={x.key === t.key ? 'on' : ''}>{x.name}</span>)}</div>
    </div>
  );
}

export function NoteAuthor({ id, at }) {
  return (
    <span class="note-who">
      <RosterDot id={id || 'admin'} size={20} />
      <b style={{ color: personColor(id || 'admin') }}>{personLabel(id) || 'Someone'}</b>
      {at && <span class="faint" title={new Date(at).toLocaleString()}>{ago(Date.parse(at))}</span>}
    </span>
  );
}

export const fixed = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—');
export const whole = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString() : '—');
