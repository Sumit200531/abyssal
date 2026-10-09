import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG, clamp, damp, lerp, rand, smooth } from './config.js';
import { World, MAX_LIGHTS } from './World.js';
import { Player } from './Player.js';
import { Enemies } from './Enemies.js';
import { Projectiles } from './Projectiles.js';
import { Pickups } from './Pickups.js';
import { Effects } from './Effects.js';
import { AudioEngine } from './AudioEngine.js';
import { Input } from './Input.js';
import { UI } from './UI.js';
import { UPGRADES, rollChoices } from './Upgrades.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }
};
const C = CFG.colors;

export class Game {
  constructor() {
    this.ui = new UI();
    this.audio = new AudioEngine();
    this.best = Number(store.get('abyssal.best', 0)) || 0;
    this.bestWave = Number(store.get('abyssal.wave', 0)) || 0;
    this.qualityLocked = store.get('abyssal.quality', '') !== '';
    this.quality = store.get('abyssal.quality', 'high');
    this.state = 'boot';
    if (!this.initRenderer()) { this.ui.showError(); this.state = 'error'; return; }
    this.input = new Input(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = CFG.fogColor.clone();
    this.scene.fog = new THREE.FogExp2(CFG.fogColor.clone(), CFG.fogDensity);
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);
    this.camera.position.set(0, 20, 26);
    this.scene.add(new THREE.HemisphereLight('#3fa6b8', '#02080c', 0.55));
    const moon = new THREE.DirectionalLight('#8fe3ff', 0.7); moon.position.set(-8, 30, -6); this.scene.add(moon);

    this.world = new World(this.scene, this.quality);
    this.player = new Player(this.scene);
    this.enemies = new Enemies(this.scene);
    this.shots = new Projectiles(this.scene);
    this.pickups = new Pickups(this.scene);
    this.fx = new Effects(this.scene, this.quality);
    this.setupComposer();
    this.applyQuality();
    this.prewarm();

    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.15);
    this.camTarget = new THREE.Vector3();
    this.shake = 0;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.perf = { acc: 0, frames: 0, fps: 60, low: 0 };
    this.api = {
      spawnSpore: (x, z, dx, dz, sp, col) => { if (this.state !== 'title') { this.shots.fireSpore(x, z, dx, dz, sp, col); this.audio.spore(); } },
      spawned: e => this.fx.burst(e.x, 1.2, e.z, 16, { color: e.color, speed: 4, life: 0.6, size: 0.4, intensity: 1.8 }),
      roar: () => { if (this.state === 'playing') { this.audio.roar(); this.shake = Math.max(this.shake, 0.5); } },
      dashSound: () => { if (this.state === 'playing') this.audio.darter(); },
      spit: () => {}
    };

    this.resetRun();
    this.bindUI();
    addEventListener('resize', () => this.resize());
    this.input.onBlur = () => { if (this.state === 'playing') this.pause(); };
    this.resize();
    this.ui.setTitleStats(this.best, this.bestWave);
    this.ui.setMuteLabels(this.audio.muted);
    this.ui.setQualityLabels(this.quality);
    this.toTitle();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /* ------------------------------------------------------------- setup */
  initRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, powerPreference: 'high-performance', stencil: false });
    } catch (e) { console.error('WebGL unavailable', e); return false; }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    return true;
  }
  setupComposer() {
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.7, 0.5, 0.85);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch (e) { console.warn('Bloom unavailable', e); this.composer = null; }
  }
  applyQuality() {
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.5 : 1));
    this.useBloom = high && !!this.composer;
    this.resize();
  }
  setQuality(q, manual) {
    this.quality = q;
    if (manual) { store.set('abyssal.quality', q); this.qualityLocked = true; }
    this.applyQuality(); this.ui.setQualityLabels(q);
  }
  resize() {
    if (!this.camera) return;
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.fov = w / h < 1 ? 64 : 50; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); this.bloom.setSize(w * 0.5, h * 0.5); }
    const px = this.renderer.getPixelRatio() * (h / 900);
    if (this.fx) this.fx.uPx.value = px;
    if (this.world) this.world.snowPx.value = px;
  }
  prewarm() {
    // compile every shader once at boot so the first creature/boss doesn't hitch
    ['jelly', 'darter', 'eel', 'angler'].forEach((t, i) => this.enemies.spawn(t, i * 3 - 4, -6, 1));
    this.enemies.spawnBoss(0, -14, 1);
    this.shots.fireBolt(0, 0, 0, -1, this.player.stats); this.shots.fireSpore(0, -2, 0, 1, 1, null);
    this.pickups.drop(0, 2, 1, 1);
    this.shots.update(0); this.pickups.update(0, this.player); this.fx.burst(0, 1, 0, 2, { life: 0.01 });
    this.enemies.telegraph('jelly', 3, 3, 1);
    try { this.renderer.compile(this.scene, this.camera); if (this.composer) this.composer.render(); } catch (e) { console.warn(e); }
    this.enemies.clear(); this.shots.clear(); this.pickups.clear(); this.fx.clear();
  }
  bindUI() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', e => { e.currentTarget.blur(); this.audio.init(); this.audio.ui(); fn(); });
    on('btnStart', () => this.startRun());
    on('btnResume', () => this.resume());
    on('btnRestartP', () => this.startRun());
    on('btnRestart', () => this.startRun());
    on('btnMenu', () => this.toTitle());
    on('btnMenuO', () => this.toTitle());
    const mute = () => this.toggleMute(), qual = () => this.setQuality(this.quality === 'high' ? 'low' : 'high', true);
    on('btnMute', mute); on('btnMuteP', mute); on('btnQuality', qual); on('btnQualityP', qual);
  }
  toggleMute() { this.audio.setMuted(!this.audio.muted); this.ui.setMuteLabels(this.audio.muted); }

  /* ------------------------------------------------------------ states */
  resetRun() {
    this.score = 0; this.kills = 0; this.combo = 1; this.streak = 0; this.comboT = 0;
    this.wave = 0; this.waveState = 'break'; this.queue = []; this.spawnT = 0; this.breakT = 1.2;
    this.level = 1; this.xp = 0; this.xpNeed = 5; this.levels = {}; this.pendingLevels = 0;
    this.runTime = 0; this.timeScale = 1; this.beatT = 0;
    this.sonarFx = 0;
  }
  clearArena() { this.enemies.clear(); this.shots.clear(); this.pickups.clear(); this.fx.clear(); }

  toTitle() {
    this.state = 'title';
    this.clearArena();
    this.player.reset();
    this.ui.showHud(false); this.ui.aiming(false); this.ui.setTitleStats(this.best, this.bestWave);
    this.ui.show('title');
    // ambient creatures for the attract camera
    this.attract = { x: 0, z: 0 };
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; this.enemies.spawn('jelly', Math.cos(a) * 16, Math.sin(a) * 16, 1); }
    this.enemies.spawn('angler', 12, -10, 1);
    for (let i = 0; i < 6; i++) this.enemies.spawn('eel', -14 + rand(-2, 2), 8 + rand(-2, 2), 1);
  }
  startRun() {
    if (this.state === 'error') return;
    this.audio.init(); this.audio.startMusic();
    this.clearArena(); this.resetRun(); this.player.reset();
    this.ui.clearToasts(); this.ui.show(null); this.ui.showHud(true); this.ui.aiming(true);
    this.state = 'playing';
    this.clock.getDelta();
  }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; this.ui.aiming(false); this.ui.build(this.levels, UPGRADES); this.ui.show('pause'); this.audio.drive(false, 0);
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing'; this.ui.aiming(true); this.ui.show(null); this.clock.getDelta();
  }

  /* -------------------------------------------------------------- waves */
  startWave(n) {
    this.wave = n;
    this.queue = [];
    if (n % 5 === 0) {
      this.queue.push('boss');
      for (let i = 0; i < Math.floor(n / 5); i++) this.queue.push('eel');
      this.queue.push('jelly', 'jelly');
    } else {
      let budget = 5 + n * 3.3;
      const opts = [['jelly', 1, 3], ['darter', 2, n >= 2 ? 2.2 : 0], ['eel', 3, n >= 3 ? 1.4 : 0], ['angler', 5, n >= 4 ? 1 + n * 0.05 : 0]];
      while (budget > 0) {
        const total = opts.reduce((a, o) => a + o[2], 0);
        let r = Math.random() * total, pick = opts[0];
        for (const o of opts) { if ((r -= o[2]) <= 0) { pick = o; break; } }
        this.queue.push(pick[0]); budget -= pick[1];
      }
    }
    this.waveState = 'spawning'; this.spawnT = 0.6;
    this.ui.toast(n % 5 === 0 ? 'LEVIATHAN RISES' : `WAVE ${n}`, n % 5 === 0 ? 'coral' : 'amber');
    this.audio.wave(); this.audio.intensity = Math.min(1, n / 12);
    if (n > this.bestWave) { this.bestWave = n; store.set('abyssal.wave', n); }
  }
  updateWaves(dt) {
    if (this.waveState === 'break') {
      this.breakT -= dt;
      if (this.breakT <= 0) this.startWave(this.wave + 1);
      return;
    }
    if (this.waveState === 'spawning') {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.queue.length) {
        const group = Math.min(this.queue.length, 1 + ((Math.random() * Math.min(3, 1 + this.wave / 4)) | 0));
        const base = Math.atan2(-this.player.z, -this.player.x) + rand(-1.6, 1.6);
        for (let i = 0; i < group; i++) {
          const type = this.queue.shift();
          const a = base + (i - group / 2) * 0.28, r = CFG.arenaR - 2.5;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (type === 'boss') { const b = this.enemies.spawnBoss(x, z, this.wave / 5); this.audio.roar(); this.shake = 0.8; this.fx.burst(x, 1, z, 60, { color: C.coral, speed: 9, life: 1, size: 0.6 }); b.t = 4; }
          else this.enemies.telegraph(type, x, z, this.wave);
        }
        this.spawnT = lerp(1.5, 0.55, Math.min(1, this.wave / 14));
      }
      if (!this.queue.length) this.waveState = 'fighting';
    }
    if (this.waveState === 'fighting' && this.enemies.list.length === 0 && this.enemies.pending() === 0) {
      this.waveState = 'break'; this.breakT = CFG.waveBreak;
      const bonus = 250 * this.wave;
      this.score += bonus;
      this.ui.toast(`WAVE ${this.wave} CLEARED  +${bonus.toLocaleString('en-US')}`, 'aqua', true);
    }
  }

  /* ------------------------------------------------------------ combat */
  damageEnemy(e, dmg, bx, bz) {
    e.hp -= dmg; e.flash = 1;
    if (e.type !== 'boss') { const dx = e.x - bx, dz = e.z - bz, d = Math.hypot(dx, dz) || 1; e.x += dx / d * 0.25; e.z += dz / d * 0.25; }
    this.fx.burst(bx, 1.2, bz, 5, { color: C.white, speed: 5, life: 0.25, size: 0.18, intensity: 2 });
    this.audio.hit();
    if (e.hp <= 0) this.killEnemy(e);
  }
  killEnemy(e) {
    if (!e.alive) return;
    const big = e.type === 'boss' || e.type === 'angler';
    if (e.type === 'boss') {
      e.segs.forEach((s, i) => this.fx.burst(s.x, 1.3, s.z, 12, { color: i % 2 ? C.aqua : C.coral, speed: 7, life: 1.2, size: 0.55, intensity: 2.2 }));
      this.fx.burst(e.x, 1.4, e.z, 120, { color: C.coral, speed: 14, life: 1.4, size: 0.7, intensity: 2.4 });
      this.pickups.drop(e.x, e.z, e.xp, 1);
      this.enemies.removeBoss();
      this.ui.toast('LEVIATHAN SLAIN', 'coral'); this.shake = 1;
    } else {
      this.fx.burst(e.x, 1.2, e.z, big ? 50 : 22, { color: e.color, speed: big ? 9 : 6, life: 0.8, size: big ? 0.55 : 0.4, intensity: 2 });
      this.fx.burst(e.x, 1.2, e.z, big ? 10 : 5, { color: new THREE.Color(0.05, 0.12, 0.16), speed: 1.5, life: 1.4, size: big ? 1.6 : 1, grow: 1.5, intensity: 1, drag: 3 });
      this.fx.bubbles(e.x, 1, e.z, big ? 12 : 5);
      this.pickups.drop(e.x, e.z, e.xp, e.type === 'angler' ? 0.25 : 0.03);
      this.enemies.kill(e);
    }
    this.kills++;
    this.streak++; this.comboT = 2.6;
    const c = Math.min(8, 1 + Math.floor(this.streak / 6));
    if (c !== this.combo) { this.combo = c; this.ui.bumpCombo(); }
    this.score += e.score * this.combo;
    this.audio.kill(big);
  }
  hitPlayer(src) {
    const p = this.player;
    if (p.invuln > 0) return;
    p.hp--; p.invuln = p.stats.invuln;
    this.shake = 0.9; this.ui.hurt(); this.audio.hurt();
    this.streak = 0; if (this.combo > 1) { this.combo = 1; this.ui.bumpCombo(); }
    this.fx.burst(p.x, 1.2, p.z, 30, { color: C.sub, speed: 7, life: 0.6, size: 0.35, intensity: 2 });
    if (src) { const dx = p.x - src.x, dz = p.z - src.z, d = Math.hypot(dx, dz) || 1; p.vx += dx / d * 14; p.vz += dz / d * 14; }
    if (p.hp <= 0) this.die();
    else if (p.hp === 1) this.ui.toast('HULL CRITICAL', 'coral', true);
  }
  die() {
    this.state = 'dying'; this.dieT = 0;
    const p = this.player;
    this.fx.burst(p.x, 1.2, p.z, 140, { color: C.sub, speed: 13, life: 1.4, size: 0.6, intensity: 2.4 });
    this.fx.burst(p.x, 1.2, p.z, 80, { color: C.cyan, speed: 9, life: 1.2, size: 0.45, intensity: 2 });
    this.fx.bubbles(p.x, 1, p.z, 40, 2);
    p.root.visible = false; this.shake = 1.3;
    this.ui.aiming(false); this.audio.drive(false, 0); this.audio.over();
    this.newBest = this.score > this.best;
    if (this.newBest) { this.best = Math.floor(this.score); store.set('abyssal.best', this.best); }
  }
  showOver() {
    this.state = 'over';
    this.ui.showHud(false);
    this.ui.over({ score: this.score, wave: this.wave, kills: this.kills, level: this.level, time: this.runTime, best: this.best, newBest: this.newBest });
    this.ui.show('over');
  }
  sonarPulse() {
    const p = this.player, R = p.stats.sonarR;
    p.sonar(); this.audio.sonar(); this.sonarFx = 0.7;
    for (const e of [...this.enemies.list]) {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (d > R + e.r) continue;
      if (e.type === 'boss') { e.stun = 0.6; this.damageEnemy(e, 4, e.x, e.z); continue; }
      e.stun = 2.2; e.vx = dx / d * 16; e.vz = dz / d * 16;
      if (e.type === 'darter') { e.state = 'recover'; e.t = 1; }
      this.damageEnemy(e, 1, e.x, e.z);
    }
    for (const s of this.shots.spores.items) if (s.alive && Math.hypot(s.x - p.x, s.z - p.z) < R) { s.alive = false; this.fx.burst(s.x, 1.1, s.z, 4, { color: C.aqua, speed: 3, life: 0.3, size: 0.2 }); }
  }
  addXp(n) {
    this.xp += n;
    while (this.xp >= this.xpNeed) { this.xp -= this.xpNeed; this.level++; this.pendingLevels++; this.xpNeed = Math.round(4 + this.level * 2.4 + Math.pow(this.level, 1.3)); }
  }
  openLevelUp() {
    const choices = rollChoices(this.levels);
    if (!choices.length) { this.pendingLevels = 0; this.player.hp = this.player.maxHp; return; }
    this.state = 'levelup'; this.choices = choices;
    this.ui.aiming(false); this.audio.levelUp(); this.audio.drive(false, 0);
    this.ui.levelUp(this.level - this.pendingLevels + 1, choices, this.levels, i => this.pickUpgrade(i));
  }
  pickUpgrade(i) {
    if (this.state !== 'levelup' || !this.choices[i]) return;
    const u = this.choices[i];
    u.apply(this.player.stats, this.player);
    this.levels[u.id] = (this.levels[u.id] || 0) + 1;
    this.pendingLevels--;
    this.audio.ui();
    this.ui.toast(u.name.toUpperCase(), 'aqua', true);
    if (this.pendingLevels > 0) this.openLevelUp();
    else { this.state = 'playing'; this.ui.show(null); this.ui.aiming(true); this.clock.getDelta(); }
  }

  /* --------------------------------------------------------------- loop */
  frame() {
    const raw = Math.min(this.clock.getDelta(), 1 / 20);
    this.trackPerf(raw);
    this.handleKeys();
    const dt = raw * this.timeScale;
    this.time += dt;
    switch (this.state) {
      case 'title': case 'over': this.updateAttract(dt); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'dying': this.updateDying(dt, raw); break;
      default: break;
    }
    if (this.state !== 'paused' && this.state !== 'levelup') this.updateCamera(raw);
    this.feedLights();
    if (this.useBloom) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
  trackPerf(dt) {
    const p = this.perf; p.acc += dt; p.frames++;
    if (p.acc >= 0.5) {
      p.fps = p.frames / p.acc; p.acc = 0; p.frames = 0;
      if (!this.ui.el.fps.hidden) this.ui.el.fps.textContent = `${p.fps.toFixed(0)} fps · ${this.quality}`;
      if (!this.qualityLocked && this.quality === 'high' && (this.state === 'playing' || this.state === 'title')) {
        p.low = p.fps < 40 ? p.low + 1 : 0;
        if (p.low >= 6) { this.setQuality('low', false); this.ui.toast('Graphics set to Low for smoother play', 'cyan', true); }
      }
    }
  }
  handleKeys() {
    const I = this.input, s = this.state;
    if (I.hit('KeyM')) { this.audio.init(); this.toggleMute(); }
    if (I.hit('KeyQ')) this.setQuality(this.quality === 'high' ? 'low' : 'high', true);
    if (I.hit('KeyF')) this.ui.el.fps.hidden = !this.ui.el.fps.hidden;
    if (s === 'title' && I.hit('Enter', 'NumpadEnter')) this.startRun();
    else if (s === 'playing' && I.hit('KeyP', 'Escape')) this.pause();
    else if (s === 'paused') { if (I.hit('KeyP', 'Escape')) this.resume(); else if (I.hit('KeyR')) this.startRun(); else if (I.hit('KeyT')) this.toTitle(); }
    else if (s === 'over') { if (I.hit('Enter', 'KeyR', 'NumpadEnter')) this.startRun(); else if (I.hit('KeyT')) this.toTitle(); }
    else if (s === 'levelup') { ['Digit1', 'Digit2', 'Digit3'].forEach((k, i) => { if (I.hit(k, 'Numpad' + (i + 1))) this.pickUpgrade(i); }); }
  }

  aimAngle() {
    const m = this.input.mouse;
    const ndc = new THREE.Vector2((m.x / innerWidth) * 2 - 1, -(m.y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.aimPlane, hit)) return Math.atan2(hit.z - this.player.z, hit.x - this.player.x);
    return this.player.aim;
  }

  updateAttract(dt) {
    const t = this.time;
    this.attract.x = Math.cos(t * 0.2) * 9; this.attract.z = Math.sin(t * 0.2) * 9;
    this.world.update(dt, this.camera);
    if (this.state === 'title') {
      const p = this.player;
      p.update(dt, { mx: Math.cos(t * 0.35) * 0.35, mz: Math.sin(t * 0.5) * 0.35, aim: t * 0.4 }, t);
      this.enemies.update(dt, { x: Math.cos(t * 0.13) * 12, z: Math.sin(t * 0.13) * 12 }, this.api);
    } else {
      this.enemies.update(dt, { x: this.player.x, z: this.player.z }, this.api);
    }
    this.shots.update(dt); this.fx.update(dt);
    if (Math.random() < dt * 4) this.fx.bubbles(rand(-20, 20), 0.2, rand(-20, 20), 2);
  }

  updatePlaying(dt) {
    const I = this.input, p = this.player;
    this.runTime += dt;
    const mx = I.moveX, mz = I.moveZ;
    if (I.dash && p.canDash()) { p.dash(mx, mz); this.audio.dash(); this.fx.bubbles(p.x, 1, p.z, 14, 1.5); }
    if (I.sonar && p.canSonar()) this.sonarPulse();
    p.update(dt, { mx, mz, aim: this.aimAngle() }, this.time);
    this.ui.reticle(I.mouse.x, I.mouse.y, I.fire);

    // fire
    if (I.fire && p.fireT <= 0) {
      p.fireT = 1 / p.stats.fireRate;
      const m = p.muzzle(), n = p.stats.shots, sp = p.stats.spread;
      for (let k = 0; k < n; k++) {
        const a = p.aim + (k - (n - 1) / 2) * sp;
        this.shots.fireBolt(m.x, m.z, Math.cos(a), Math.sin(a), p.stats);
      }
      this.fx.burst(m.x, 1.15, m.z, 3, { color: C.cyan, speed: 3, dir: { x: m.dx, y: 0, z: m.dz }, spread: 1.5, life: 0.18, size: 0.3, intensity: 2.2 });
      this.audio.shoot();
    }
    // bubble trail
    const sp = Math.hypot(p.vx, p.vz);
    if (Math.random() < dt * (4 + sp * 1.4)) this.fx.bubbles(p.x - Math.cos(p.heading) * 1.4, 1.1, p.z - Math.sin(p.heading) * 1.4, 1);

    this.updateWaves(dt);
    this.world.update(dt, this.camera);
    this.enemies.update(dt, p, this.api);
    this.shots.update(dt);

    // bolts vs creatures
    for (const b of this.shots.bolts.items) {
      if (!b.alive) continue;
      for (const e of this.enemies.list) {
        if (!e.alive || b.hit.has(e)) continue;
        let hit = false;
        if (e.type === 'boss') {
          if ((b.x - e.x) ** 2 + (b.z - e.z) ** 2 < (e.r + 0.4) ** 2) hit = true;
          else for (const s of e.segs) if ((b.x - s.x) ** 2 + (b.z - s.z) ** 2 < (s.r + 0.35) ** 2) { hit = true; break; }
        } else hit = (b.x - e.x) ** 2 + (b.z - e.z) ** 2 < (e.r + 0.35) ** 2;
        if (!hit) continue;
        b.hit.add(e);
        this.damageEnemy(e, b.dmg, b.x, b.z);
        if (b.pierce-- <= 0) { b.alive = false; break; }
      }
    }
    // creatures & spores vs sub
    const pr = p.stats.radius;
    if (this.state === 'playing') for (const e of this.enemies.list) {
      if (!e.alive) continue;
      let touch = (p.x - e.x) ** 2 + (p.z - e.z) ** 2 < (e.r * 0.9 + pr) ** 2;
      if (!touch && e.type === 'boss') for (const s of e.segs) if ((p.x - s.x) ** 2 + (p.z - s.z) ** 2 < (s.r * 0.9 + pr) ** 2) { touch = true; break; }
      if (touch) { this.hitPlayer(e); if (e.type !== 'boss') { const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1; e.vx = dx / d * 10; e.vz = dz / d * 10; } if (this.state !== 'playing') return; }
    }
    for (const s of this.shots.spores.items) {
      if (s.alive && (p.x - s.x) ** 2 + (p.z - s.z) ** 2 < (0.4 + pr) ** 2) { s.alive = false; this.hitPlayer(s); if (this.state !== 'playing') return; }
    }

    // pickups
    const got = this.pickups.update(dt, p, this.waveState === 'break');
    if (got.xp) { this.addXp(got.xp); this.audio.pickup(this.xp); }
    if (got.kits) { p.hp = Math.min(p.maxHp, p.hp + got.kits); this.audio.kit(); this.ui.toast('HULL REPAIRED', 'amber', true); }

    // combo timeout
    this.comboT -= dt;
    if (this.comboT <= 0 && this.streak) { this.streak = 0; if (this.combo !== 1) { this.combo = 1; this.ui.bumpCombo(); } }

    // sonar floor ring
    this.sonarFx = Math.max(0, this.sonarFx - dt);
    const k = 1 - this.sonarFx / 0.7;
    this.world.u.uSonar.value.set(p.sonarX || 0, p.sonarZ || 0, k * p.stats.sonarR, this.sonarFx > 0 ? (1 - k) * 1.6 : 0);

    // low hull heartbeat
    if (p.hp === 1) { this.beatT -= dt; if (this.beatT <= 0) { this.audio.heartbeat(); this.beatT = 1.1; } }

    this.fx.update(dt);
    this.audio.drive(true, Math.min(1, sp / 12));

    const boss = this.enemies.boss;
    const left = this.waveState === 'break' ? 'Next wave incoming' : `${this.enemies.list.length + this.queue.reduce((a, q) => a + (q === 'eel' ? 6 : 1), 0) + this.enemies.pendingCount()} creatures left`;
    this.ui.hud({
      score: this.score, combo: this.combo, best: this.best, wave: Math.max(1, this.wave), left, level: this.level, kills: this.kills,
      xpK: this.xp / this.xpNeed, hp: p.hp, maxHp: p.maxHp,
      dashK: 1 - p.dashCdT / p.stats.dashCd, sonarK: 1 - p.sonarCdT / p.stats.sonarCd,
      boss: boss ? boss.hp / boss.maxHp : 0
    });
    if (this.pendingLevels > 0 && this.state === 'playing') this.openLevelUp();
  }

  updateDying(dt, raw) {
    this.dieT += raw;
    this.timeScale = lerp(0.25, 1, smooth(0.3, 1.8, this.dieT));
    this.world.update(dt, this.camera);
    this.enemies.update(dt, { x: this.player.x + 40, z: this.player.z }, this.api);
    this.shots.update(dt); this.fx.update(dt);
    if (this.dieT > 2.1) { this.timeScale = 1; this.showOver(); }
  }

  updateCamera(dt) {
    const cam = this.camera, p = this.player;
    if (this.state === 'title' || this.state === 'over') {
      const a = this.time * 0.07;
      const target = new THREE.Vector3(Math.cos(a) * 24, 13 + Math.sin(this.time * 0.2) * 2, Math.sin(a) * 24);
      cam.position.lerp(target, 1 - Math.exp(-1.5 * dt));
      this.camTarget.lerp(new THREE.Vector3(p.x * 0.5, 1, p.z * 0.5), 1 - Math.exp(-2 * dt));
    } else {
      const ax = Math.cos(p.aim) * 2.4, az = Math.sin(p.aim) * 2.4;
      const look = new THREE.Vector3(p.x + ax, 0.8, p.z + az);
      this.camTarget.lerp(look, 1 - Math.exp(-6 * dt));
      const target = new THREE.Vector3(this.camTarget.x, 20.5, this.camTarget.z + 12.5);
      cam.position.lerp(target, 1 - Math.exp(-5 * dt));
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake;
    cam.position.x += (Math.random() - 0.5) * s * 0.8;
    cam.position.z += (Math.random() - 0.5) * s * 0.8;
    cam.lookAt(this.camTarget);
  }

  feedLights() {
    const list = [], c = this.camTarget, p = this.player;
    this.enemies.lights(list, c.x, c.z);
    this.pickups.lights(list, c.x, c.z);
    let nb = 0;
    for (const b of this.shots.bolts.items) { if (!b.alive) continue; list.push({ x: b.x, z: b.z, r: 1.8, i: 0.9, c: C.cyan, d: (b.x - c.x) ** 2 + (b.z - c.z) ** 2 + 30 }); if (++nb > 8) break; }
    for (const l of this.world.coralLights) list.push({ x: l.x, z: l.z, r: 2.4, i: 0.5, c: l.c, d: (l.x - c.x) ** 2 + (l.z - c.z) ** 2 + 120 });
    list.sort((a, b) => a.d - b.d);
    this.world.setLights(list.slice(0, MAX_LIGHTS));
    this.world.u.uPlayer.value.set(p.x, p.z, p.root.visible || this.state === 'playing' ? 1 : 0);
    this.world.u.uAim.value.set(Math.cos(p.heading), Math.sin(p.heading));
  }

  debugState() {
    const p = this.player;
    return { state: this.state, wave: this.wave, waveState: this.waveState, score: Math.floor(this.score), kills: this.kills, level: this.level, hp: p.hp, maxHp: p.maxHp,
      enemies: this.enemies.list.length, pending: this.enemies.pending(), queue: this.queue.length, boss: !!this.enemies.boss, combo: this.combo,
      x: +p.x.toFixed(1), z: +p.z.toFixed(1), quality: this.quality, fps: Math.round(this.perf.fps), levels: { ...this.levels } };
  }
}
