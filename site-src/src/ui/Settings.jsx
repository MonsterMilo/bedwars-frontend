// Settings: every look-and-feel choice, applied live and kept per browser.
import { Dialog } from './Dialog.jsx';
import { prefs, setPref, resetPrefs, ACCENTS, fxPage, season, apply } from '../lib/prefs.js';
import { useSignal } from '../lib/signal.js';
import { MODES } from '../lib/bedwars.js';
import { Select, Switch, Range } from './controls.jsx';
import { availableSeason, SEASONS, overridden, setOverride } from '../lib/season.js';

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
  const fx = useSignal(fxPage);
  const holiday = useSignal(season);
  const toggleHoliday = v => { if (overridden()) { setOverride(v); apply(); } else setPref('seasonal', v); };
  const canSound = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
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
              <label class={`swatch custom ${p.accent === 'custom' ? 'on' : ''}`} title="Custom colour">
                <span class="swatch-fill custom-fill" style={{ '--c': p.custom }}>
                  <input type="color" value={p.custom} aria-label="Custom accent colour"
                    onInput={e => { setPref('custom', e.currentTarget.value); setPref('accent', 'custom'); }} />
                </span>
                <span class="swatch-label">Custom</span>
              </label>
            </div>
          </div>
          <Switch checked={p.effects} onChange={v => setPref('effects', v)}>Moving background</Switch>
          {availableSeason() && <Switch checked={!!holiday} onChange={toggleHoliday}>{SEASONS[availableSeason()].label}</Switch>}
        </section>

        {fx && (
          <section class="settings-group" aria-labelledby="sg-sound">
            <h3 id="sg-sound">Sound and effects</h3>
            {canSound && <Switch checked={p.sound} onChange={v => setPref('sound', v)}>Sounds</Switch>}
            {canSound && (
              <div class="field">
                <span id="vol-l">Volume <output class="mono">{p.volume}%</output></span>
                <Range label="Volume" min={0} max={100} step={5} value={p.volume} disabled={!p.sound} onChange={v => setPref('volume', v)} />
              </div>
            )}
            {canSound && <Switch checked={p.music} disabled={!p.sound} onChange={v => setPref('music', v)}>Music</Switch>}
            <Switch checked={p.fx} onChange={v => setPref('fx', v)}>Click effects and easter eggs</Switch>
          </section>
        )}

        <section class="settings-group" aria-labelledby="sg-read">
          <h3 id="sg-read">Reading</h3>
          <div class="field">
            <span>Text size <output class="mono">{p.textScale}%</output></span>
            <Range label="Text size" min={85} max={140} step={5} value={p.textScale} onChange={v => setPref('textScale', v)} />
          </div>
          <Seg label="Font" value={p.font} options={[['manrope', 'Manrope'], ['system', 'System'], ['hyperlegible', 'Hyperlegible']]} onChange={v => setPref('font', v)} />
          <Seg label="Spacing" value={p.density} options={[['comfy', 'Roomy'], ['compact', 'Compact']]} onChange={v => setPref('density', v)} />
          <Seg label="Contrast" value={p.contrast} options={[['normal', 'Normal'], ['high', 'High']]} onChange={v => setPref('contrast', v)} />
          <Seg label="Motion" value={p.motion} options={[['system', 'Match device'], ['reduce', 'Less'], ['full', 'Full']]} onChange={v => setPref('motion', v)} />
          <Switch checked={p.underline} onChange={v => setPref('underline', v)}>Underline links</Switch>
        </section>

        <section class="settings-group" aria-labelledby="sg-num">
          <h3 id="sg-num">Numbers and time</h3>
          <Seg label="Big numbers" value={p.numbers} options={[['full', '12,345'], ['short', '12.3k']]} onChange={v => setPref('numbers', v)} />
          <Seg label="Ratio decimals" value={String(p.decimals)} options={[['1', '1.2'], ['2', '1.23'], ['3', '1.234']]} onChange={v => setPref('decimals', Number(v))} />
          <div class="field">
            <span>Time zone</span>
            <Select label="Time zone" value={p.timeZone} options={ZONES} onChange={v => setPref('timeZone', v)} />
          </div>
          <Seg label="Clock" value={p.hour12 ? '12' : '24'} options={[['12', '1:30 PM'], ['24', '13:30']]} onChange={v => setPref('hour12', v === '12')} />
        </section>

        <section class="settings-group" aria-labelledby="sg-def">
          <h3 id="sg-def">Defaults</h3>
          <div class="field">
            <span>Mode shown first on profiles</span>
            <Select label="Mode shown first" value={p.mode} options={MODES.map(m => [m.id, m.label])} onChange={v => setPref('mode', v)} />
          </div>
          <Seg label="Leaderboard period" value={p.lbPeriod} options={[['lifetime', 'Lifetime'], ['weekly', 'Weekly'], ['daily', 'Daily']]} onChange={v => setPref('lbPeriod', v)} />
        </section>
        <button class="btn" type="button" onClick={resetPrefs}>Reset all settings</button>
      </div>
    </Dialog>
  );
}
