// Drag-to-rotate 3D skin, standing still. three.js is only downloaded when
// this shows, and a flat render stands in while it loads (or without WebGL).
// `id` is a UUID, name or texture hash; `model` is 'slim', 'default' or
// 'auto-detect' (read from the skin itself when the real model isn't known).
import { useEffect, useRef, useState } from 'preact/hooks';

const skinUrl = id => `https://mc-heads.net/skin/${encodeURIComponent(id)}`;

export function SkinViewer({ id, model = 'auto-detect', cape = null, width = 220, height = 300, label = 'Skin' }) {
  const canvas = useRef(null);
  const viewer = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | flat

  useEffect(() => {
    let dead = false;
    const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
    if (!gl) { setState('flat'); return undefined; }
    import('skinview3d').then(sv => {
      if (dead || !canvas.current) return undefined;
      const v = new sv.SkinViewer({ canvas: canvas.current, width, height, zoom: 0.86, fov: 50 });
      v.controls.enablePan = false;
      v.controls.enableZoom = false;
      v.autoRotate = false;
      v.animation = null;
      v.camera.position.x = 18;
      v.camera.position.z = 42;
      v.globalLight.intensity = 3;
      v.cameraLight.intensity = 0.6;
      viewer.current = v;
      return Promise.all([
        v.loadSkin(skinUrl(id), { model }),
        cape ? v.loadCape(cape).catch(() => {}) : null
      ]).then(() => { if (!dead) setState('ready'); });
    }).catch(() => { if (!dead) setState('flat'); });
    return () => {
      dead = true;
      if (viewer.current) { viewer.current.dispose(); viewer.current = null; }
    };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!v || state === 'flat') return;
    v.loadSkin(skinUrl(id), { model }).catch(() => {});
    if (cape) v.loadCape(cape).catch(() => {}); else v.loadCape(null);
  }, [id, model, cape]);

  return (
    <figure class={`skin ${state}`} style={{ width: `${width}px`, height: `${height}px` }}>
      {state !== 'ready' && <img class="skin-flat" src={`https://mc-heads.net/body/${encodeURIComponent(id)}/${Math.round(height * 0.7)}`} alt={label} />}
      {state !== 'flat' && <canvas ref={canvas} role="img" aria-label={`${label}, drag to turn`} />}
    </figure>
  );
}
