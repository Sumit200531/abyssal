/** Keyboard + mouse state with one-shot "pressed this frame" events. */
const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, left: false, right: false, moved: false };
    this.clicks = { left: 0, right: 0 };
    addEventListener('keydown', e => {
      if (BLOCK.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('pointermove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true; }, { passive: true });
    canvas.addEventListener('pointerdown', e => {
      if (e.button === 0) { this.mouse.left = true; this.clicks.left++; }
      if (e.button === 2) { this.mouse.right = true; this.clicks.right++; }
    });
    addEventListener('pointerup', e => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    const lost = () => { this.down.clear(); this.mouse.left = this.mouse.right = false; this.onBlur && this.onBlur(); };
    addEventListener('blur', lost);
    document.addEventListener('visibilitychange', () => { if (document.hidden) lost(); });
  }
  is(...c) { return c.some(k => this.down.has(k)); }
  hit(...c) { return c.some(k => this.pressed.has(k)); }
  endFrame() { this.pressed.clear(); this.clicks.left = this.clicks.right = 0; }

  get moveX() { return (this.is('KeyD', 'ArrowRight') ? 1 : 0) - (this.is('KeyA', 'ArrowLeft') ? 1 : 0); }
  get moveZ() { return (this.is('KeyS', 'ArrowDown') ? 1 : 0) - (this.is('KeyW', 'ArrowUp') ? 1 : 0); }
  get fire() { return this.mouse.left; }
  get dash() { return this.hit('Space', 'ShiftLeft', 'ShiftRight'); }
  get sonar() { return this.hit('KeyE') || this.clicks.right > 0; }
}
