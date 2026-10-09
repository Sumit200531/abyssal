import * as THREE from 'three';

export const CFG = {
  arenaR: 31,                   // playable radius of the trench floor
  fogColor: new THREE.Color('#031722'),
  fogDensity: 0.021,
  player: {
    speed: 9.5, hp: 5, fireRate: 5.5, damage: 1, boltSpeed: 34, pierce: 0, shots: 1, spread: 0.14,
    magnet: 5.5, dashCd: 1.6, sonarCd: 9, sonarR: 9, radius: 0.85, invuln: 1.1
  },
  waveBreak: 3.2,
  colors: {
    cyan: new THREE.Color('#3df2ff'),
    aqua: new THREE.Color('#5bffb0'),
    amber: new THREE.Color('#ffb347'),
    violet: new THREE.Color('#b37bff'),
    coral: new THREE.Color('#ff5470'),
    sub: new THREE.Color('#ffb23a'),
    white: new THREE.Color('#ffffff')
  }
};

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const glow = (c, k) => new THREE.Color(c).multiplyScalar(k);
export const angleLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export const fogUniforms = {
  uFogColor: { value: CFG.fogColor.clone() },
  uFogDensity: { value: CFG.fogDensity }
};
export const FOG_GLSL = /* glsl */`
  uniform vec3 uFogColor; uniform float uFogDensity;
  vec3 applyFog(vec3 col, float depth) {
    float f = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
    return mix(col, uFogColor, clamp(f, 0.0, 1.0));
  }`;

let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}
