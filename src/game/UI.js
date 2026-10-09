import { icon } from './Upgrades.js';

const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');

/** DOM overlay: screens, HUD, upgrade cards, reticle, toasts. */
export class UI {
  constructor() {
    this.el = {
      app: $('app'), hud: $('hud'), score: $('hudScore'), combo: $('hudCombo'), best: $('hudBest'), wave: $('hudWave'), left: $('hudLeft'),
      level: $('hudLevel'), kills: $('hudKills'), depth: $('hudDepth'), hp: $('hudHp'), xp: $('xpFill'), toasts: $('toasts'),
      boss: $('bossBar'), bossFill: $('bossFill'), dash: $('abDash'), sonar: $('abSonar'), hurt: $('hurt'), reticle: $('reticle'),
      title: $('screenTitle'), pause: $('screenPause'), over: $('screenOver'), levelScreen: $('screenLevel'), error: $('screenError'), cards: $('cards'), fps: $('fps')
    };
    this.last = {};
  }
  show(name) {
    const map = { title: this.el.title, pause: this.el.pause, over: this.el.over, level: this.el.levelScreen };
    Object.entries(map).forEach(([k, el]) => {
      if (k === name) { el.hidden = false; el.classList.remove('leaving'); }
      else if (!el.hidden) { el.classList.add('leaving'); setTimeout(() => { if (el.classList.contains('leaving')) { el.hidden = true; el.classList.remove('leaving'); } }, 380); }
    });
    const focus = { title: 'btnStart', pause: 'btnResume', over: 'btnRestart' }[name];
    if (focus) setTimeout(() => $(focus)?.focus({ preventScroll: true }), 60);
  }
  showHud(on) { this.el.hud.hidden = !on; }
  showError() { this.el.error.hidden = false; this.el.title.hidden = true; }
  aiming(on) { this.el.app.classList.toggle('aiming', on); this.el.reticle.hidden = !on; }
  reticle(x, y, firing) { this.el.reticle.style.transform = `translate(${x}px, ${y}px)`; this.el.reticle.classList.toggle('firing', firing); }

  set(key, el, v) { if (this.last[key] !== v) { this.last[key] = v; el.textContent = v; } }
  hud(s) {
    this.set('score', this.el.score, fmt(s.score));
    this.set('combo', this.el.combo, '×' + s.combo);
    this.set('best', this.el.best, fmt(Math.max(s.best, s.score)));
    this.set('wave', this.el.wave, String(s.wave));
    this.set('left', this.el.left, s.left);
    this.set('level', this.el.level, String(s.level));
    this.set('kills', this.el.kills, fmt(s.kills));
    this.set('depth', this.el.depth, fmt(4000 + s.wave * 120 - 120) + ' m');
    const xp = Math.round(s.xpK * 1000) / 10;
    if (this.last.xp !== xp) { this.last.xp = xp; this.el.xp.style.width = xp + '%'; }
    const hpKey = s.hp + '/' + s.maxHp;
    if (this.last.hp !== hpKey) {
      const prev = this.last.hpVal ?? s.hp;
      this.el.hp.innerHTML = '';
      for (let i = 0; i < s.maxHp; i++) { const c = document.createElement('i'); if (i >= s.hp) c.className = 'off' + (i < prev ? ' lost' : ''); this.el.hp.appendChild(c); }
      this.last.hp = hpKey; this.last.hpVal = s.hp;
    }
    this.ability(this.el.dash, s.dashK, 'd');
    this.ability(this.el.sonar, s.sonarK, 's');
    if (s.boss) {
      this.el.boss.hidden = false;
      const w = Math.max(0, s.boss) * 100;
      if (Math.abs((this.last.boss ?? -1) - w) > 0.2) { this.last.boss = w; this.el.bossFill.style.width = w + '%'; }
    } else if (!this.el.boss.hidden) this.el.boss.hidden = true;
    this.el.hurt.classList.toggle('low', s.hp === 1);
  }
  ability(el, k, key) {
    const v = Math.round(k * 100) / 100;
    if (this.last[key] === v) return;
    this.last[key] = v;
    el.firstElementChild.style.setProperty('--p', v);
    el.classList.toggle('ready', v >= 1);
  }
  bumpCombo() { this.el.combo.classList.add('bump'); setTimeout(() => this.el.combo.classList.remove('bump'), 120); }
  toast(text, color = 'cyan', small = false) {
    const t = document.createElement('div');
    t.className = 'toast ' + color + (small ? ' small' : ''); t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 1650);
  }
  clearToasts() { this.el.toasts.innerHTML = ''; }
  hurt() { this.el.hurt.classList.remove('low'); this.el.hurt.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => this.el.hurt.classList.remove('on'))); }

  levelUp(level, choices, levels, onPick) {
    $('lvlNum').textContent = level;
    this.el.cards.innerHTML = '';
    choices.forEach((u, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'upg';
      const cur = levels[u.id] || 0;
      b.innerHTML = `<kbd class="key">${i + 1}</kbd><div class="ico">${icon(u.id)}</div><h3>${u.name}</h3><p>${u.desc}</p>
        <div class="pips">${Array.from({ length: u.max }, (_, k) => `<i class="${k < cur ? 'on' : k === cur ? 'new' : ''}"></i>`).join('')}</div>`;
      b.addEventListener('click', () => onPick(i));
      this.el.cards.appendChild(b);
    });
    this.show('level');
    setTimeout(() => this.el.cards.firstChild?.focus({ preventScroll: true }), 80);
  }
  build(levels, list) {
    $('buildList').innerHTML = list.filter(u => levels[u.id]).map(u => `<span>${u.name} ${levels[u.id]}</span>`).join('');
  }
  setTitleStats(best, wave) { $('titleBest').textContent = fmt(best); $('titleWave').textContent = String(wave); }
  over(r) {
    $('finalScore').textContent = fmt(r.score);
    $('stWave').textContent = String(r.wave); $('stKills').textContent = fmt(r.kills); $('stLevel').textContent = String(r.level);
    $('stTime').textContent = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
    $('stBest').textContent = fmt(r.best); $('newBest').hidden = !r.newBest;
  }
  setMuteLabels(m) { const t = 'Sound: ' + (m ? 'Off' : 'On'); $('btnMute').textContent = t; $('muteLabelP').textContent = t; }
  setQualityLabels(q) { const t = 'Quality: ' + (q === 'high' ? 'High' : 'Low'); $('btnQuality').textContent = t; $('qualityLabelP').textContent = t; }
}
