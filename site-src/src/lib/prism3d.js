// The home page's light: a glass prism that really refracts a white beam into
// the site's colours, one beam per section card, over drifting dust that
// moves away from the pointer. Drag the prism to spin it. One canvas fixed
// behind the page; 1 world unit = 1 CSS pixel on the z = 0 plane, so the
// beams can land exactly on the cards.
//
// layout() is called every frame and returns, in viewport pixels:
//   { prism: { x, y, size }, source: { x, y }, targets: [{ x, y }], hot: [0..1], narrow }
// colors() returns the beam colours as CSS colours, one per target.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Any CSS colour -> THREE.Color (through a canvas, so var() results, names
// and rgb() all work).
const probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
export function cssColor(c, fallback = '#ffffff') {
  if (!probe) return new THREE.Color(fallback);
  probe.fillStyle = fallback;
  probe.fillStyle = c || fallback;
  return new THREE.Color(probe.fillStyle);
}

export function startPrism({ canvas, layout, colors, background, reduce, onReady, intro = false, onLand, backdrop = () => null }) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch { return null; }
  const DPR = Math.min(1.75, window.devicePixelRatio || 1);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const FOV = 22, camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000);

  // A dark studio of soft glowing panels for the glass to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = new THREE.Scene(); studio.background = new THREE.Color(0x010206);
  const soft = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, '#fff'); g.addColorStop(0.35, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  })();
  const strip = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), map: soft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); studio.add(m);
  };
  strip(6, 1.2, 0xffffff, 2.6, [0, 4, 2.5]);
  strip(1.6, 1.6, 0xffffff, 3.2, [-3, 3.2, 3.5]);   // key light, where the white beam comes from
  strip(0.5, 5, 0xffffff, 1.8, [3.2, 1.5, 3.5]);    // a thin strip for a sharp edge glint
  strip(5, 0.6, 0xa98bff, 1.2, [0, -3.5, -3]);       // cool violet bounce behind
  strip(0.9, 6, 0xffffff, 1.2, [4.5, 0, 1.5]);
  strip(1.2, 5, 0xbfeeff, 1.0, [-4.5, 0.5, 0.5]);
  strip(4, 1.2, 0xdccbff, 1.0, [0, -4, 1.5]);
  strip(3, 3, 0xffe6c2, 0.4, [2.5, 1, -4]);
  strip(2.4, 7, 0xcfe8ff, 0.8, [-3.5, 0, 5]);
  scene.environment = pmrem.fromScene(studio, 0.04).texture;

  // Background: the page colour with soft washes of the accents, the light
  // pooled round the prism and a faint glow that follows the pointer.
  const bgMat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) }, uPrism: { value: new THREE.Vector2() }, uT: { value: 0 }, uMouse: { value: new THREE.Vector2() }, uOn: { value: 0 },
      uBase: { value: new THREE.Color(0x06070b) }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() }, uLight: { value: 0 },
      uTex: { value: null }, uWin: { value: 0 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `uniform vec2 uRes, uPrism, uMouse; uniform float uT, uLight, uOn, uWin; uniform vec3 uBase, uA, uB, uC; uniform sampler2D uTex; varying vec2 vUv;
      float blob(vec2 p, vec2 c, float r){ float d = length(p - c) / r; return exp(-d * d); }
      void main(){
        vec2 p = vUv * uRes;
        if (uWin > 0.5) {
          // The Christmas night from the page backdrop, so the glass refracts the snow.
          vec3 w = texture2D(uTex, vUv).rgb;
          gl_FragColor = vec4(pow(w, vec3(2.2)) * 1.12, 1.0);
          return;
        }
        vec3 col = uBase;
        float k = mix(1.0, 0.45, uLight);
        col += vec3(0.07, 0.12, 0.24) * 0.55 * k * blob(p, uPrism, uRes.y * 0.7);
        vec2 lean = uMouse * uRes * 0.06 * uOn;
        col += uA * 0.08 * k * blob(p, vec2(uRes.x * (0.62 + 0.03 * sin(uT * 0.07)), uRes.y * 0.78) + lean, uRes.y * 0.55);
        col += uB * 0.09 * k * blob(p, vec2(uRes.x * (0.82 + 0.03 * cos(uT * 0.05)), uRes.y * 0.35) + lean * 0.7, uRes.y * 0.6);
        col += uC * 0.05 * k * blob(p, vec2(uRes.x * (0.2 + 0.03 * sin(uT * 0.04)), uRes.y * 0.1) + lean * 1.3, uRes.y * 0.5);
        vec2 m = (uMouse * 0.5 + 0.5) * uRes;
        vec3 tint = mix(mix(uC, uA, smoothstep(0.1, 0.6, vUv.x)), uB, smoothstep(0.55, 0.95, vUv.x));
        float ring = exp(-pow((length(p - m) - uRes.y * 0.16 - 6.0 * sin(uT * 1.3)) / (uRes.y * 0.05), 2.0));
        col += (tint * 0.2 * blob(p, m, uRes.y * 0.3) + vec3(0.6, 0.7, 1.0) * 0.05 * blob(p, m, uRes.y * 0.09) + tint * 0.05 * ring) * k * uOn;
        float v = smoothstep(1.25, 0.25, length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
        col *= mix(mix(0.55, 0.96, uLight), 1.0, v);
        gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
      }`
  });
  const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat); bgQuad.frustumCulled = false; bgQuad.renderOrder = -10; scene.add(bgQuad);

  // Dust: slow drift, parallax, pushed aside and lit near the pointer.
  const DUST = 900, dpos = new Float32Array(DUST * 3), dseed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { dpos[i * 3] = (Math.random() - 0.5) * 2; dpos[i * 3 + 1] = (Math.random() - 0.5) * 2; dpos[i * 3 + 2] = -Math.random() * 1600 + 150; dseed[i] = Math.random(); }
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dgeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uSpan: { value: new THREE.Vector2(1, 1) }, uPtr: { value: new THREE.Vector2(-1e5, -1e5) }, uPar: { value: new THREE.Vector2() }, uPx: { value: DPR }, uCamZ: { value: 1000 }, uTint: { value: new THREE.Color(0.75, 0.85, 1.0) } },
    vertexShader: `attribute float aSeed; uniform float uT, uPx, uCamZ; uniform vec2 uSpan, uPtr, uPar; varying float vA;
      void main(){
        vec3 p = position; float depth = (uCamZ - p.z) / uCamZ;
        p.xy *= uSpan * depth * 0.62;
        p.x += sin(uT * 0.04 + aSeed * 40.0) * 30.0 + uT * (4.0 + aSeed * 6.0);
        p.x = mod(p.x + uSpan.x * depth * 0.62, uSpan.x * depth * 1.24) - uSpan.x * depth * 0.62;
        p.y += cos(uT * 0.05 + aSeed * 23.0) * 22.0;
        p.xy += uPar * (1.0 - 1.0 / depth) * 40.0;
        vec2 proj = p.xy / depth; vec2 d = proj - uPtr; float near = exp(-dot(d, d) / 24000.0);
        p.xy += normalize(d + 0.001) * near * 52.0 * depth;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.0 + aSeed * 1.6) * uPx * (1.0 + near * 1.5) * clamp(uCamZ / -mv.z, 0.6, 1.6);
        float tw = 0.65 + 0.35 * sin(uT * (0.6 + aSeed * 1.4) + aSeed * 60.0);
        vA = (0.12 + 0.24 * fract(aSeed * 7.31)) * tw + near * 0.95;
      }`,
    fragmentShader: 'uniform vec3 uTint; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard; gl_FragColor = vec4(uTint * vA * smoothstep(0.5, 0.0, r), 1.0); }'
  });
  const dust = new THREE.Points(dgeo, dustMat); dust.frustumCulled = false; scene.add(dust);

  // Beams: a hot core and a soft halo, with pulses running along them.
  // A beam from uA to uB. With uCurve on it leaves along its fan direction and
  // eases nearly level into the card, a soft S instead of a sharp diagonal.
  const beamVS = `uniform vec2 uA, uB; uniform float uW0, uW1, uGrow, uCurve; varying vec2 vUv; varying float vW, vLen;
    void main(){ vUv = uv; vec2 d = uB - uA; float L = max(length(d), 0.001);
      vec2 out0 = normalize(vec2(d.x, d.y * 0.8)), in1 = normalize(vec2(d.x, d.y * 0.25));
      vec2 p1 = mix(uA + d / 3.0, uA + out0 * L * 0.38, uCurve), p2 = mix(uB - d / 3.0, uB - in1 * L * 0.4, uCurve);
      float a = uv.x * uGrow, b = 1.0 - a; vW = mix(uW0, uW1, a); vLen = L * (1.0 + 0.08 * uCurve);
      vec2 c = b * b * b * uA + 3.0 * b * b * a * p1 + 3.0 * b * a * a * p2 + a * a * a * uB;
      vec2 tg = 3.0 * b * b * (p1 - uA) + 6.0 * b * a * (p2 - p1) + 3.0 * a * a * (uB - p2);
      vec2 dir = normalize(tg + d * 0.0001); vec2 n = vec2(-dir.y, dir.x);
      vec2 p = c + n * (uv.y - 0.5) * vW;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 0.0, 1.0); }`;
  const beamFS = `uniform vec3 uColor; uniform float uI, uT, uCore, uSpeed, uFade; varying vec2 vUv; varying float vW, vLen;
    void main(){ float dpx = abs(vUv.y - 0.5) * vW;
      float core = exp(-pow(dpx / uCore, 2.0));
      float halo = exp(-pow(dpx / (vW * 0.28), 2.0));
      float s = vUv.x * vLen;
      float pulse = pow(max(0.0, sin(s * 0.018 - uT * uSpeed)), 30.0);
      float fade = mix(1.0, smoothstep(0.0, 0.06, vUv.x), uFade);
      vec3 hot = mix(uColor, vec3(1.0), 0.3);
      vec3 c = uColor * halo * 0.16 * uI + hot * core * (0.75 + pulse * 1.4) * uI;
      gl_FragColor = vec4(c * fade, 1.0); }`;
  function makeBeam(color, fadeStart, order = 5) {
    const m = new THREE.ShaderMaterial({
      vertexShader: beamVS, fragmentShader: beamFS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uW0: { value: 6 }, uW1: { value: 30 }, uGrow: { value: 0 }, uColor: { value: color.clone() }, uI: { value: 1 }, uT: { value: 0 }, uCore: { value: 1.4 }, uSpeed: { value: 3 }, uFade: { value: fadeStart ? 1 : 0 }, uCurve: { value: 0 } }
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 48, 1), m); mesh.frustumCulled = false; mesh.renderOrder = order; scene.add(mesh);
    return m;
  }
  const spotMat = color => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color.clone() }, uI: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uI; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float g = exp(-d * d * 9.0) * 0.35 + exp(-d * d * 80.0) * 0.8; gl_FragColor = vec4(uColor * g * uI, 1.0); }'
  });
  const mkSpot = color => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spotMat(color)); m.frustumCulled = false; m.renderOrder = 7; scene.add(m); return m; };

  // White light hits the left face, splits into a fan inside the glass, and
  // each colour leaves the right face on its way to its card.
  const inBeam = makeBeam(new THREE.Color(1, 1, 1), false);
  const entrySpot = mkSpot(new THREE.Color(1, 1, 1));
  let outBeams = [], landSpots = [], innerBeams = [], exitSpots = [];
  function setColors() {
    const list = colors();
    while (outBeams.length < list.length) { outBeams.push(makeBeam(new THREE.Color(), true)); landSpots.push(mkSpot(new THREE.Color())); innerBeams.push(makeBeam(new THREE.Color(), false, 6)); exitSpots.push(mkSpot(new THREE.Color())); }
    list.forEach((c, i) => { const col = cssColor(c); [outBeams[i].uniforms, landSpots[i].material.uniforms, innerBeams[i].uniforms, exitSpots[i].material.uniforms].forEach(u => u.uColor.value.copy(col)); });
    const bg = background();
    bgMat.uniforms.uBase.value.copy(cssColor(bg.base, '#06070b'));
    bgMat.uniforms.uA.value.copy(cssColor(list[0]));
    bgMat.uniforms.uB.value.copy(cssColor(list[1] || list[0]));
    bgMat.uniforms.uC.value.copy(cssColor(list[2] || list[0]));
    bgMat.uniforms.uLight.value = bg.light ? 1 : 0;
    dustMat.uniforms.uTint.value.set(...(bg.light ? [0.18, 0.22, 0.34] : [0.75, 0.85, 1.0]));
    dustMat.blending = bg.light ? THREE.NormalBlending : THREE.AdditiveBlending;
    dustMat.needsUpdate = true;
  }
  setColors();

  // The prism: rounded, bevelled glass with real refraction and dispersion.
  const R = 1, rc = 0.075, shape = new THREE.Shape();
  const corners = [0, 1, 2].map(k => { const a = Math.PI / 2 + k * Math.PI * 2 / 3; return new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R); });
  corners.forEach((c, i) => {
    const prev = corners[(i + 2) % 3], next = corners[(i + 1) % 3];
    const a = c.clone().add(prev.clone().sub(c).setLength(rc * 2.2)), b = c.clone().add(next.clone().sub(c).setLength(rc * 2.2));
    if (i === 0) shape.moveTo(a.x, a.y); else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(c.x, c.y, b.x, b.y);
  });
  shape.closePath();
  const depth = 0.9;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.04, bevelSegments: 8, curveSegments: 16 });
  geo.translate(0, -0.12, -depth / 2); geo.computeVertexNormals();
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 1.6, ior: 1.55, dispersion: 3.5,
    attenuationColor: new THREE.Color(0xb9dcff), attenuationDistance: 140,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, specularColor: new THREE.Color(0xffffff), envMapIntensity: 1.5,
    iridescence: 0.25, iridescenceIOR: 1.3, iridescenceThicknessRange: [250, 420]
  });
  const prism = new THREE.Mesh(geo, glass); prism.renderOrder = 3;
  // A faint fresnel rim so the edges always catch light, and a cool glow on
  // the triangle faces so the glass reads as a solid block.
  const rimMat = new THREE.ShaderMaterial({
    // Both sides, no depth test: the far edges show faintly through the glass, so it reads as a solid block.
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vN, vV, vP; varying float vFace; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; vFace = abs(normal.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uT; varying vec3 vN, vV, vP; varying float vFace; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
      float h = fract(vP.x * 0.3 + vP.y * 0.22 + uT * 0.04); vec3 c = mix(vec3(0.0, 0.85, 1.0), vec3(0.66, 0.33, 0.97), smoothstep(0.0, 0.5, h)); c = mix(c, vec3(1.0, 0.72, 0.3), smoothstep(0.5, 1.0, h));
      // The glass body: brighter toward the top where the light enters, with a slow caustic shimmer.
      float sh = 0.5 + 0.5 * sin(vP.x * 7.0 + vP.y * 5.0 + uT * 0.6) * sin(vP.y * 9.0 - uT * 0.45);
      vec3 body = vec3(0.55, 0.72, 1.0) * (0.02 + 0.05 * smoothstep(-0.9, 0.95, vP.y) + 0.018 * sh) * smoothstep(0.6, 1.0, vFace);
      c = mix(c, vec3(0.8, 0.88, 1.0), 0.6 * (1.0 - vFace));
      // A bright line along the bevels, so every edge reads crisp.
      float bevel = smoothstep(0.12, 0.4, vFace) * (1.0 - smoothstep(0.6, 0.92, vFace));
      vec3 L = normalize(vec3(-0.5, 0.75, 0.45));
      float lit = 0.35 + 0.65 * max(0.0, dot(normalize(vN), L));
      vec3 edge = vec3(0.85, 0.92, 1.0) * bevel * 0.32 * lit;
      if (!gl_FrontFacing) { gl_FragColor = vec4(edge * 0.5 + c * f * 0.06, 1.0); return; }
      // A soft polished sheen sweeping across the front face.
      float d = vP.x * 0.55 + vP.y * 0.85;
      float sheen = exp(-pow((d - 0.35 - 0.12 * sin(uT * 0.25)) / 0.16, 2.0)) * 0.05 + exp(-pow((d - 0.75) / 0.05, 2.0)) * 0.035;
      gl_FragColor = vec4(c * f * 0.34 + body + edge + vec3(0.9, 0.95, 1.0) * sheen * smoothstep(0.8, 1.0, vFace), 1.0); }`
  });
  const rim = new THREE.Mesh(geo, rimMat); rim.renderOrder = 4; prism.add(rim);
  const prismGroup = new THREE.Group(); prismGroup.add(prism); scene.add(prismGroup);
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(300, 500, 800); scene.add(key);

  // During Christmas the background is the page's winter backdrop canvas.
  let winTex = null, winW = 0, winH = 0;
  function winterFrame() {
    const cv = document.documentElement.dataset.season === 'christmas' ? backdrop() : null;
    // The snow replaces the drifting dust too.
    dust.visible = !cv || cv.hidden || !cv.width;
    if (dust.visible) { bgMat.uniforms.uWin.value = 0; return; }
    if (!winTex || cv.width !== winW || cv.height !== winH) {
      if (winTex) winTex.dispose();
      winTex = new THREE.CanvasTexture(cv);
      winTex.generateMipmaps = false; winTex.minFilter = THREE.LinearFilter; winTex.magFilter = THREE.LinearFilter;
      winW = cv.width; winH = cv.height;
      bgMat.uniforms.uTex.value = winTex;
    }
    winTex.needsUpdate = true;
    bgMat.uniforms.uWin.value = 1;
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.42);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let W = 0, H = 0, camZ = 1000;
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    renderer.setSize(W, H, false); composer.setSize(W, H);
    bloom.resolution.set(W * DPR * 0.5, H * DPR * 0.5);
    camZ = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.aspect = W / H; camera.position.set(W / 2, -H / 2, camZ); camera.near = camZ * 0.05; camera.far = camZ * 4; camera.updateProjectionMatrix();
    camera.lookAt(W / 2, -H / 2, 0);
    dustMat.uniforms.uSpan.value.set(W, H); dustMat.uniforms.uCamZ.value = camZ; dust.position.set(W / 2, -H / 2, 0);
    bgMat.uniforms.uRes.value.set(W, H);
  }

  const mouse = { x: 0, y: 0, tx: 0, ty: 0, px: -9999, py: -9999, on: 0, ton: 0 };
  const onMove = e => { mouse.tx = (e.clientX / innerWidth) * 2 - 1; mouse.ty = (e.clientY / innerHeight) * 2 - 1; mouse.px = e.clientX; mouse.py = e.clientY; mouse.ton = 1; };
  const onLeave = () => { mouse.ton = 0; mouse.px = mouse.py = -9999; };
  addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  // Drag to spin: press on the prism and drag; let go and it keeps turning,
  // then eases back to its slow sway either side of face-on.
  const SWAY = 0.34;
  const spin = { drag: false, id: null, lx: 0, ly: 0, vy: 0, vx: 0, tiltX: 0.18, L: null };
  const nearPrism = e => { const L = spin.L; if (!L) return false; return Math.hypot(e.clientX - L.prism.x, e.clientY - L.prism.y) < L.prism.size * 0.6; };
  const interactive = e => e.target.closest && e.target.closest('a, button, input, textarea, select, label, [role="listbox"], .panel, .psearch');
  const onDown = e => {
    if (e.button !== 0 || !nearPrism(e) || interactive(e)) return;
    spin.drag = true; spin.id = e.pointerId; spin.lx = e.clientX; spin.ly = e.clientY; spin.vy = 0; spin.vx = 0;
    document.body.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; e.preventDefault();
    wake();
  };
  const onDrag = e => {
    if (!spin.drag) { if (e.pointerType === 'mouse') document.body.style.cursor = nearPrism(e) && !interactive(e) ? 'grab' : ''; return; }
    if (e.pointerId !== spin.id) return;
    const dx = e.clientX - spin.lx, dy = e.clientY - spin.ly; spin.lx = e.clientX; spin.ly = e.clientY;
    prismGroup.rotation.y += dx * 0.01; spin.tiltX = Math.max(-1.2, Math.min(1.2, spin.tiltX + dy * 0.01));
    spin.vy = dx * 0.6; spin.vx = dy * 0.6;
    if (reduce()) wake();
  };
  const endDrag = e => { if (!spin.drag || (e && e.pointerId !== spin.id)) return; spin.drag = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
  addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onDrag, { passive: true });
  addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);

  // A point on the glass (prism-local, mid-depth) -> where it sits on the
  // z = 0 plane the beams are drawn in, seen from the camera.
  const gv = new THREE.Vector3();
  function onGlass(x, y) {
    gv.set(x * 1.04, (y + 0.12) * 1.04 - 0.12, 0).applyMatrix4(prism.matrixWorld);
    const c = camera.position, k = c.z / (c.z - gv.z);
    return new THREE.Vector2(c.x + (gv.x - c.x) * k, c.y + (gv.y - c.y) * k);
  }

  const t0 = performance.now();
  let shown = false, last = t0, raf = 0, introStart = t0, dead = false;
  const landAt = [];
  const ease = x => 1 - Math.pow(1 - x, 3);
  function frame(now) {
    raf = 0;
    if (dead) return;
    if (document.hidden) return;
    resize();
    const still = reduce();
    const L = layout();
    spin.L = L;
    mouse.x += (mouse.tx - mouse.x) * 0.08; mouse.y += (mouse.ty - mouse.y) * 0.08; mouse.on += (mouse.ton - mouse.on) * 0.04;
    const t = still ? 3 : (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
    const it = still ? 9 : (now - introStart) / 1000;
    // The first visit plays it slowly: the glass spins in, the light falls on
    // it, flashes, and each colour fires at its card in turn (onLand lights
    // the card). Later visits run the same steps quickly, all at once.
    const cl = x => Math.min(1, Math.max(0, x));
    const A = intro ? { pin: 1.1, grow0: 0.8, grow: 0.7, in0: 1.5, inD: 0.3, sp0: 1.8, spD: 0.45, gap: 0.25 } : { pin: 0, grow0: 0, grow: 0.7, in0: 0.55, inD: 0.35, sp0: 0.8, spD: 0.8, gap: 0 };
    const pin = A.pin ? ease(cl(it / A.pin)) : 1;
    const grow = cl((it - A.grow0) / A.grow);
    const flash = intro && it > A.in0 ? Math.exp(-(it - A.in0) * 4) : 0;
    bloom.strength = 0.55 + 0.9 * flash;
    const px = L.prism.x, py = -L.prism.y, S = L.prism.size;
    bgMat.uniforms.uT.value = t; bgMat.uniforms.uPrism.value.set(px, H - L.prism.y); bgMat.uniforms.uMouse.value.set(mouse.x, -mouse.y); bgMat.uniforms.uOn.value = mouse.on;
    dustMat.uniforms.uT.value = t; dustMat.uniforms.uPar.value.set(-mouse.x, mouse.y);
    dustMat.uniforms.uPtr.value.set(mouse.px - W / 2, -(mouse.py - H / 2));
    // Place the glass first, so the beams meet its faces however it has turned.
    prismGroup.position.set(px, py, 0); prismGroup.scale.setScalar(S * 0.5 * Math.max(0.001, pin)); prism.rotation.y = (1 - pin) * -4;
    if (!spin.drag) {
      prismGroup.rotation.y += dt * spin.vy; spin.vy *= Math.max(0, 1 - dt * 1.6);
      const free = Math.min(1, Math.abs(spin.vy) / 0.5);
      const home = Math.round(prismGroup.rotation.y / Math.PI) * Math.PI;
      const face = Math.atan2(W / 2 - px, camZ);
      const target = home + face + (still ? 0 : SWAY * Math.sin(t * 0.3));
      if (!shown) prismGroup.rotation.y = target;
      prismGroup.rotation.y += (target - prismGroup.rotation.y) * Math.min(1, dt * 1.2) * (1 - free);
      spin.tiltX += dt * spin.vx; spin.vx *= Math.max(0, 1 - dt * 3);
      spin.tiltX += (0.18 - spin.tiltX) * Math.min(1, dt * 0.8);
    }
    prismGroup.rotation.x = spin.tiltX + (still ? 0 : Math.sin(t * 0.45) * 0.05);
    prismGroup.updateMatrixWorld(true);
    const top = onGlass(0, 0.88), ca = onGlass(-0.866, -0.62), cb = onGlass(0.866, -0.62);
    const [inC, outC] = ca.x <= cb.x ? [ca, cb] : [cb, ca];
    const entry = top.clone().lerp(inC, 0.53);

    const inner = cl((it - A.in0) / A.inD);
    const iu = inBeam.uniforms;
    iu.uA.value.set(L.source.x, -L.source.y); iu.uB.value.copy(entry);
    iu.uGrow.value = ease(grow); iu.uW0.value = S * 0.06; iu.uW1.value = S * 0.045; iu.uCore.value = Math.max(1.3, S * 0.006); iu.uT.value = t; iu.uSpeed.value = 2.2;
    entrySpot.position.set(entry.x, entry.y, 0); const es = S * 0.42 * (1 + 0.05 * Math.sin(t * 2.2)); entrySpot.scale.set(es, es, 1);
    entrySpot.material.uniforms.uI.value = grow >= 1 ? 0.55 + 0.15 * Math.sin(t * 3.1) + flash * 1.6 : 0;

    // Colours leave the glass in the same order as their cards, so no two cross.
    const live = L.targets.map((tg, i) => i).filter(i => i < outBeams.length && L.targets[i]);
    live.sort((a, b) => (L.narrow ? L.targets[a].x - L.targets[b].x : L.targets[a].y - L.targets[b].y));
    const rank = []; live.forEach((i, r) => { rank[i] = r; });
    outBeams.forEach((b, i) => {
      const tg = L.targets[i], sp = landSpots[i], ib = innerBeams[i].uniforms, xs = exitSpots[i];
      if (!tg) { b.uniforms.uI.value = 0; sp.material.uniforms.uI.value = 0; ib.uI.value = 0; xs.material.uniforms.uI.value = 0; return; }
      const h = L.hot[i] || 0;
      const split = cl((it - A.sp0 - A.gap * rank[i]) / A.spD);
      if (split >= 1 && landAt[i] === undefined) { landAt[i] = it; if (onLand) onLand(i); }
      const land = landAt[i] !== undefined && intro ? Math.exp(-(it - landAt[i]) * 4) : 0;
      // Cards below (phones): out through the base. Cards to the side: out the far face.
      const f = live.length > 1 ? rank[i] / (live.length - 1) : 0.5;
      const exit = L.narrow ? inC.clone().lerp(outC, 0.3 + 0.45 * f) : top.clone().lerp(outC, 0.4 + 0.32 * f);
      ib.uA.value.copy(entry); ib.uB.value.copy(exit); ib.uGrow.value = ease(inner);
      ib.uW0.value = S * 0.025; ib.uW1.value = S * 0.05; ib.uCore.value = Math.max(1, S * 0.004) * (1 + h * 0.5);
      ib.uI.value = 0.6 + h * 0.5; ib.uT.value = t; ib.uSpeed.value = 2.4;
      const u = b.uniforms;
      u.uA.value.copy(exit); u.uB.value.set(tg.x, -tg.y); u.uGrow.value = ease(split); u.uCurve.value = L.narrow ? 0 : 1;
      u.uW0.value = S * 0.03; u.uW1.value = (L.narrow ? 18 : S * 0.13) * (1 + h * 0.5); u.uCore.value = Math.max(1.2, S * 0.0045) * (1 + h * 0.7);
      u.uI.value = 0.75 + h * 0.75; u.uT.value = t; u.uSpeed.value = 2.6 + h * 2.5;
      xs.position.set(exit.x, exit.y, 0); const xz = S * 0.2 * (1 + h * 0.4); xs.scale.set(xz, xz, 1); xs.material.uniforms.uI.value = inner >= 1 ? 0.6 + h * 0.4 : 0;
      sp.position.set(tg.x, -tg.y, 0); const sz = (L.narrow ? 70 : S * 0.42) * (1 + h * 0.6 + land * 0.9); sp.scale.set(sz, sz, 1); sp.material.uniforms.uI.value = split >= 1 ? 0.4 + h * 0.5 + land * 1.4 : 0;
    });
    rimMat.uniforms.uT.value = t;
    winterFrame();
    composer.render();
    if (!shown) { shown = true; introStart = performance.now(); canvas.classList.add('on'); if (onReady) onReady(); }
    const moving = spin.drag || Math.abs(spin.vy) > 0.02;
    if (!still || moving) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && !dead) raf = requestAnimationFrame(frame); }
  const onVis = () => { if (!document.hidden) wake(); };
  const onScroll = () => { if (reduce()) wake(); };
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', wake);
  addEventListener('scroll', onScroll, { passive: true });
  wake();

  return {
    wake,
    recolor() { setColors(); wake(); },
    stop() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave);
      removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onDrag);
      removeEventListener('pointerup', endDrag); removeEventListener('pointercancel', endDrag);
      document.removeEventListener('visibilitychange', onVis); removeEventListener('resize', wake); removeEventListener('scroll', onScroll);
      if (winTex) winTex.dispose();
      renderer.dispose();
    }
  };
}
