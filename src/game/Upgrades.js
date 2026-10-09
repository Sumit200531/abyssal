/** Roguelite upgrade catalogue. Each pick changes the sub's stats. */
const I = {
  rate: '<path d="M4 12h8M4 7h12M4 17h12"/><path d="M17 5l3 7-3 7"/>',
  dmg: '<path d="M12 3l2.5 6H21l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h6.5z"/>',
  twin: '<path d="M4 9h12M4 15h12"/><path d="M15 6l4 3-4 3M15 12l4 3-4 3"/>',
  pierce: '<path d="M3 12h18"/><path d="M17 8l4 4-4 4"/><circle cx="9" cy="12" r="3"/>',
  speed: '<path d="M4 12h10"/><path d="M11 7l6 5-6 5"/><path d="M19 6v12"/>',
  hull: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M12 9v6M9 12h6"/>',
  thrust: '<path d="M5 19l14-14"/><path d="M9 5h10v10"/><path d="M4 14l2 2M8 18l2 2"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/>',
  sonar: '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15"/>',
  dash: '<path d="M3 12h11"/><path d="M10 6l6 6-6 6"/><path d="M19 5v14"/>'
};

export const UPGRADES = [
  { id: 'rate', name: 'Rapid Pulse', desc: 'Fire 20% faster.', max: 5, apply: s => { s.fireRate *= 1.2; } },
  { id: 'dmg', name: 'Dense Light', desc: 'Bolts deal 30% more damage.', max: 5, apply: s => { s.damage *= 1.3; } },
  { id: 'twin', name: 'Split Beam', desc: 'Fire one extra bolt in a spread.', max: 4, apply: s => { s.shots += 1; } },
  { id: 'pierce', name: 'Lance', desc: 'Bolts pass through one more creature.', max: 3, apply: s => { s.pierce += 1; } },
  { id: 'speed', name: 'Hot Plasma', desc: 'Bolts travel 25% faster and further.', max: 3, apply: s => { s.boltSpeed *= 1.25; } },
  { id: 'hull', name: 'Pressure Hull', desc: '+1 max hull and repair 1 now.', max: 4, apply: (s, p) => { p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 1); } },
  { id: 'thrust', name: 'Thrusters', desc: 'Move 12% faster.', max: 3, apply: s => { s.speed *= 1.12; } },
  { id: 'magnet', name: 'Plankton Net', desc: 'Pull in plankton from 45% further.', max: 3, apply: s => { s.magnet *= 1.45; } },
  { id: 'sonar', name: 'Deep Sonar', desc: 'Sonar recharges 25% faster and reaches further.', max: 3, apply: s => { s.sonarCd *= 0.75; s.sonarR *= 1.2; } },
  { id: 'dash', name: 'Jet Burst', desc: 'Dash recharges 30% faster.', max: 3, apply: s => { s.dashCd *= 0.7; } }
];

export function icon(id) { return `<svg viewBox="0 0 24 24">${I[id]}</svg>`; }

/** pick three different upgrades that aren't maxed out */
export function rollChoices(levels) {
  const avail = UPGRADES.filter(u => (levels[u.id] || 0) < u.max);
  const out = [];
  while (out.length < 3 && avail.length) out.push(avail.splice((Math.random() * avail.length) | 0, 1)[0]);
  return out;
}
