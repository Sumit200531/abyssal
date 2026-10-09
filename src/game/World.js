import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, FOG_GLSL, fogUniforms, glow, rand } from './config.js';

export const MAX_LIGHTS = 14;

/**
 * The trench: sand floor with animated caustics and bioluminescent light pools,
 * rock ring, swaying kelp, glowing coral, god rays and drifting marine snow.
 */
export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.u = {
      uTime: { value: 0 },
      uPlayer: { value: new THREE.Vector3(0, 0, 1) },   // x, z, headlight on
      uAim: { value: new THREE.Vector2(0, -1) },
      uL: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, 0, 1, 0)) }, // x, z, radius, intensity
      uLC: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color()) },
      uSonar: { value: new THREE.Vector4(0, 0, 0, 0) },  // x, z, radius, strength
      ...fogUniforms
    };
    this.buildBackdrop();
    this.buildFloor();
    this.buildRocks();
    this.buildKelp();
    this.buildCoral();
    this.buildRays();
    this.buildSnow();
  }

  buildBackdrop() {
    const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color('#0e4a5c') }, uBot: { value: CFG.fogColor.clone() }, uTime: this.u.uTime },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 uTop, uBot; uniform float uTime; varying vec3 vD;
        void main(){ float h = vD.y; vec3 c = mix(uBot, uTop, smoothstep(0.05, 0.9, h));
          c += vec3(0.1, 0.35, 0.4) * pow(max(h, 0.0), 6.0) * (0.6 + 0.4 * sin(uTime * 0.5 + vD.x * 8.0));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));
    m.renderOrder = -10; m.frustumCulled = false;
    this.scene.add(m);
  }

  buildFloor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, uR: { value: CFG.arenaR } },
      vertexShader: /* glsl */`
        varying vec3 vW; varying float vDepth;
        void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        #define NL ${MAX_LIGHTS}
        uniform float uTime, uR;
        uniform vec3 uPlayer; uniform vec2 uAim;
        uniform vec4 uL[NL]; uniform vec3 uLC[NL];
        uniform vec4 uSonar;
        varying vec3 vW; varying float vDepth;
        ${FOG_GLSL}
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        float caustic(vec2 uv, float time) {
          vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
          vec2 i = p; float c = 1.0; float inten = 0.005;
          for (int n = 0; n < 4; n++) {
            float t = time * (1.0 - (3.5 / float(n + 1)));
            i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
            c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
          }
          c /= 4.0; c = 1.17 - pow(c, 1.4);
          return pow(abs(c), 8.0);
        }
        void main() {
          vec2 xz = vW.xz;
          float r = length(xz);
          // sand with ripples
          float n = noise(xz * 0.35) * 0.6 + noise(xz * 1.3) * 0.4;
          float rip = 0.5 + 0.5 * sin(dot(xz, vec2(0.8, 0.6)) * 2.4 + n * 4.0);
          vec3 sand = mix(vec3(0.020, 0.075, 0.095), vec3(0.045, 0.13, 0.15), n) * (0.85 + rip * 0.25);
          // caustic light from the surface far above
          float cs = caustic(xz * 0.045, uTime * 0.35) + caustic(xz * 0.07 + 3.1, uTime * 0.27) * 0.6;
          vec3 light = vec3(0.12, 0.42, 0.48) * cs * 0.55 + vec3(0.25, 0.42, 0.45) * 0.28;
          // headlight cone
          vec2 d = xz - uPlayer.xy; float dl = length(d);
          float cone = smoothstep(0.80, 0.95, dot(d / max(dl, 0.001), uAim)) * smoothstep(24.0, 3.0, dl);
          light += vec3(1.0, 0.86, 0.62) * (cone * 1.25 + exp(-dl * dl * 0.18) * 0.7) * uPlayer.z;
          // bioluminescent pools from creatures, bolts and pickups
          vec3 bio = vec3(0.0);
          for (int k = 0; k < NL; k++) {
            vec2 q = xz - uL[k].xy; float rr = uL[k].z;
            bio += uLC[k] * uL[k].w * exp(-dot(q, q) / (rr * rr));
          }
          vec3 col = sand * light + bio * 0.22 + sand * bio * 1.6;
          // sonar ring
          float sr = abs(r - 0.0); vec2 sq = xz - uSonar.xy; float sd = abs(length(sq) - uSonar.z);
          col += vec3(0.36, 1.0, 0.7) * uSonar.w * exp(-sd * sd * 3.0);
          // arena boundary
          float edge = abs(r - uR);
          float dash = step(0.5, fract(atan(xz.y, xz.x) * 12.0 + uTime * 0.15));
          col += vec3(0.24, 0.95, 1.0) * exp(-edge * edge * 10.0) * (0.25 + 0.35 * dash) ;
          col *= mix(1.0, 0.35, smoothstep(uR, uR + 10.0, r));
          col = applyFog(col, vDepth);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(90, 96), mat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.floor = floor;
  }

  buildRocks() {
    const n = this.quality === 'low' ? 70 : 120;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#0c2129', roughness: 0.92, metalness: 0.08, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      const ring = i % 3;
      const r = CFG.arenaR + 2.5 + ring * 4 + rand(0, 4);
      const tall = Math.random() < 0.18;
      s.set(rand(1.6, 3.6), tall ? rand(5, 11) : rand(1.2, 3.4), rand(1.6, 3.6)).multiplyScalar(1 + ring * 0.3);
      p.set(Math.cos(a) * r, s.y * 0.35, Math.sin(a) * r);
      q.setFromEuler(e.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3)));
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
    }
    this.scene.add(mesh);
  }

  buildKelp() {
    const n = this.quality === 'low' ? 90 : 170;
    const a = new THREE.PlaneGeometry(0.9, 1, 1, 12); a.translate(0, 0.5, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    const geo = mergeGeometries([a, b]);
    const phase = new Float32Array(n);
    const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      side: THREE.DoubleSide, transparent: false,
      uniforms: { uTime: this.u.uTime, uFogColor: this.u.uFogColor, uFogDensity: this.u.uFogDensity, uTip: { value: glow('#2bb8c9', 1.1) } },
      vertexShader: /* glsl */`
        attribute float aPhase; uniform float uTime;
        varying vec2 vUv; varying float vH; varying float vDepth; varying float vPhase;
        void main() {
          vUv = uv; vH = position.y; vPhase = aPhase;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          float k = position.y * position.y;
          wp.x += (sin(uTime * 1.1 + aPhase + wp.y * 0.35) * 1.1 + sin(uTime * 0.6 + aPhase * 2.0) * 0.4) * k;
          wp.z += cos(uTime * 0.9 + aPhase * 1.7 + wp.y * 0.3) * 0.7 * k;
          vec4 mv = viewMatrix * wp; vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTip; varying vec2 vUv; varying float vH; varying float vDepth; varying float vPhase;
        ${FOG_GLSL}
        void main() {
          float w = abs(vUv.x - 0.5) * 2.0;
          float shape = 0.55 + 0.35 * sin(vH * 18.0 + vPhase) ;
          if (w > shape * (1.0 - vH * 0.55)) discard;
          vec3 col = mix(vec3(0.01, 0.05, 0.04), vec3(0.03, 0.16, 0.12), vH);
          float bead = step(0.88, fract(vH * 9.0 + vPhase)) * step(w, 0.25);
          col += uTip * bead * (0.3 + vH);
          col = applyFog(col, vDepth);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const inside = i < n * 0.18;
      const ang = rand(0, Math.PI * 2);
      const r = inside ? rand(12, CFG.arenaR - 3) : rand(CFG.arenaR + 1, CFG.arenaR + 18);
      s.set(rand(0.8, 1.4), inside ? rand(2.5, 4.5) : rand(5, 12), 1);
      p.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand(0, 6.28));
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      phase[i] = rand(0, 20);
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  buildCoral() {
    const clusters = this.quality === 'low' ? 34 : 60;
    const per = 5;
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.11, 1, 5); stemGeo.translate(0, 0.5, 0);
    const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: '#2a1638', roughness: 0.7 }), clusters * per);
    const tips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), clusters * per);
    const palette = [glow(CFG.colors.violet, 2.4), glow(CFG.colors.aqua, 2.2), glow(CFG.colors.cyan, 2.2), glow('#ff7ab8', 2.2)];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), tip = new THREE.Vector3();
    let k = 0;
    this.coralLights = [];
    for (let c = 0; c < clusters; c++) {
      const inside = c < clusters * 0.45;
      const ang = rand(0, Math.PI * 2), r = inside ? rand(7, CFG.arenaR - 2) : rand(CFG.arenaR + 0.5, CFG.arenaR + 9);
      const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r;
      const col = palette[c % palette.length];
      if (c % 3 === 0) this.coralLights.push({ x: cx, z: cz, c: col });
      for (let j = 0; j < per; j++) {
        const h = rand(0.5, inside ? 1.4 : 2.4);
        p.set(cx + rand(-0.5, 0.5), 0, cz + rand(-0.5, 0.5));
        q.setFromEuler(e.set(rand(-0.6, 0.6), rand(0, 6.28), rand(-0.6, 0.6)));
        s.set(1, h, 1);
        m.compose(p, q, s); stems.setMatrixAt(k, m);
        tip.set(0, 1, 0).applyMatrix4(m);
        m.compose(tip, q, new THREE.Vector3(1, 1, 1)); tips.setMatrixAt(k, m);
        tips.setColorAt(k, col);
        k++;
      }
    }
    tips.instanceColor.needsUpdate = true;
    this.scene.add(stems, tips);
  }

  buildRays() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: this.u.uTime },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float x = sin(vUv.x * 3.14159); float a = pow(vUv.y, 1.6) * x * x;
          a *= 0.65 + 0.35 * sin(uTime * 0.7 + vUv.x * 9.0 + vUv.y * 3.0);
          gl_FragColor = vec4(vec3(0.35, 0.85, 0.9) * a * 0.22, a * 0.22); }`
    });
    this.rays = [];
    for (let i = 0; i < 9; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      const a = rand(0, 6.28), r = rand(4, 34);
      ray.userData = { x: Math.cos(a) * r, z: Math.sin(a) * r, w: rand(3, 9), ph: rand(0, 6) };
      ray.scale.set(ray.userData.w, 60, 1);
      ray.position.set(ray.userData.x, 24, ray.userData.z);
      ray.rotation.z = rand(-0.18, 0.18);
      this.scene.add(ray);
      this.rays.push(ray);
    }
  }

  buildSnow() {
    const n = this.quality === 'low' ? 700 : 1600;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([rand(-55, 55), rand(0, 26), rand(-55, 55)], i * 3); seed[i] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snowPx = { value: 1 };
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.u.uTime, uPx: this.snowPx },
      vertexShader: `attribute float aSeed; uniform float uTime, uPx; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - uTime * (0.25 + aSeed * 0.5), 26.0);
          p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.8; p.z += cos(uTime * 0.25 + aSeed * 30.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.6 + aSeed * 1.6) * uPx * (60.0 / max(1.0, -mv.z));
          vA = (0.25 + aSeed * 0.5) * smoothstep(0.0, 2.0, p.y) * smoothstep(80.0, 20.0, -mv.z); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.6, 0.95, 1.0) * a, a); }`
    }));
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  update(dt, camera) {
    this.u.uTime.value += dt;
    const t = this.u.uTime.value;
    this.rays.forEach(r => {
      r.rotation.y = Math.atan2(camera.position.x - r.position.x, camera.position.z - r.position.z);
      r.position.x = r.userData.x + Math.sin(t * 0.1 + r.userData.ph) * 2;
    });
  }

  /** feed up to MAX_LIGHTS glowing things into the floor shader */
  setLights(list) {
    const L = this.u.uL.value, C = this.u.uLC.value;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = list[i];
      if (l) { L[i].set(l.x, l.z, l.r, l.i); C[i].copy(l.c); } else L[i].w = 0;
    }
  }
}
