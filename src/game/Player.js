import * as THREE from 'three';
import { CFG, clamp, damp, angleLerp, glow, glowTexture } from './config.js';

/** The bathysphere: procedural yellow sub with a real spotlight, propeller and dash/sonar abilities. */
export class Player {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.scale.setScalar(1.15);
    scene.add(this.root);
    this.build(scene);
    this.reset();
  }

  build(scene) {
    const paint = new THREE.MeshStandardMaterial({ color: CFG.colors.sub, metalness: 0.25, roughness: 0.38, emissive: new THREE.Color('#ff8a00'), emissiveIntensity: 0.32 });
    const dark = new THREE.MeshStandardMaterial({ color: '#13232b', metalness: 0.7, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: '#0a3a46', metalness: 0.2, roughness: 0.05, emissive: glow(CFG.colors.cyan, 0.5), transparent: true, opacity: 0.9 });
    const lamp = new THREE.MeshBasicMaterial({ color: glow('#fff2d6', 4) });
    const cyan = new THREE.MeshBasicMaterial({ color: glow(CFG.colors.cyan, 3) });
    this.paint = paint;

    const hullGeo = new THREE.CapsuleGeometry(0.62, 1.5, 8, 20); hullGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, paint); this.body.add(hull);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.05, 8, 32), dark); band.position.z = 0.35; this.body.add(band);
    const band2 = band.clone(); band2.position.z = -0.25; this.body.add(band2);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.rotation.x = -Math.PI / 2; dome.position.z = -1.15; this.body.add(dome);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.75), paint); tower.position.set(0, 0.62, 0.05); this.body.add(tower);
    const periscope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), dark); periscope.position.set(0.1, 0.98, -0.1); this.body.add(periscope);
    const finGeo = new THREE.BoxGeometry(0.9, 0.06, 0.45);
    [-1, 1].forEach(sd => {
      const f = new THREE.Mesh(finGeo, dark); f.position.set(sd * 0.75, -0.05, 0.75); this.body.add(f);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 12), dark); pod.rotation.x = Math.PI / 2; pod.position.set(sd * 0.68, -0.25, -0.2); this.body.add(pod);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 16), cyan); ring.position.set(sd * 0.68, -0.25, 0.16); this.body.add(ring);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lamp); hl.position.set(sd * 0.3, -0.12, -1.42); this.body.add(hl);
    });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.5), dark); tail.position.set(0, 0.2, 1.25); this.body.add(tail);
    this.prop = new THREE.Group();
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.04), dark); b.position.y = 0.22; const g = new THREE.Group(); g.rotation.z = (i / 3) * Math.PI * 2; g.add(b); this.prop.add(g); }
    this.prop.position.z = 1.42; this.body.add(this.prop);

    // headlight: real spotlight for meshes, the floor shader draws its own matching cone
    this.spot = new THREE.SpotLight('#ffe7c2', 60, 30, 0.55, 0.55, 1.4);
    this.spot.position.set(0, 0.2, -1.3);
    this.spotTarget = new THREE.Object3D(); this.spotTarget.position.set(0, -1.2, -10);
    this.body.add(this.spot, this.spotTarget); this.spot.target = this.spotTarget;
    this.fill = new THREE.PointLight('#7fe9ff', 6, 9, 2); this.fill.position.set(0, 2, 0); this.root.add(this.fill);

    // glow beneath + dash ring + sonar shell
    const tex = glowTexture();
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.MeshBasicMaterial({ map: tex, color: glow('#ffb23a', 0.75), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2; this.halo.position.y = 0.05; this.root.add(this.halo);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), new THREE.MeshBasicMaterial({ color: glow(CFG.colors.cyan, 1.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }));
    this.body.add(this.shield);
    this.sonarMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 96), new THREE.MeshBasicMaterial({ color: glow(CFG.colors.aqua, 3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sonarMesh.rotation.x = Math.PI / 2;
    scene.add(this.sonarMesh);
  }

  reset() {
    const P = CFG.player;
    this.x = 0; this.z = 4; this.vx = 0; this.vz = 0;
    this.aim = -Math.PI / 2; this.heading = -Math.PI / 2;
    this.stats = { ...P };
    this.hp = P.hp; this.maxHp = P.hp;
    this.fireT = 0; this.dashT = 0; this.dashCdT = 0; this.sonarCdT = 0; this.invuln = 0; this.sonarFx = 0;
    this.bob = 0; this.tilt = 0;
    this.root.visible = true;
    this.root.position.set(this.x, 0, this.z);
  }

  /** world-space muzzle + direction */
  muzzle() {
    const dx = Math.cos(this.aim), dz = Math.sin(this.aim);
    return { x: this.x + dx * 1.4, z: this.z + dz * 1.4, dx, dz };
  }

  update(dt, ctl, time) {
    const S = this.stats;
    // movement with inertia
    let mx = ctl.mx, mz = ctl.mz; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const dashing = this.dashT > 0;
    const sp = dashing ? 30 : S.speed;
    if (!dashing) {
      this.vx = damp(this.vx, mx * sp, 7, dt);
      this.vz = damp(this.vz, mz * sp, 7, dt);
    }
    this.x += this.vx * dt; this.z += this.vz * dt;
    const r = Math.hypot(this.x, this.z), lim = CFG.arenaR - 1.2;
    if (r > lim) { this.x *= lim / r; this.z *= lim / r; const nx = this.x / r, nz = this.z / r, vn = this.vx * nx + this.vz * nz; if (vn > 0) { this.vx -= vn * nx * 1.4; this.vz -= vn * nz * 1.4; } }

    this.aim = ctl.aim;
    this.heading = angleLerp(this.heading, this.aim, 1 - Math.exp(-14 * dt));
    this.dashT = Math.max(0, this.dashT - dt);
    this.dashCdT = Math.max(0, this.dashCdT - dt);
    this.sonarCdT = Math.max(0, this.sonarCdT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.fireT = Math.max(0, this.fireT - dt);

    // visuals
    this.bob += dt;
    const lateral = -this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
    this.tilt = damp(this.tilt, clamp(lateral * 0.03, -0.45, 0.45), 6, dt);
    this.root.position.set(this.x, 0, this.z);
    this.body.position.y = 1.15 + Math.sin(this.bob * 2.2) * 0.12;
    this.body.rotation.set(0, -this.heading - Math.PI / 2, 0);
    this.body.rotateZ(this.tilt);
    this.prop.rotation.z += dt * (8 + Math.hypot(this.vx, this.vz) * 2.5);
    this.shield.material.opacity = dashing ? 0.35 : (this.invuln > 0 ? 0.12 + 0.1 * Math.sin(time * 30) : 0);
    this.shield.rotation.y += dt * 2;
    this.root.visible = this.invuln > 0 && !dashing ? Math.floor(time * 18) % 2 === 0 : true;

    // sonar ring visual
    if (this.sonarFx > 0) {
      this.sonarFx = Math.max(0, this.sonarFx - dt);
      const k = 1 - this.sonarFx / 0.7;
      const rad = 1 + k * S.sonarR;
      this.sonarMesh.position.set(this.sonarX, 0.4, this.sonarZ);
      this.sonarMesh.scale.set(rad, rad, 1);
      this.sonarMesh.material.opacity = 1 - k;
    } else this.sonarMesh.material.opacity = 0;
  }

  canDash() { return this.dashCdT <= 0; }
  dash(mx, mz) {
    let dx = mx, dz = mz;
    if (!dx && !dz) { dx = Math.cos(this.aim); dz = Math.sin(this.aim); }
    const l = Math.hypot(dx, dz) || 1;
    this.vx = dx / l * 30; this.vz = dz / l * 30;
    this.dashT = 0.2; this.dashCdT = this.stats.dashCd; this.invuln = Math.max(this.invuln, 0.3);
  }
  canSonar() { return this.sonarCdT <= 0; }
  sonar() { this.sonarCdT = this.stats.sonarCd; this.sonarFx = 0.7; this.sonarX = this.x; this.sonarZ = this.z; }
}
