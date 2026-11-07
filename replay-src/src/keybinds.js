// Rebindable keys for the replay viewer. Each action has one or two keys,
// stored as KeyboardEvent.code (the physical key, so it works the same on
// any keyboard layout) and remembered in this browser.
const STORAGE = 'replayKeys'

// [action, label, default keys, group]
const ACTIONS = [
  ['play', 'Play / pause', ['Space', 'KeyK'], 'Playback'],
  ['back5', 'Back 5 seconds', ['ArrowLeft'], 'Playback'],
  ['fwd5', 'Forward 5 seconds', ['ArrowRight'], 'Playback'],
  ['back10', 'Back 10 seconds', ['KeyJ'], 'Playback'],
  ['fwd10', 'Forward 10 seconds', ['KeyL'], 'Playback'],
  ['slower', 'Slower', ['Comma'], 'Playback'],
  ['faster', 'Faster', ['Period'], 'Playback'],
  ['prevMoment', 'Previous moment', ['BracketLeft'], 'Playback'],
  ['nextMoment', 'Next moment', ['BracketRight'], 'Playback'],
  ['forward', 'Fly forward', ['KeyW'], 'Camera'],
  ['left', 'Fly left', ['KeyA'], 'Camera'],
  ['backward', 'Fly back', ['KeyS'], 'Camera'],
  ['right', 'Fly right', ['KeyD'], 'Camera'],
  ['up', 'Fly up', ['KeyE'], 'Camera'],
  ['down', 'Fly down', ['KeyQ'], 'Camera'],
  ['fast', 'Fly faster (hold)', ['ShiftLeft', 'ShiftRight'], 'Camera'],
  ['follow', 'Follow a player', ['KeyF'], 'Camera'],
  ['eyes', 'Their eyes', ['KeyV'], 'Camera'],
  ['overview', 'Map view', ['KeyM'], 'Camera'],
  ['next', 'Next player', ['KeyN'], 'Camera'],
  ['prev', 'Previous player', ['KeyP'], 'Camera'],
  ['map', 'Tactical map (off, corner, full)', ['KeyG'], 'Views'],
  ['hitboxes', 'Hitboxes', ['KeyB'], 'Views'],
  ['chat', 'Chat history', ['KeyT'], 'Views'],
  ['perf', 'Performance stats', ['Backquote'], 'Views'],
  ['share', 'Copy a link to this moment', ['KeyC'], 'Clips'],
  ['clipStart', 'Clip starts here', ['KeyI'], 'Clips'],
  ['clipEnd', 'Clip ends here', ['KeyO'], 'Clips'],
  ['help', 'Controls', ['KeyH', 'Slash'], 'Views']
]

class Keybinds {
  constructor () {
    this.keys = {}
    for (const [a, , d] of ACTIONS) this.keys[a] = d.slice()
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE)) || {}
      for (const a of Object.keys(saved)) if (this.keys[a] && Array.isArray(saved[a])) this.keys[a] = saved[a].filter(c => typeof c === 'string').slice(0, 2)
    } catch { /* private window */ }
    this.onChange = () => {}
  }

  /** The action a key code is bound to, or null. */
  action (code) {
    for (const a in this.keys) if (this.keys[a].includes(code)) return a
    return null
  }

  /** Bind `code` as the only key of `action`, taking it off any other action. */
  set (action, code) {
    for (const a in this.keys) this.keys[a] = this.keys[a].filter(c => c !== code)
    this.keys[action] = [code]
    this.save()
  }

  reset () {
    for (const [a, , d] of ACTIONS) this.keys[a] = d.slice()
    this.save()
  }

  save () {
    try { localStorage.setItem(STORAGE, JSON.stringify(this.keys)) } catch { /* ignore */ }
    this.onChange()
  }

  /** The first key of an action, as people know it ("W", "Space", "["). */
  label (action) { return this.keys[action] && this.keys[action][0] ? keyName(this.keys[action][0]) : '–' }
}

function keyName (code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6)
  const names = { Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Minus: '-', Equal: '=', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps' }
  return names[code] || code
}

/** Fills `box` with the controls list, each key a button that rebinds it. */
function renderBindings (box, binds) {
  box.textContent = ''
  let group = ''
  let waiting = null
  for (const [a, label, , g] of ACTIONS) {
    if (g !== group) {
      group = g
      const h = document.createElement('h3'); h.className = 'rp-keys-group'; h.textContent = g
      box.appendChild(h)
    }
    const row = document.createElement('div'); row.className = 'rp-bind'
    const name = document.createElement('span'); name.textContent = label
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rp-kbd'
    b.textContent = binds.keys[a].map(keyName).join(' / ') || '–'
    b.title = 'Click, then press a new key'
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      if (waiting) waiting.cancel()
      b.textContent = 'Press a key…'; b.classList.add('is-waiting')
      const onKey = (ev) => {
        ev.preventDefault(); ev.stopPropagation()
        cleanup()
        if (ev.code !== 'Escape') binds.set(a, ev.code)
        renderBindings(box, binds)
      }
      const cleanup = () => { window.removeEventListener('keydown', onKey, true); waiting = null }
      waiting = { cancel: () => { cleanup(); renderBindings(box, binds) } }
      window.addEventListener('keydown', onKey, true)
    })
    row.append(name, b)
    box.appendChild(row)
  }
}

module.exports = { Keybinds, ACTIONS, keyName, renderBindings }
