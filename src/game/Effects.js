import * as THREE from 'three';
import { CFG, rand } from './config.js';

/** One pooled additive particle system: bubbles, sparks, ink clouds, bursts. */
export class Effects {
  constructor(scene, quality) {
    this.max = quality === 'low' ? 1200 : 2600;
    const n = this.max;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.drag = new Float32Array(n); this.buoy = new Float32Array(n); this.base = new Float32Array(n); this.grow = new Float32Array(n);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.uPx = { value: 1 };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uPx: this.uPx },
      vertexShader: `attribute float aSize; attribute float aAlpha; uniform float uPx; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPx * (300.0 / max(1.0, -mv.z)); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q);
        float a = smoothstep(0.5, 0.0, d); float ring = smoothstep(0.5, 0.38, d) * smoothstep(0.25, 0.4, d);
        gl_FragColor = vec4(vC * (a + ring * 0.0) * vA, a * vA); }`
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, o = {}) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const sp = o.speed ?? 3;
    let vx, vy, vz;
    if (o.dir) { const s = o.spread ?? 1; vx = o.dir.x * sp + rand(-s, s); vy = (o.dir.y || 0) * sp + rand(-s, s) * 0.5; vz = o.dir.z * sp + rand(-s, s); }
    else { const u = rand(-1, 1), th = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u); vx = r * Math.cos(th) * sp; vy = u * sp * (o.flat ? 0.3 : 1); vz = r * Math.sin(th) * sp; }
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = o.color || CFG.colors.cyan, k = o.intensity ?? 1.6;
    this.col[i * 3] = c.r * k; this.col[i * 3 + 1] = c.g * k; this.col[i * 3 + 2] = c.b * k;
    this.life[i] = this.maxLife[i] = o.life ?? rand(0.4, 0.9);
    this.base[i] = o.size ?? rand(0.15, 0.35);
    this.drag[i] = o.drag ?? 2.5;
    this.buoy[i] = o.buoy ?? 0;
    this.grow[i] = o.grow ?? 0;
  }
  burst(x, y, z, n, o) { for (let k = 0; k < n; k++) this.emit(x, y, z, o); }
  bubbles(x, y, z, n, s = 1) { for (let k = 0; k < n; k++) this.emit(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3), { color: new THREE.Color(0.55, 0.9, 1), intensity: 0.7, speed: 0.8, life: rand(0.8, 1.6), size: rand(0.08, 0.18) * s, buoy: 3, drag: 1.5 }); }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr + this.buoy[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.05, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = t * t;
      this.size[i] = this.base[i] * (this.grow[i] ? 1 + (1 - t) * this.grow[i] : 0.4 + 0.6 * t);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.size.fill(0); }
}
