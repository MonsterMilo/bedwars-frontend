/* North Pole (the December theme) on the Cosmetics Library, the Atlas, Prism Recordings
   the Replay Theater and the home page: snow falling over the page and a string of lights along the top.
   Only runs when the page's theme is North Pole. Card snow caps live in css/pages.css. */
(function () {
  var root = document.documentElement;
  if (root.getAttribute('data-theme') !== 'northpole' && !root.hasAttribute('data-np')) return;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lite = !!document.currentScript && document.currentScript.hasAttribute('data-lite');

  var css = document.createElement('style');
  css.textContent = [
    '.np-snowfall { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 3; pointer-events: none; }',
    '.np-garland { position: fixed; left: 0; right: 0; top: 0; height: 26px; z-index: 40; pointer-events: none; overflow: hidden; }',
    '.np-garland svg { position: absolute; left: 0; top: 0; width: 100%; height: 26px; }',
    '.np-garland i { position: absolute; width: 7px; height: 11px; margin-left: -3.5px; border-radius: 50% 50% 46% 46% / 40% 40% 60% 60%; background: var(--c); box-shadow: 0 0 8px 2px color-mix(in srgb, var(--c) 70%, transparent); animation: npTw 2.4s ease-in-out infinite; }',
    '.np-garland i::before { content: ""; position: absolute; left: 1.5px; top: -3px; width: 4px; height: 4px; border-radius: 1px; background: #2c3b2f; }',
    '@keyframes npTw { 0%, 100% { opacity: 1; filter: brightness(1.15); } 50% { opacity: .45; filter: brightness(.7); box-shadow: none; } }',
    '@media (prefers-reduced-motion: reduce) { .np-garland i { animation: none; } }'
  ].join('\n');
  document.head.appendChild(css);

  function start() {
    // ---- the string of lights ----
    var g = document.createElement('div');
    g.className = 'np-garland';
    g.setAttribute('aria-hidden', 'true');
    document.body.appendChild(g);
    var COLORS = ['#ff4d55', '#48d47e', '#ffd25e', '#5fb4ff'];
    function lights() {
      var w = window.innerWidth, span = w < 600 ? 46 : 60, n = Math.ceil(w / span) + 1;
      var d = 'M0 3';
      for (var k = 0; k < n; k++) d += ' Q' + (k * span + span / 2) + ' 17 ' + ((k + 1) * span) + ' 3';
      var html = '<svg viewBox="0 0 ' + w + ' 26" preserveAspectRatio="none"><path d="' + d + '" fill="none" stroke="#4a6b52" stroke-width="1.6"/></svg>';
      for (var j = 0; j < n; j++) {
        html += '<i style="left:' + (j * span + span / 2) + 'px;top:12px;--c:' + COLORS[j % 4] + ';animation-delay:' + (-Math.random() * 2.4).toFixed(2) + 's"></i>';
      }
      g.innerHTML = html;
    }
    lights();
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(lights, 150); });
    if (lite) return;

    // ---- snowfall ----
    var cv = document.createElement('canvas');
    cv.className = 'np-snowfall';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var cx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, flakes = [], wind = 0, windTo = 0;
    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var want = Math.round(Math.min(110, W * H / 14000));
      while (flakes.length < want) flakes.push(flake(true));
      flakes.length = want;
    }
    function flake(any) {
      var r = 0.7 + Math.pow(Math.random(), 2.2) * 2.4;
      return { x: Math.random() * W, y: any ? Math.random() * H : -6, r: r, v: 18 + r * 16 + Math.random() * 10, a: 0.45 + Math.random() * 0.5, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.2 };
    }
    function draw(dt) {
      cx.clearRect(0, 0, W, H);
      cx.fillStyle = '#fff';
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.p += dt * f.s;
        f.y += f.v * dt;
        f.x += (Math.sin(f.p) * 14 + wind * f.r * 6) * dt;
        if (f.y > H + 6) { flakes[i] = flake(false); continue; }
        if (f.x > W + 6) f.x = -6; else if (f.x < -6) f.x = W + 6;
        cx.globalAlpha = f.a;
        cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, 6.283); cx.fill();
      }
      cx.globalAlpha = 1;
    }
    size();
    window.addEventListener('resize', size);
    if (calm) { draw(0); return; }
    var last = performance.now();
    (function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (Math.random() < dt / 7) windTo = (Math.random() - 0.35) * 3;
      wind += (windTo - wind) * dt * 0.6;
      if (!document.hidden) draw(dt);
      requestAnimationFrame(frame);
    })(last);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
