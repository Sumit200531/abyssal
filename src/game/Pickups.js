import * as THREE from 'three';
import { CFG, glow, rand } from './config.js';

/** Plankton motes (XP) and rare repair kits, drawn with instancing and pulled in by the sub's magnet. */
export class Pickups {
  constructor(scene) {
    this.items = [];
    this.max = 400;
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, glow(CFG.colors.aqua, 3));
    scene.add(this.mesh);
    this.kitColor = glow(CFG.colors.sub, 3.5);
    this.xpColor = glow(CFG.colors.aqua, 3);
    this.t = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
  drop(x, z, xp, kitChance = 0) {
    for (let i = 0; i < xp; i++) {
      if (this.items.length >= this.max) break;
      const a = rand(0, 6.28), sp = rand(2, 5);
      this.items.push({ kind: 'xp', x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, ph: rand(0, 6), life: 22 });
    }
    if (Math.random() < kitChance) this.items.push({ kind: 'kit', x, z, vx: 0, vz: 0, ph: 0, life: 20 });
  }
  /** returns {xp, kits} collected this frame */
  update(dt, player, vacuum = false) {
    this.t += dt;
    const res = { xp: 0, kits: 0 };
    const mag = player.stats.magnet;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      const dx = player.x - p.x, dz = player.z - p.z, d = Math.hypot(dx, dz);
      if (vacuum) { p.vx += dx / (d || 1) * 60 * dt; p.vz += dz / (d || 1) * 60 * dt; p.life = Math.max(p.life, 5); }
      else if (d < mag) { const pull = (1 - d / mag) * 40 + 8; p.vx += dx / (d || 1) * pull * dt; p.vz += dz / (d || 1) * pull * dt; }
      p.vx *= Math.exp(-3 * dt); p.vz *= Math.exp(-3 * dt);
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (d < 1.2) { if (p.kind === 'xp') res.xp++; else res.kits++; this.items.splice(i, 1); continue; }
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
    }
    for (const p of this.items) {
      if (n >= this.max) break;
      const kit = p.kind === 'kit';
      const blink = p.life < 4 ? (Math.floor(p.life * 8) % 2 ? 0.3 : 1) : 1;
      const s = (kit ? 2.2 : 1) * (1 + Math.sin(this.t * 6 + p.ph) * 0.15) * blink;
      this._p.set(p.x, 0.9 + Math.sin(this.t * 3 + p.ph) * 0.2, p.z);
      this._q.setFromEuler(this._e.set(this.t * 2 + p.ph, this.t * 3, 0));
      this._s.set(s, s, s);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, kit ? this.kitColor : this.xpColor);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    return res;
  }
  lights(out, cx, cz) {
    for (const p of this.items) if (p.kind === 'kit') out.push({ x: p.x, z: p.z, r: 2, i: 1, c: CFG.colors.sub, d: (p.x - cx) ** 2 + (p.z - cz) ** 2 });
  }
}
