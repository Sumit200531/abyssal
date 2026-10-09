import * as THREE from 'three';
import { CFG, glow } from './config.js';

/** Instanced pools for the sub's light bolts and the creatures' spores. */
class Pool {
  constructor(scene, geo, max, color) {
    this.max = max;
    this.items = Array.from({ length: max }, () => ({ alive: false }));
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.color = color;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, color);
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }
  spawn(o) {
    const it = this.items.find(i => !i.alive);
    if (!it) return null;
    Object.assign(it, o, { alive: true });
    return it;
  }
  clear() { this.items.forEach(i => i.alive = false); this.mesh.count = 0; }
  sync(scaleFn) {
    let n = 0;
    for (const it of this.items) {
      if (!it.alive) continue;
      this._p.set(it.x, it.y ?? 1.1, it.z);
      this._q.setFromAxisAngle(this._up, -Math.atan2(it.vz, it.vx) - Math.PI / 2);
      scaleFn(it, this._s);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(n, this._m);
      if (it.color) this.mesh.setColorAt(n, it.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Projectiles {
  constructor(scene) {
    const boltGeo = new THREE.CapsuleGeometry(0.11, 0.9, 4, 8); boltGeo.rotateX(Math.PI / 2);
    this.bolts = new Pool(scene, boltGeo, 260, glow('#bdf9ff', 4));
    this.spores = new Pool(scene, new THREE.IcosahedronGeometry(0.32, 1), 160, glow(CFG.colors.amber, 3.2));
    this.time = 0;
  }
  clear() { this.bolts.clear(); this.spores.clear(); }

  fireBolt(x, z, dx, dz, s) {
    return this.bolts.spawn({ x, z, vx: dx * s.boltSpeed, vz: dz * s.boltSpeed, life: 1.25, dmg: s.damage, pierce: s.pierce, hit: new Set(), color: null });
  }
  fireSpore(x, z, dx, dz, speed, color) {
    return this.spores.spawn({ x, z, vx: dx * speed, vz: dz * speed, life: 5, r: 0.45, color: color || null, ph: Math.random() * 6 });
  }

  update(dt) {
    this.time += dt;
    const R = CFG.arenaR + 4;
    for (const b of this.bolts.items) {
      if (!b.alive) continue;
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (b.life <= 0 || b.x * b.x + b.z * b.z > R * R) b.alive = false;
    }
    for (const s of this.spores.items) {
      if (!s.alive) continue;
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      s.y = 1.1 + Math.sin(this.time * 6 + s.ph) * 0.12;
      if (s.life <= 0 || s.x * s.x + s.z * s.z > R * R) s.alive = false;
    }
    this.bolts.sync((it, s) => s.set(1, 1, 1));
    const t = this.time;
    this.spores.sync((it, s) => { const k = 1 + Math.sin(t * 14 + it.ph) * 0.18; s.set(k, k, k); });
  }
}
