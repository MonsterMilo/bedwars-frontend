// Settings: every look-and-feel choice, applied live and kept per browser.
import { Dialog } from './Dialog.jsx';
import { prefs, setPref, resetPrefs, ACCENTS } from '../lib/prefs.js';
import { useSignal } from '../lib/signal.js';
import { MODES } from '../lib/bedwars.js';

function Seg({ label, value, options, onChange }) {
  return (
    <div class="field">
      <span id={`seg-${label}`}>{label}</span>
      <div class="seg" role="group" aria-labelledby={`seg-${label}`}>
        {options.map(([v, text]) => (
          <button type="button" key={v} aria-pressed={value === v ? 'true' : 'false'} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}
const ZONES = [['local', 'This device'], ['America/Los_Angeles', 'Pacific'], ['America/Denver', 'Mountain'], ['America/Chicago', 'Central'],
  ['America/New_York', 'Eastern'], ['Europe/London', 'London'], ['Europe/Berlin', 'Central Europe'], ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney'], ['UTC', 'UTC']];

export function Settings({ open, onClose }) {
  const p = useSignal(prefs);
  return (
    <Dialog open={open} onClose={onClose} title="Settings" side class="settings">
      <div class="settings-body">
        <section class="settings-group" aria-labelledby="sg-look">
          <h3 id="sg-look">Look</h3>
          <Seg label="Background" value={p.surface} options={[['dark', 'Dark'], ['oled', 'Black'], ['light', 'Light']]} onChange={v => setPref('surface', v)} />
          <div class="field">
            <span id="acc-label">Accent</span>
            <div class="swatches" role="radiogroup" aria-labelledby="acc-label">
              {Object.entries(ACCENTS).map(([id, a]) => (
                <button type="button" role="radio" aria-checked={p.accent === id ? 'true' : 'false'} key={id} class="swatch" onClick={() => setPref('accent', id)} title={a.label}>
                  <span class="swatch-fill" style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b} 55%, ${a.c})` }} />
                  <span class="swatch-label">{a.label}</span>
                </button>
              ))}
              <label class={`swatch ${p.accent === 'custom' ? 'on' : ''}`} title="Custom colour">
                <input type="color" value={p.custom} aria-label="Custom accent colour"
                  onInput={e => { setPref('custom', e.currentTarget.value); setPref('accent', 'custom'); }} />
                <span class="swatch-label">Custom</span>
              </label>
            </div>
          </div>
          <label class="check"><input type="checkbox" checked={p.effects} onChange={e => setPref('effects', e.currentTarget.checked)} /> Light effects behind the page</label>
        </section>

        <section class="settings-group" aria-labelledby="sg-read">
          <h3 id="sg-read">Reading</h3>
          <label class="field">
            <span>Text size <output class="mono">{p.textScale}%</output></span>
            <input type="range" min="85" max="140" step="5" value={p.textScale} onInput={e => setPref('textScale', Number(e.currentTarget.value))} />
          </label>
          <Seg label="Font" value={p.font} options={[['manrope', 'Manrope'], ['system', 'System'], ['hyperlegible', 'Hyperlegible']]} onChange={v => setPref('font', v)} />
          <Seg label="Spacing" value={p.density} options={[['comfy', 'Roomy'], ['compact', 'Compact']]} onChange={v => setPref('density', v)} />
          <Seg label="Contrast" value={p.contrast} options={[['normal', 'Normal'], ['high', 'High']]} onChange={v => setPref('contrast', v)} />
          <Seg label="Motion" value={p.motion} options={[['system', 'Match device'], ['reduce', 'Less'], ['full', 'Full']]} onChange={v => setPref('motion', v)} />
          <label class="check"><input type="checkbox" checked={p.underline} onChange={e => setPref('underline', e.currentTarget.checked)} /> Underline links</label>
        </section>

        <section class="settings-group" aria-labelledby="sg-num">
          <h3 id="sg-num">Numbers and time</h3>
          <Seg label="Big numbers" value={p.numbers} options={[['full', '12,345'], ['short', '12.3k']]} onChange={v => setPref('numbers', v)} />
          <Seg label="Ratio decimals" value={String(p.decimals)} options={[['1', '1.2'], ['2', '1.23'], ['3', '1.234']]} onChange={v => setPref('decimals', Number(v))} />
          <label class="field">
            <span>Time zone</span>
            <select class="select" value={p.timeZone} onChange={e => setPref('timeZone', e.currentTarget.value)}>
              {ZONES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <Seg label="Clock" value={p.hour12 ? '12' : '24'} options={[['12', '1:30 PM'], ['24', '13:30']]} onChange={v => setPref('hour12', v === '12')} />
        </section>

        <section class="settings-group" aria-labelledby="sg-def">
          <h3 id="sg-def">Defaults</h3>
          <label class="field">
            <span>Mode shown first on profiles</span>
            <select class="select" value={p.mode} onChange={e => setPref('mode', e.currentTarget.value)}>
              {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <Seg label="Leaderboard period" value={p.lbPeriod} options={[['lifetime', 'Lifetime'], ['weekly', 'Weekly'], ['daily', 'Daily']]} onChange={v => setPref('lbPeriod', v)} />
        </section>
        <button class="btn" type="button" onClick={resetPrefs}>Reset all settings</button>
      </div>
    </Dialog>
  );
}
