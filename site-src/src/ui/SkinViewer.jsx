// Drag-to-rotate 3D skin. three.js is only downloaded when this shows, and
// a flat render stands in while it loads (or if WebGL isn't available).
import { useEffect, useRef, useState } from 'preact/hooks';
import { prefs } from '../lib/prefs.js';

const skinUrl = id => `https://mc-heads.net/skin/${encodeURIComponent(id)}`;

export function SkinViewer({ id, slim = false, width = 220, height = 300, label = 'Skin' }) {
  const canvas = useRef(null);
  const viewer = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | flat
  const [walking, setWalking] = useState(prefs.value.motion !== 'reduce');

  useEffect(() => {
    let dead = false;
    const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
    if (!gl) { setState('flat'); return undefined; }
    import('skinview3d').then(sv => {
      if (dead || !canvas.current) return;
      const v = new sv.SkinViewer({ canvas: canvas.current, width, height, zoom: 0.86, fov: 50 });
      v.controls.enablePan = false;
      v.controls.enableZoom = false;
      v.autoRotate = false;
      v.camera.position.x = 18;
      v.camera.position.z = 42;
      v.globalLight.intensity = 3;
      v.cameraLight.intensity = 0.6;
      viewer.current = { v, sv };
      return v.loadSkin(skinUrl(id), { model: slim ? 'slim' : 'default' }).then(() => {
        if (dead) return;
        if (walking) v.animation = new sv.WalkingAnimation();
        if (v.animation) v.animation.speed = 0.6;
        setState('ready');
      });
    }).catch(() => { if (!dead) setState('flat'); });
    return () => {
      dead = true;
      if (viewer.current) { viewer.current.v.dispose(); viewer.current = null; }
    };
  }, []);

  useEffect(() => {
    const cur = viewer.current;
    if (!cur || state === 'flat') return;
    cur.v.loadSkin(skinUrl(id), { model: slim ? 'slim' : 'default' }).catch(() => {});
  }, [id, slim]);

  function toggleWalk() {
    const cur = viewer.current;
    const next = !walking;
    setWalking(next);
    if (cur) {
      cur.v.animation = next ? new cur.sv.WalkingAnimation() : null;
      if (cur.v.animation) cur.v.animation.speed = 0.6;
    }
  }

  return (
    <figure class={`skin ${state}`} style={{ width: `${width}px`, height: `${height}px` }}>
      {state !== 'ready' && <img class="skin-flat" src={`https://mc-heads.net/body/${encodeURIComponent(id)}/${Math.round(height * 0.7)}`} alt={label} />}
      {state !== 'flat' && <canvas ref={canvas} role="img" aria-label={`${label}, drag to turn`} />}
      {state === 'ready' && (
        <button type="button" class="btn icon ghost skin-walk" onClick={toggleWalk} aria-pressed={walking ? 'true' : 'false'} title={walking ? 'Stand still' : 'Walk'}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            {walking ? <path d="M9 6v12M15 6v12" /> : <path d="m8 5 11 7-11 7Z" />}
          </svg>
          <span class="sr-only">{walking ? 'Stand still' : 'Walk'}</span>
        </button>
      )}
    </figure>
  );
}
