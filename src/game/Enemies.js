import * as THREE from 'three';
import { CFG, clamp, damp, rand, glow, glowTexture, angleLerp } from './config.js';

const C = CFG.colors;
export const TYPES = {
  jelly:  { hp: 3,  r: 1.0,  speed: 2.6, score: 100, xp: 1, color: C.violet, light: 1.0 },
  darter: { hp: 2,  r: 0.8,  speed: 6.5, score: 150, xp: 2, color: C.amber,  light: 0.8 },
  eel:    { hp: 1,  r: 0.55, speed: 7.2, score: 60,  xp: 1, color: C.aqua,   light: 0.6 },
  angler: { hp: 12, r: 1.55, speed: 2.8, score: 400, xp: 5, color: C.amber,  light: 1.3 },
  boss:   { hp: 160, r: 1.9, speed: 10,  score: 5000, xp: 30, color: C.coral, light: 2.0 }
};

/** All creatures: prefabs, pooling, AI, spawn telegraphs. */
export class Enemies {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.pool = { jelly: [], darter: [], eel: [], angler: [] };
    this.markers = [];
    this.boss = null;
    this.time = 0;
    this.tex = glowTexture();
    this.g = {
      bell: new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
      tent: (() => { const g = new THREE.CylinderGeometry(0.035, 0.01, 1.7, 4); g.translate(0, -0.85, 0); return g; })(),
      core: new THREE.SphereGeometry(0.28, 12, 8),
      darter: (() => { const g = new THREE.ConeGeometry(0.42, 1.9, 10); g.rotateX(-Math.PI / 2); return g; })(),
      stripe: new THREE.BoxGeometry(0.05, 0.05, 1.3),
      fin: new THREE.BoxGeometry(0.05, 0.6, 0.45),
      eye: new THREE.SphereGeometry(0.1, 8, 6),
      eel: (() => { const g = new THREE.CapsuleGeometry(0.18, 1.1, 4, 10); g.rotateX(Math.PI / 2); return g; })(),
      angler: new THREE.IcosahedronGeometry(1.3, 1),
      tooth: new THREE.ConeGeometry(0.07, 0.3, 5),
      bulb: new THREE.SphereGeometry(0.2, 12, 8),
      line: (() => { const g = new THREE.PlaneGeometry(0.7, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); return g; })(),
      ring: new THREE.RingGeometry(0.85, 1, 48)
    };
    this.m = {
      eye: new THREE.MeshBasicMaterial({ color: glow('#ffffff', 3) }),
      amber: new THREE.MeshBasicMaterial({ color: glow(C.amber, 3.2) }),
      aqua: new THREE.MeshBasicMaterial({ color: glow(C.aqua, 3) }),
      coral: new THREE.MeshBasicMaterial({ color: glow(C.coral, 3.2) }),
      violetCore: new THREE.MeshBasicMaterial({ color: glow('#d9b8ff', 3.5) }),
      tent: new THREE.MeshBasicMaterial({ color: glow(C.violet, 1.6), transparent: true, opacity: 0.8 }),
      tooth: new THREE.MeshBasicMaterial({ color: glow('#d8f3ff', 1.4) }),
      line: new THREE.MeshBasicMaterial({ color: glow(C.amber, 2.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      marker: new THREE.MeshBasicMaterial({ color: glow(C.coral, 2.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    };
  }

  sprite(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: glow(color, 0.9), blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1);
    return s;
  }

  /* ---------------------------------------------------------- prefabs */
  build(type) {
    const g = this.g, m = this.m;
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const e = { type, root, body, extra: {} };
    if (type === 'jelly') {
      e.mat = new THREE.MeshStandardMaterial({ color: '#6a3fc4', emissive: C.violet, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide });
      const bell = new THREE.Mesh(g.bell, e.mat); bell.scale.set(1, 0.85, 1); body.add(bell); e.extra.bell = bell;
      body.add(new THREE.Mesh(g.core, m.violetCore));
      body.add(this.sprite(C.violet, 3.6));
      e.extra.tents = [];
      for (let i = 0; i < 8; i++) { const t = new THREE.Mesh(g.tent, m.tent); const a = (i / 8) * Math.PI * 2; t.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6); body.add(t); e.extra.tents.push(t); }
    } else if (type === 'darter') {
      e.mat = new THREE.MeshStandardMaterial({ color: '#173039', emissive: C.amber, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.3 });
      body.add(new THREE.Mesh(g.darter, e.mat));
      [-1, 1].forEach(s => { const st = new THREE.Mesh(g.stripe, m.amber); st.position.set(s * 0.26, 0.05, 0.1); body.add(st); const ey = new THREE.Mesh(g.eye, m.eye); ey.position.set(s * 0.18, 0.12, -0.55); body.add(ey); });
      const fin = new THREE.Mesh(g.fin, e.mat); fin.position.set(0, 0.2, 0.9); body.add(fin);
      body.add(this.sprite(C.amber, 2.4));
      const line = new THREE.Mesh(g.line, m.line.clone()); line.position.y = 0.08; root.add(line); e.extra.line = line;
    } else if (type === 'eel') {
      e.mat = new THREE.MeshStandardMaterial({ color: '#0b2a22', emissive: C.aqua, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.3 });
      body.add(new THREE.Mesh(g.eel, e.mat));
      const ey = new THREE.Mesh(g.eye, m.eye); ey.position.set(0, 0.08, -0.7); ey.scale.setScalar(0.8); body.add(ey);
      body.add(this.sprite(C.aqua, 1.8));
    } else if (type === 'angler') {
      e.mat = new THREE.MeshStandardMaterial({ color: '#16262c', emissive: '#2a1a08', emissiveIntensity: 0.6, roughness: 0.55, metalness: 0.3, flatShading: true });
      const b = new THREE.Mesh(g.angler, e.mat); b.scale.set(1.1, 0.85, 1.2); body.add(b);
      for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(g.tooth, m.tooth); const a = -0.9 + (i / 8) * 1.8; t.position.set(Math.sin(a) * 0.95, -0.25, -Math.cos(a) * 1.15); t.rotation.x = Math.PI; body.add(t); }
      [-1, 1].forEach(s => { const ey = new THREE.Mesh(g.eye, m.amber); ey.scale.setScalar(1.4); ey.position.set(s * 0.55, 0.35, -1.05); body.add(ey); });
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.9, -0.4), new THREE.Vector3(0, 2.6, -0.8), new THREE.Vector3(0, 1.9, -2.1));
      body.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.04, 5), e.mat));
      const bulb = new THREE.Mesh(g.bulb, m.amber); bulb.position.set(0, 1.85, -2.15); body.add(bulb);
      const ls = this.sprite(C.amber, 4); ls.position.copy(bulb.position); body.add(ls);
      e.extra.lure = [bulb, ls];
    }
    this.scene.add(root);
    return e;
  }

  get(type) {
    let e = this.pool[type].find(p => !p.alive);
    if (!e) { e = this.build(type); this.pool[type].push(e); }
    return e;
  }

  spawn(type, x, z, wave) {
    const T = TYPES[type];
    const e = this.get(type);
    const hpScale = 1 + (wave - 1) * 0.13;
    Object.assign(e, {
      alive: true, x, z, vx: 0, vz: 0, r: T.r, hp: Math.ceil(T.hp * hpScale), speed: T.speed * (1 + Math.min(0.35, (wave - 1) * 0.025)),
      score: T.score, xp: T.xp, color: T.color, light: T.light, state: 'cruise', t: rand(1.2, 2.4), ang: Math.atan2(-z, -x),
      flash: 0, stun: 0, ph: rand(0, 6.28), shootT: rand(1.5, 2.6), born: 0, wave
    });
    e.maxHp = e.hp;
    e.root.visible = true;
    e.root.position.set(x, 0, z);
    if (e.extra.line) e.extra.line.material.opacity = 0;
    this.list.push(e);
    return e;
  }

  /** red ring on the floor that becomes a creature after a short delay */
  telegraph(type, x, z, wave, delay = 0.9) {
    let mk = this.markers.find(k => !k.active);
    if (!mk) { mk = { mesh: new THREE.Mesh(this.g.ring, this.m.marker.clone()) }; mk.mesh.rotation.x = -Math.PI / 2; this.scene.add(mk.mesh); this.markers.push(mk); }
    Object.assign(mk, { active: true, type, x, z, wave, t: delay, d: delay });
    mk.mesh.visible = true; mk.mesh.position.set(x, 0.07, z);
    return mk;
  }

  pending() { return this.markers.filter(m => m.active).length; }
  pendingCount() { return this.markers.reduce((a, m) => a + (m.active ? (m.type === 'eel' ? 6 : 1) : 0), 0); }

  kill(e) {
    e.alive = false; e.root.visible = false;
    const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1);
  }

  clear() {
    [...this.list].forEach(e => { if (e.type === 'boss') this.removeBoss(); else this.kill(e); });
    this.list.length = 0;
    this.markers.forEach(m => { m.active = false; m.mesh.visible = false; });
    this.removeBoss();
  }

  /* ------------------------------------------------------------- boss */
  spawnBoss(x, z, n) {
    const mat = new THREE.MeshStandardMaterial({ color: '#241020', emissive: '#7a1830', emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.55 });
    const head = new THREE.Group(), hb = new THREE.Group(); head.add(hb);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), mat); skull.scale.set(1, 0.75, 1.25); hb.add(skull);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 12).rotateX(-Math.PI / 2), mat); snout.position.z = -1.9; hb.add(snout);
    [-1, 1].forEach(s => {
      const ey = new THREE.Mesh(this.g.eye, this.m.coral); ey.scale.setScalar(2.4); ey.position.set(s * 0.9, 0.45, -1.4); hb.add(ey);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 6), mat); horn.position.set(s * 0.8, 0.9, 0.4); horn.rotation.x = 0.7; horn.rotation.z = -s * 0.4; hb.add(horn);
    });
    hb.add(this.sprite(C.coral, 5));
    this.scene.add(head);
    const segs = [];
    const N = 16;
    const spotM = [this.m.coral, this.m.aqua];
    for (let i = 0; i < N; i++) {
      const rad = 1.45 - (i / N) * 0.95;
      const s = new THREE.Group();
      const sm = new THREE.Mesh(new THREE.SphereGeometry(rad, 14, 10), mat); s.add(sm);
      const spot = new THREE.Mesh(this.g.eye, spotM[i % 2]); spot.scale.setScalar(rad * 2.2); spot.position.y = rad * 0.8; s.add(spot);
      if (i % 4 === 0) { const sp = this.sprite(i % 2 ? C.aqua : C.coral, rad * 2.6); s.add(sp); }
      s.position.set(x, 1.4, z + (i + 1) * 1.4);
      this.scene.add(s);
      segs.push({ obj: s, x, z: z + (i + 1) * 1.4, r: rad });
    }
    const hp = TYPES.boss.hp + (n - 1) * 130;
    const b = {
      type: 'boss', alive: true, root: head, body: hb, mat, segs, x, z, vx: 0, vz: 0, r: TYPES.boss.r, hp, maxHp: hp,
      heading: Math.atan2(-z, -x), state: 'circle', t: 4.5, spitT: 3.5, orbit: Math.atan2(z, x), speed: 10, flash: 0, stun: 0,
      score: TYPES.boss.score * n, xp: TYPES.boss.xp, color: C.coral, light: 2.2, n
    };
    head.position.set(x, 1.4, z);
    this.boss = b;
    this.list.push(b);
    return b;
  }
  removeBoss() {
    const b = this.boss; if (!b) return;
    this.scene.remove(b.root); b.segs.forEach(s => this.scene.remove(s.obj));
    b.alive = false;
    const i = this.list.indexOf(b); if (i >= 0) this.list.splice(i, 1);
    this.boss = null;
  }

  /* ----------------------------------------------------------- update */
  /**
   * @param api { spawnSpore(x,z,dx,dz,speed,color), roar() }
   */
  update(dt, player, api) {
    this.time += dt;
    const t = this.time;

    // telegraphs
    for (const mk of this.markers) {
      if (!mk.active) continue;
      mk.t -= dt;
      const k = 1 - mk.t / mk.d;
      const s = (mk.type === 'angler' ? 2.4 : mk.type === 'eel' ? 1.8 : 1.5) * (0.4 + k * 0.8);
      mk.mesh.scale.set(s, s, s);
      mk.mesh.material.opacity = Math.min(1, k * 2) * (0.6 + 0.4 * Math.sin(t * 25));
      if (mk.t <= 0) {
        mk.active = false; mk.mesh.visible = false;
        if (mk.type === 'eel') { for (let i = 0; i < 6; i++) { const e = this.spawn('eel', mk.x + rand(-1.2, 1.2), mk.z + rand(-1.2, 1.2), mk.wave); api.spawned(e); } }
        else api.spawned(this.spawn(mk.type, mk.x, mk.z, mk.wave));
      }
    }

    const px = player.x, pz = player.z;
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = px - e.x, dz = pz - e.z, dist = Math.hypot(dx, dz) || 0.001, nx = dx / dist, nz = dz / dist;
      const stunK = e.stun > 0 ? 0.12 : 1;
      e.stun = Math.max(0, e.stun - dt);
      e.flash = Math.max(0, e.flash - dt * 5);

      if (e.type === 'jelly') {
        const pulse = 0.35 + 1.1 * Math.max(0, Math.sin(t * 2.6 + e.ph));
        e.vx = damp(e.vx, nx * e.speed * pulse * stunK, 2.5, dt);
        e.vz = damp(e.vz, nz * e.speed * pulse * stunK, 2.5, dt);
        const sq = 1 + Math.sin(t * 2.6 + e.ph) * 0.12;
        e.extra.bell.scale.set(sq, 0.85 / sq, sq);
        e.extra.tents.forEach((tn, i) => { tn.rotation.x = Math.sin(t * 3 + i + e.ph) * 0.35; tn.rotation.z = Math.cos(t * 2.4 + i * 1.3) * 0.35; });
        e.body.position.y = 1.7 + Math.sin(t * 1.3 + e.ph) * 0.25;
      } else if (e.type === 'eel') {
        const wig = Math.sin(t * 7 + e.ph) * 0.9;
        const tx = nx * e.speed + -nz * wig * 3, tz = nz * e.speed + nx * wig * 3;
        e.vx = damp(e.vx, tx * stunK, 4, dt); e.vz = damp(e.vz, tz * stunK, 4, dt);
        e.body.position.y = 1.0 + Math.sin(t * 3 + e.ph) * 0.15;
        e.body.rotation.y = Math.sin(t * 9 + e.ph) * 0.35;
      } else if (e.type === 'darter') {
        e.t -= dt * (e.stun > 0 ? 0.3 : 1);
        const line = e.extra.line;
        if (e.state === 'cruise') {
          const want = dist > 10 ? 1 : -0.4, side = Math.sin(e.ph) > 0 ? 1 : -1;
          e.vx = damp(e.vx, (nx * want + -nz * side * 0.8) * e.speed * stunK, 3, dt);
          e.vz = damp(e.vz, (nz * want + nx * side * 0.8) * e.speed * stunK, 3, dt);
          if (e.t <= 0 && dist < 18) { e.state = 'windup'; e.t = 0.75; e.dirX = nx; e.dirZ = nz; }
        } else if (e.state === 'windup') {
          e.vx = damp(e.vx, 0, 8, dt); e.vz = damp(e.vz, 0, 8, dt);
          if (e.t > 0.2) { e.dirX = nx; e.dirZ = nz; }
          line.material.opacity = (1 - e.t / 0.75) * 0.75;
          line.scale.set(1, 1, 16);
          e.body.position.x = Math.sin(t * 60) * 0.06;
          if (e.t <= 0) { e.state = 'dash'; e.t = 0.6; api.dashSound && api.dashSound(); }
        } else if (e.state === 'dash') {
          line.material.opacity = 0; e.body.position.x = 0;
          e.vx = e.dirX * 25 * stunK; e.vz = e.dirZ * 25 * stunK;
          if (e.t <= 0) { e.state = 'recover'; e.t = 0.8; }
        } else {
          e.vx = damp(e.vx, 0, 3, dt); e.vz = damp(e.vz, 0, 3, dt);
          if (e.t <= 0) { e.state = 'cruise'; e.t = rand(1.4, 2.6); }
        }
        e.body.position.y = 1.2 + Math.sin(t * 4 + e.ph) * 0.1;
        e.mat.emissiveIntensity = e.state === 'windup' ? 1.6 : 0.25;
      } else if (e.type === 'angler') {
        const want = dist > 13 ? 1 : dist < 9 ? -0.7 : 0;
        const side = Math.sin(t * 0.4 + e.ph) > 0 ? 1 : -1;
        e.vx = damp(e.vx, (nx * want - nz * side * 0.5) * e.speed * stunK, 2, dt);
        e.vz = damp(e.vz, (nz * want + nx * side * 0.5) * e.speed * stunK, 2, dt);
        e.shootT -= dt * stunK;
        if (e.shootT <= 0 && dist < 26) {
          e.shootT = Math.max(1.6, 2.8 - e.wave * 0.06);
          const n = e.wave >= 9 ? 3 : 1;
          for (let k = 0; k < n; k++) { const a = Math.atan2(nz, nx) + (k - (n - 1) / 2) * 0.22; api.spawnSpore(e.x + Math.cos(a) * 2, e.z + Math.sin(a) * 2, Math.cos(a), Math.sin(a), 9.5, null); }
        }
        e.extra.lure[0].position.y = 1.85 + Math.sin(t * 3 + e.ph) * 0.15;
        e.extra.lure[1].position.y = e.extra.lure[0].position.y;
        e.body.position.y = 1.5 + Math.sin(t * 1.1 + e.ph) * 0.15;
      } else if (e.type === 'boss') {
        this.updateBoss(e, dt, player, api, stunK);
        continue;
      }

      e.x += e.vx * dt; e.z += e.vz * dt;
      const vl = Math.hypot(e.vx, e.vz);
      if (vl > 0.3 || e.type === 'angler') e.ang = angleLerp(e.ang, e.type === 'angler' || (e.type === 'darter' && e.state === 'windup') ? Math.atan2(nz, nx) : Math.atan2(e.vz, e.vx), 1 - Math.exp(-8 * dt));
      e.root.position.set(e.x, 0, e.z);
      e.root.rotation.y = -e.ang - Math.PI / 2;
      if (e.mat) e.mat.emissiveIntensity = (e.type === 'darter' ? e.mat.emissiveIntensity : e.type === 'jelly' ? 0.9 : e.type === 'eel' ? 1.1 : 0.6) + e.flash * 4;
    }

    // separation + arena bounds (boss segments excluded)
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.type === 'boss') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.type === 'boss') continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, rr = (a.r + b.r) * 0.9;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d) * 0.5, ux = dx / d, uz = dz / d; a.x -= ux * push; a.z -= uz * push; b.x += ux * push; b.z += uz * push; }
      }
      const r = Math.hypot(a.x, a.z), lim = CFG.arenaR + 2;
      if (r > lim) { a.x *= lim / r; a.z *= lim / r; }
    }
  }

  updateBoss(b, dt, player, api, stunK) {
    const dx = player.x - b.x, dz = player.z - b.z, dist = Math.hypot(dx, dz) || 0.001;
    b.t -= dt; b.spitT -= dt;
    let target, turn = 2.4, speed = b.speed * (1 + (b.n - 1) * 0.08);
    if (b.state === 'circle') {
      b.orbit += dt * 0.55;
      const R = 14;
      const tx = player.x + Math.cos(b.orbit) * R, tz = player.z + Math.sin(b.orbit) * R;
      target = Math.atan2(tz - b.z, tx - b.x);
      if (b.spitT <= 0) {
        b.spitT = Math.max(3.5, 6.5 - b.n * 0.5);
        const n = 14 + b.n * 2;
        for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; api.spawnSpore(b.x + Math.cos(a) * 2, b.z + Math.sin(a) * 2, Math.cos(a), Math.sin(a), 8, CFG.colors.coral); }
        api.spit && api.spit();
      }
      if (b.t <= 0) { b.state = 'windup'; b.t = 0.9; api.roar(); }
    } else if (b.state === 'windup') {
      target = Math.atan2(dz, dx); speed = 3; turn = 6;
      b.body.position.x = Math.sin(performance.now() * 0.08) * 0.12;
      if (b.t <= 0) { b.state = 'charge'; b.t = 1.15; }
    } else {
      target = b.heading; speed = 27; turn = 0.5;
      if (b.t <= 0) { b.state = 'circle'; b.t = Math.max(3.2, 5.2 - b.n * 0.4); }
    }
    b.heading = angleLerp(b.heading, target, Math.min(1, turn * dt));
    b.vx = Math.cos(b.heading) * speed * stunK; b.vz = Math.sin(b.heading) * speed * stunK;
    b.x += b.vx * dt; b.z += b.vz * dt;
    const r = Math.hypot(b.x, b.z), lim = CFG.arenaR + 1;
    if (r > lim) { b.x *= lim / r; b.z *= lim / r; if (b.state === 'charge') { b.state = 'circle'; b.t = 3; } }
    b.root.position.set(b.x, 1.4 + Math.sin(this.time * 1.5) * 0.2, b.z);
    b.root.rotation.y = -b.heading - Math.PI / 2;
    b.mat.emissiveIntensity = 0.5 + (b.state === 'windup' ? 1.4 : 0) + b.flash * 2.5;
    b.flash = Math.max(0, b.flash - dt * 5);
    // body segments follow like a chain
    let px = b.x, pz = b.z;
    b.segs.forEach((s, i) => {
      const sp = (i === 0 ? 2.2 : 1.05 * (s.r + b.segs[i - 1].r));
      const ddx = s.x - px, ddz = s.z - pz, d = Math.hypot(ddx, ddz) || 1;
      s.x = px + ddx / d * sp; s.z = pz + ddz / d * sp;
      s.obj.position.set(s.x, 1.3 + Math.sin(this.time * 2.2 - i * 0.5) * 0.35, s.z);
      px = s.x; pz = s.z;
    });
  }

  /** glowing things for the floor light pools, nearest first */
  lights(out, cx, cz) {
    for (const e of this.list) {
      if (!e.alive) continue;
      out.push({ x: e.x, z: e.z, r: e.type === 'boss' ? 4.5 : 2.2 + e.r, i: (e.type === 'boss' ? 1.1 : e.light) * (1 + e.flash), c: e.color, d: (e.x - cx) ** 2 + (e.z - cz) ** 2 });
      if (e.type === 'boss') e.segs.forEach((s, i) => { if (i % 4 === 1) out.push({ x: s.x, z: s.z, r: 2.4, i: 0.45, c: i % 8 === 1 ? CFG.colors.aqua : CFG.colors.coral, d: (s.x - cx) ** 2 + (s.z - cz) ** 2 }); });
    }
    for (const mk of this.markers) if (mk.active) out.push({ x: mk.x, z: mk.z, r: 2.5, i: 1.2, c: CFG.colors.coral, d: (mk.x - cx) ** 2 + (mk.z - cz) ** 2 });
  }
}
