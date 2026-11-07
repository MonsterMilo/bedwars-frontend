/* Page backgrounds for the Prism pages. One <canvas class="page-bg" data-bg="..."> per page:
     sparks    Cosmetics Library: drifting pixel particles that gather and glint around the pointer;
               moving leaves a little trail, a click on empty space bursts like a kill effect.
     contours  Prism Atlas: a topographic map whose lines ring a hill that follows the pointer,
               with the pointer's map coordinates beside it; a click drops a survey pin.
     timeline  Prism Recordings: a replay waveform with kill and bed markers scrolling by; the
               playhead follows the pointer with its timecode, and a click marks a clip.
   Colours come from the page's theme tokens, so every theme gets its own tint. Nothing runs
   while the tab is hidden or the canvas isn't shown, and reduced motion gets one still frame. */
(function () {
  var cv = document.querySelector('canvas[data-bg]');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var kind = cv.getAttribute('data-bg');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(1.5, window.devicePixelRatio || 1);
  var W = 0, H = 0;

  /* ---------- theme colours ---------- */
  var C = {};
  function parse(str, fb) {
    str = String(str || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
    if (m) { var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    m = /rgba?\(([^)]+)\)/.exec(str);
    if (m) { var p = m[1].split(/[ ,/]+/).map(Number); return [p[0], p[1], p[2]]; }
    return fb;
  }
  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    C.a = parse(cs.getPropertyValue('--accent'), [94, 231, 255]);
    C.b = parse(cs.getPropertyValue('--accent-2'), [169, 139, 255]);
    C.g = parse(cs.getPropertyValue('--gold'), [255, 196, 107]);
    C.bad = parse(cs.getPropertyValue('--bad'), [255, 107, 129]);
    C.text = parse(cs.getPropertyValue('--text'), [238, 241, 248]);
    var bg = parse(cs.getPropertyValue('--bg'), [6, 7, 11]);
    C.light = (bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114) > 140;
    C.k = C.light ? 0.75 : 1; // light themes: a touch softer
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a * C.k)).toFixed(3) + ')'; }
  readTheme();
  new MutationObserver(function () { readTheme(); if (reduce) draw(0, 0); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });

  /* ---------- size, pointer ---------- */
  function resize() {
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (scene.resize) scene.resize();
    if (reduce) draw(0, 0);
  }
  var mouse = { x: -9999, y: -9999, sx: -9999, sy: -9999, on: false, moved: 0, lx: 0, ly: 0 };
  addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    if (!mouse.on) { mouse.sx = e.clientX; mouse.sy = e.clientY; }
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true; mouse.moved = performance.now();
  }, { passive: true });
  document.addEventListener('pointerleave', function () { mouse.on = false; });
  addEventListener('blur', function () { mouse.on = false; });
  // A click only counts when it lands on empty page, never on a control or a card.
  var SKIP = 'a,button,input,select,textarea,label,summary,[role="button"],[role="dialog"],.card,.game,.panel,.studio,.rail,.search,.seg,.note,.at-map,.at-loading';
  addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || !scene || !scene.click || getComputedStyle(cv).display === 'none') return;
    if (e.target.closest && e.target.closest(SKIP)) return;
    if (getSelection && String(getSelection())) return;
    scene.click(e.clientX, e.clientY);
  });

  /* ---------- noise (for the map and the waveform) ---------- */
  var perm = new Uint8Array(512);
  (function () { var p = [], i, s = 1337; for (i = 0; i < 256; i++) p[i] = i; for (i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; var j = s % (i + 1), t = p[i]; p[i] = p[j]; p[j] = t; } for (i = 0; i < 512; i++) perm[i] = p[i & 255]; })();
  function grad(h, x, y) { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function noise2(x, y) {
    var X = Math.floor(x), Y = Math.floor(y); x -= X; y -= Y; X &= 255; Y &= 255;
    var u = fade(x), v = fade(y), a = perm[X] + Y, b = perm[X + 1] + Y;
    var n00 = grad(perm[a], x, y), n10 = grad(perm[b], x - 1, y), n01 = grad(perm[a + 1], x, y - 1), n11 = grad(perm[b + 1], x - 1, y - 1);
    return (n00 + u * (n10 - n00) + v * (n01 - n00 + u * (n11 - n10 - n01 + n00))) * 0.7; // about -1..1
  }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ======================= Cosmetics: pixel sparks ======================= */
  function Sparks() {
    var motes = [], bits = [], lastTrail = { x: 0, y: 0 };
    function pal(i) { return i % 3 === 0 ? C.a : i % 3 === 1 ? C.b : C.g; }
    function seed() {
      var n = Math.round(Math.max(40, Math.min(130, W * H / 14000)));
      motes = [];
      for (var i = 0; i < n; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 6, vy: -(6 + Math.random() * 16), s: 2 + Math.floor(Math.random() * 3), c: i, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6, glow: 0 });
    }
    function burst(x, y, n, power) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, v = power * (0.35 + Math.random() * 0.65);
        bits.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.25, life: 0, max: 0.7 + Math.random() * 0.7, s: 2 + Math.floor(Math.random() * 3), c: Math.floor(Math.random() * 3), g: 1 });
      }
    }
    return {
      resize: seed,
      click: function (x, y) { burst(x, y, 34, 260); },
      step: function (dt, t) {
        // a short trail behind a moving pointer, like a projectile trail
        if (mouse.on && performance.now() - mouse.moved < 80) {
          var dx = mouse.x - lastTrail.x, dy = mouse.y - lastTrail.y;
          if (dx * dx + dy * dy > 26 * 26) { lastTrail.x = mouse.x; lastTrail.y = mouse.y; bits.push({ x: mouse.x, y: mouse.y, vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 20, life: 0, max: 0.6 + Math.random() * 0.4, s: 2, c: Math.floor(Math.random() * 3), g: 0.25 }); }
        }
        for (var i = 0; i < motes.length; i++) {
          var m = motes[i];
          var near = 0;
          if (mouse.on) {
            var ex = mouse.x - m.x, ey = mouse.y - m.y, d2 = ex * ex + ey * ey, R = 170;
            if (d2 < R * R) {
              var d = Math.sqrt(d2) || 1; near = 1 - d / R;
              // drawn in, then circled: they gather around the pointer without landing on it
              var pull = near * 60, swirl = near * 70;
              m.vx += (ex / d * pull - ey / d * swirl) * dt; m.vy += (ey / d * pull + ex / d * swirl) * dt;
            }
          }
          m.glow += (near - m.glow) * Math.min(1, dt * 6);
          m.vx *= 1 - dt * 0.9; m.vy += (-(10 + m.sp * 6) - m.vy) * dt * 0.6;
          m.x += m.vx * dt; m.y += m.vy * dt;
          if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
          if (m.x < -10) m.x = W + 10; else if (m.x > W + 10) m.x = -10;
        }
        for (var j = bits.length - 1; j >= 0; j--) {
          var b = bits[j]; b.life += dt;
          if (b.life > b.max) { bits.splice(j, 1); continue; }
          b.vy += 420 * b.g * dt; b.vx *= 1 - dt * 1.5; b.x += b.vx * dt; b.y += b.vy * dt;
        }
        if (bits.length > 400) bits.splice(0, bits.length - 400);
      },
      draw: function (t) {
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < motes.length; i++) {
          var m = motes[i], tw = 0.5 + 0.5 * Math.sin(t * m.sp + m.ph);
          var a = 0.12 + tw * 0.22 + m.glow * 0.6, s = m.s + (m.glow > 0.5 ? 1 : 0), c = pal(m.c);
          var x = Math.round(m.x), y = Math.round(m.y);
          ctx.fillStyle = rgba(c, a);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
          if (m.glow > 0.35 || tw > 0.97) { // a little four-point glint, pixel style
            var g = Math.max(m.glow, (tw - 0.97) * 20);
            ctx.fillStyle = rgba(c, 0.25 * g + 0.1);
            ctx.fillRect(x - s / 2 - s, y - s / 2, s, s); ctx.fillRect(x + s / 2, y - s / 2, s, s);
            ctx.fillRect(x - s / 2, y - s / 2 - s, s, s); ctx.fillRect(x - s / 2, y + s / 2, s, s);
          }
        }
        for (var j = 0; j < bits.length; j++) {
          var b = bits[j], k = 1 - b.life / b.max, bs = Math.max(1, Math.round(b.s * (0.5 + k * 0.6)));
          ctx.fillStyle = rgba(pal(b.c), 0.75 * k);
          ctx.fillRect(Math.round(b.x) - bs / 2, Math.round(b.y) - bs / 2, bs, bs);
        }
      }
    };
  }

  /* ======================= Atlas: topographic map ======================= */
  function Contours() {
    var CELL = 20, cols = 0, rows = 0, vals = null, hx = -9999, hy = -9999, hk = 0, pins = [];
    var STEP = 0.075;
    function field(t) {
      var i, j, idx = 0, s = 1 / 300, dr = t * 0.012;
      for (j = 0; j < rows; j++) {
        var y = j * CELL;
        for (i = 0; i < cols; i++) {
          var x = i * CELL;
          var v = noise2(x * s + dr, y * s - dr * 0.6) + 0.5 * noise2(x * s * 2.1 - dr, y * s * 2.1 + 7.3) + 0.22 * noise2(x * s * 4.3 + 3.1, y * s * 4.3 - dr * 1.4);
          if (hk > 0.001) { var dx = x - hx, dy = y - hy; v += 0.85 * hk * Math.exp(-(dx * dx + dy * dy) / (2 * 120 * 120)); }
          vals[idx++] = v;
        }
      }
    }
    function lerp(a, b, lv) { return (lv - a) / (b - a || 1e-6); }
    function contour(lv) {
      ctx.beginPath();
      for (var j = 0; j < rows - 1; j++) {
        for (var i = 0; i < cols - 1; i++) {
          var k = j * cols + i, a = vals[k], b = vals[k + 1], c = vals[k + cols + 1], d = vals[k + cols];
          var code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
          if (code === 0 || code === 15) continue;
          var x = i * CELL, y = j * CELL;
          var top = [x + CELL * lerp(a, b, lv), y], right = [x + CELL, y + CELL * lerp(b, c, lv)], bot = [x + CELL * lerp(d, c, lv), y + CELL], left = [x, y + CELL * lerp(a, d, lv)];
          var segs;
          switch (code) {
            case 1: case 14: segs = [left, bot]; break;
            case 2: case 13: segs = [bot, right]; break;
            case 3: case 12: segs = [left, right]; break;
            case 4: case 11: segs = [top, right]; break;
            case 6: case 9: segs = [top, bot]; break;
            case 7: case 8: segs = [left, top]; break;
            case 5: segs = [left, top, bot, right]; break;
            case 10: segs = [left, bot, top, right]; break;
          }
          for (var s = 0; s < segs.length; s += 2) { ctx.moveTo(segs[s][0], segs[s][1]); ctx.lineTo(segs[s + 1][0], segs[s + 1][1]); }
        }
      }
      ctx.stroke();
    }
    function coord(px, py) { return { x: Math.round((px - W / 2) / 3 + 0), z: Math.round((py - H / 2) / 3) }; }
    return {
      resize: function () { cols = Math.ceil(W / CELL) + 2; rows = Math.ceil(H / CELL) + 2; vals = new Float32Array(cols * rows); },
      click: function (x, y) { pins.push({ x: x, y: y, t: 0, c: coord(x, y) }); if (pins.length > 4) pins.shift(); },
      step: function (dt) {
        var target = mouse.on ? 1 : 0;
        hk += (target - hk) * Math.min(1, dt * 2.2);
        if (mouse.on) {
          if (hx < -999) { hx = mouse.x; hy = mouse.y; }
          hx += (mouse.x - hx) * Math.min(1, dt * 3.5); hy += (mouse.y - hy) * Math.min(1, dt * 3.5);
        }
        for (var i = pins.length - 1; i >= 0; i--) { pins[i].t += dt; if (pins[i].t > 6) pins.splice(i, 1); }
      },
      draw: function (t) {
        ctx.clearRect(0, 0, W, H);
        field(t);
        var min = Infinity, max = -Infinity;
        for (var q = 0; q < vals.length; q += 7) { if (vals[q] < min) min = vals[q]; if (vals[q] > max) max = vals[q]; }
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        var near = mouse.on && hk > 0.05;
        var grad = null, gradIdx = null;
        if (near) {
          grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, 300);
          grad.addColorStop(0, rgba(C.a, 0.30)); grad.addColorStop(1, rgba(C.text, 0.05));
          gradIdx = ctx.createRadialGradient(hx, hy, 0, hx, hy, 340);
          gradIdx.addColorStop(0, rgba(C.a, 0.55)); gradIdx.addColorStop(1, rgba(C.g, 0.12));
        }
        var first = Math.ceil(-2.5 / STEP), last = Math.floor(3.5 / STEP);
        for (var n = first; n <= last; n++) {
          var lv = n * STEP;
          if (lv < min || lv > max) continue;
          var index = n % 5 === 0;
          ctx.lineWidth = index ? 1.3 : 0.8;
          ctx.strokeStyle = index ? (gradIdx || rgba(C.g, 0.12)) : (grad || rgba(C.text, 0.05));
          contour(lv);
        }
        // the pointer: a survey cross with its map coordinates
        ctx.font = '600 11px "JetBrains Mono", ui-monospace, Consolas, monospace';
        if (near) {
          var c = coord(hx, hy), al = 0.55 * hk;
          ctx.strokeStyle = rgba(C.a, al); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(hx - 9, hy); ctx.lineTo(hx - 4, hy); ctx.moveTo(hx + 4, hy); ctx.lineTo(hx + 9, hy); ctx.moveTo(hx, hy - 9); ctx.lineTo(hx, hy - 4); ctx.moveTo(hx, hy + 4); ctx.lineTo(hx, hy + 9); ctx.stroke();
          ctx.fillStyle = rgba(C.text, 0.45 * hk);
          ctx.fillText('X ' + c.x + '   Z ' + c.z, hx + 16, hy + 26);
        }
        for (var p = 0; p < pins.length; p++) {
          var pin = pins[p], fadeK = Math.min(1, pin.t * 4) * Math.min(1, (6 - pin.t) / 1.2), ring = Math.min(1, pin.t / 0.8);
          ctx.strokeStyle = rgba(C.g, 0.6 * fadeK * (1 - ring) + 0.15 * fadeK); ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(pin.x, pin.y, 6 + ring * 34, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = rgba(C.g, 0.8 * fadeK);
          ctx.beginPath(); ctx.moveTo(pin.x, pin.y); ctx.lineTo(pin.x - 5, pin.y - 10); ctx.arc(pin.x, pin.y - 12, 5.5, Math.PI * 0.8, Math.PI * 0.2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgba(C.text, 0.5 * fadeK);
          ctx.fillText(pin.c.x + ', ' + pin.c.z, pin.x + 10, pin.y - 10);
        }
      }
    };
  }

  /* ======================= Recordings: replay timeline ======================= */
  function Timeline() {
    var PITCH = 6, BAR = 3, off = 0, ph = { x: 0, auto: 0 }, clips = [];
    var SPEED = 16; // px per second
    function barH(i) { var n = noise2(i * 0.045, 0.5) * 0.6 + noise2(i * 0.17, 3.7) * 0.4; return 0.18 + 0.82 * Math.pow(Math.abs(n) * 1.25, 1.1); }
    function marker(i) { var h = hash(i); return h > 0.965 ? 'final' : h > 0.95 ? 'bed' : h > 0.935 ? 'kill' : null; }
    function tc(sec) { sec = Math.max(0, Math.floor(sec)); var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
    return {
      resize: function () { if (!ph.x) ph.x = W * 0.3; },
      click: function (x) { clips.push({ x: x + off, t: 0 }); if (clips.length > 3) clips.shift(); },
      step: function (dt) {
        off += SPEED * dt;
        var idle = !mouse.on || performance.now() - mouse.moved > 2500;
        if (idle) { ph.auto += dt; ph.x += (W * 0.04 + 22) * dt; if (ph.x > W + 40) ph.x = -40; }
        else ph.x += (mouse.x - ph.x) * Math.min(1, dt * 9);
        for (var i = clips.length - 1; i >= 0; i--) { clips[i].t += dt; if (clips[i].t > 5) clips.splice(i, 1); }
      },
      draw: function () {
        ctx.clearRect(0, 0, W, H);
        var base = H, maxH = Math.min(240, H * 0.26);
        var i0 = Math.floor(off / PITCH), shift = off - i0 * PITCH;
        var px = ph.x;
        // waveform
        var fill = ctx.createLinearGradient(0, base - maxH, 0, base);
        fill.addColorStop(0, rgba(C.a, 0.02)); fill.addColorStop(1, rgba(C.a, 0.16));
        var hot = ctx.createLinearGradient(0, base - maxH * 1.4, 0, base);
        hot.addColorStop(0, rgba(C.a, 0.08)); hot.addColorStop(1, rgba(C.a, 0.5));
        var marks = [];
        for (var k = 0, x = -shift; x < W + PITCH; k++, x += PITCH) {
          var i = i0 + k, d = Math.abs(x - px), lift = d < 90 ? Math.cos(d / 90 * Math.PI / 2) : 0;
          var h = barH(i) * maxH * (1 + lift * 0.5);
          ctx.fillStyle = lift > 0.05 ? hot : fill;
          ctx.fillRect(x, base - h, BAR, h);
          var mk = marker(i); if (mk) marks.push({ x: x + BAR / 2, y: base - h - 12, k: mk, lift: lift });
        }
        // kill and bed markers above their bars
        for (var m = 0; m < marks.length; m++) {
          var mm = marks[m], a = 0.35 + mm.lift * 0.5;
          if (mm.k === 'bed') { ctx.fillStyle = rgba(C.g, a); ctx.save(); ctx.translate(mm.x, mm.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
          else if (mm.k === 'final') { ctx.fillStyle = rgba(C.bad, a); ctx.beginPath(); ctx.arc(mm.x, mm.y, 3.2, 0, Math.PI * 2); ctx.fill(); }
          else { ctx.strokeStyle = rgba(C.text, a * 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(mm.x, mm.y, 2.6, 0, Math.PI * 2); ctx.stroke(); }
        }
        // clips marked by clicking: brackets around a few seconds
        for (var c = 0; c < clips.length; c++) {
          var cl = clips[c], cx = cl.x - off, fk = Math.min(1, cl.t * 5) * Math.min(1, (5 - cl.t) / 1.5), w = 46 * Math.min(1, cl.t * 4);
          ctx.strokeStyle = rgba(C.b, 0.75 * fk); ctx.lineWidth = 2;
          var top = base - maxH * 1.25;
          ctx.beginPath();
          ctx.moveTo(cx - w + 7, top); ctx.lineTo(cx - w, top); ctx.lineTo(cx - w, base); ctx.lineTo(cx - w + 7, base);
          ctx.moveTo(cx + w - 7, top); ctx.lineTo(cx + w, top); ctx.lineTo(cx + w, base); ctx.lineTo(cx + w - 7, base);
          ctx.stroke();
          ctx.fillStyle = rgba(C.b, 0.08 * fk); ctx.fillRect(cx - w, top, w * 2, base - top);
        }
        // ruler ticks along the top of the waveform, every second
        ctx.fillStyle = rgba(C.text, 0.07);
        var secPx = PITCH * 2; // one bar = half a second
        var t0 = Math.floor(off / secPx);
        for (var s = 0, sx = t0 * secPx - off; sx < W; s++, sx += secPx) {
          var big = (t0 + s) % 10 === 0;
          ctx.fillRect(Math.round(sx), base - maxH - 26 - (big ? 6 : 0), 1, big ? 10 : 4);
        }
        // playhead
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, rgba(C.a, 0)); g.addColorStop(0.55, rgba(C.a, 0.10)); g.addColorStop(1, rgba(C.a, 0.55));
        ctx.fillStyle = g; ctx.fillRect(Math.round(px), 0, 1, H);
        ctx.fillStyle = rgba(C.a, 0.7);
        ctx.beginPath(); var ky = base - maxH - 34; ctx.moveTo(px - 5, ky - 6); ctx.lineTo(px + 5, ky - 6); ctx.lineTo(px, ky); ctx.closePath(); ctx.fill();
        ctx.font = '600 11px "JetBrains Mono", ui-monospace, Consolas, monospace';
        ctx.fillStyle = rgba(C.text, 0.5);
        ctx.fillText(tc((off + px) / secPx), px + 9, ky - 2);
      }
    };
  }

  var scene = kind === 'sparks' ? Sparks() : kind === 'contours' ? Contours() : kind === 'timeline' ? Timeline() : null;
  if (!scene) return;

  function draw(dt, t) { if (dt) scene.step(dt, t); scene.draw(t); }
  function frameSetup() { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  var origDraw = draw;
  draw = function (dt, t) { frameSetup(); origDraw(dt, t); };

  resize();
  addEventListener('resize', resize);
  if (reduce) { draw(0, 4); return; }

  var last = performance.now(), start = last, acc = 0;
  var MIN_DT = kind === 'contours' ? 1 / 32 : 0; // the map is redrawn about 30 times a second
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.1, (now - last) / 1000);
    if (document.hidden || getComputedStyle(cv).display === 'none') { last = now; return; }
    acc += dt; last = now;
    if (acc < MIN_DT) return;
    draw(acc, (now - start) / 1000); acc = 0;
  }
  requestAnimationFrame(loop);
})();
