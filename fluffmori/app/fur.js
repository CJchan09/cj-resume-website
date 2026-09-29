/* Layered, touchable plush. All positions exposed by the public API are CSS pixels. */
const TAU = Math.PI * 2;
export const FUR_TIMING = Object.freeze({ holdMs: 3000, returnMs: 2000, settleMs: 400 });
const DEFAULT_STYLE = {
  id: 'otter', base: '#eacb9c', light: '#fff2d6', shadow: '#c79d72',
  furLength: 22, stiffness: 1, curl: 0.18,
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smoothstep = (a, b, n) => { const t = clamp((n - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrappedAngle = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
function retainedBend(age) {
  const t = clamp((age - FUR_TIMING.holdMs) / FUR_TIMING.returnMs, 0, 1);
  return 1 - t * t * t * (t * (t * 6 - 15) + 10);
}
function spring(value, velocity, target, omega, dt, out) {
  const displacement = value - target;
  const impulse = velocity + omega * displacement;
  const decay = Math.exp(-omega * dt);
  out.value = target + (displacement + impulse * dt) * decay;
  out.velocity = (velocity - omega * impulse * dt) * decay;
  if (Math.abs(out.value - target) < 0.00015 && Math.abs(out.velocity) < 0.0015) {
    out.value = target; out.velocity = 0;
  }
}

// Bending rotates the whole strand about its pinned root. Its tip never stretches
// beyond the original length, including when a downward strand is brushed upward.
export function getHairGeometry(hair, moving = true, out = {}) {
  const press = moving ? hair.press : 0;
  const comb = moving ? hair.comb : 0;
  const angle = hair.restAngle + (moving ? hair.angle : 0);
  const length = hair.length * (1 - press * 0.13 - comb * 0.1);
  const nx = -Math.sin(angle), ny = Math.cos(angle);
  const ex = Math.cos(angle) * length, ey = Math.sin(angle) * length;
  const bend = hair.bend * (1 - comb * 0.78) * (1 - press * 0.25);
  const anchor = comb * 0.14;
  out.x = hair.x; out.y = hair.y;
  out.tipX = hair.x + ex; out.tipY = hair.y + ey;
  out.cx = hair.x + hair.ex * anchor + ex * (0.5 - anchor) + nx * bend;
  out.cy = hair.y + hair.ey * anchor + ey * (0.5 - anchor) + ny * bend;
  out.nx = nx; out.ny = ny;
  out.width = hair.width * (1 + comb * 0.4 + press * 0.15);
  return out;
}
function rgb(hex) {
  const value = String(hex || '#eacb9c').replace('#', '');
  const h = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
}
function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function color(a) { return `rgb(${a[0]},${a[1]},${a[2]})`; }
function translucent(a, opacity) { return `rgba(${a[0]},${a[1]},${a[2]},${opacity})`; }
function randomGenerator(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function styleSeed(id) { let n = 221071; for (const c of String(id)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }

export class FurField {
  constructor(canvas, { onActivity, reducedMotion } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('FurField needs a canvas.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!this.ctx) throw new Error('Canvas 2D is not available.');
    this.undercoat = document.createElement('canvas');
    this.rest = document.createElement('canvas');
    this.underCtx = this.undercoat.getContext('2d', { alpha: false });
    this.restCtx = this.rest.getContext('2d', { alpha: false });
    this.style = { ...DEFAULT_STYLE };
    this.onActivity = typeof onActivity === 'function' ? onActivity : null;
    this.pointers = new Map();
    this.moving = new Set();
    this.hairs = [];
    this.width = this.height = 0;
    this.tileSize = 88;
    this.frame = 0;
    this.paused = false;
    this.destroyed = false;
    this.averageFrameMs = 0;
    this.renderSamples = 0;
    this.lastTime = 0;
    this.lastIdleFrame = 0;
    this.lastActivity = 0;
    this.sceneDirty = false;
    this.suspendedAt = null;
    this.geometry = {};
    this.springResult = {};
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    // A host can combine its own motion setting with the OS preference. Until
    // then, standalone uses keep following the OS as they did before.
    this.motionOverride = typeof reducedMotion === 'boolean' ? reducedMotion : null;
    this.reducedMotion = this.motionOverride ?? this.motionQuery.matches;
    this._tick = now => this.tick(now);
    this._visibility = () => this.syncPause();
    this._motionChange = event => {
      if (this.motionOverride !== null) return;
      this.reducedMotion = event.matches;
      this.sceneDirty = true;
      this.start();
    };
    this._resize = () => this.resize();
    document.addEventListener('visibilitychange', this._visibility);
    this.motionQuery.addEventListener?.('change', this._motionChange);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this._resize);
      this.observer.observe(canvas);
    } else window.addEventListener('resize', this._resize);
    this.resize();
  }

  setStyle(style = {}) {
    if (this.destroyed) return;
    const next = { ...DEFAULT_STYLE, ...style };
    const rawLength = Number(next.furLength);
    next.furLength = clamp(Number.isFinite(rawLength) ? (rawLength <= 3 ? rawLength * 22 : rawLength) : 22, 12, 36);
    next.stiffness = clamp(Number(next.stiffness) || 1, 0.4, 1.8);
    next.curl = clamp(Number(next.curl) || 0, 0, 1);
    this.style = next;
    this.pointers.clear();
    this.moving.clear();
    if (this.width && this.height) this.build();
    this.start();
  }

  setReducedMotion(reducedMotion) {
    if (this.destroyed) return;
    this.motionOverride = Boolean(reducedMotion);
    if (this.reducedMotion === this.motionOverride) return;
    this.reducedMotion = this.motionOverride;
    this.sceneDirty = true;
    this.lastIdleFrame = 0;
    this.start();
  }

  resize() {
    if (this.destroyed) return;
    const box = this.canvas.getBoundingClientRect();
    const w = Math.round(box.width), h = Math.round(box.height);
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1500000 / (w * h)));
    if (w === this.width && h === this.height && Math.abs(dpr - this.dpr) < 0.01) return;
    this.width = w; this.height = h; this.dpr = dpr;
    for (const c of [this.canvas, this.undercoat, this.rest]) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    for (const ctx of [this.ctx, this.underCtx, this.restCtx]) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pointers.clear();
    this.moving.clear();
    this.build();
    this.start();
  }

  build() {
    const { width: w, height: h, style: s } = this;
    const rand = randomGenerator(styleSeed(s.id));
    const base = rgb(s.base), light = rgb(s.light), shadow = rgb(s.shadow);
    this.pressureColors = {
      shadow: translucent(shadow, 0.23), shadowFade: translucent(shadow, 0.09), shadowClear: translucent(shadow, 0),
      light: translucent(light, 0.16), lightClear: translucent(light, 0),
    };
    const uc = this.underCtx;
    const ground = uc.createLinearGradient(0, 0, w * 0.18, h);
    ground.addColorStop(0, color(mix(base, light, 0.3)));
    ground.addColorStop(0.56, color(base));
    ground.addColorStop(1, color(mix(base, light, 0.53)));
    uc.fillStyle = ground; uc.fillRect(0, 0, w, h);
    const glow = uc.createRadialGradient(w * 0.43, h * 0.34, 0, w * 0.43, h * 0.34, Math.max(w, h * 0.63));
    glow.addColorStop(0, translucent(light, 0.23));
    glow.addColorStop(0.65, translucent(light, 0.035));
    glow.addColorStop(1, translucent(shadow, 0.08));
    uc.fillStyle = glow; uc.fillRect(0, 0, w, h);

    // Cached soft clumps create volume at two scales, without per-frame blur or
    // gradients on thousands of strands. Their edges dissolve into the ground.
    for (const scale of [84, 29]) {
      const columns = Math.ceil(w / scale), rows = Math.ceil(h / scale);
      for (let row = -1; row <= rows; row++) for (let col = -1; col <= columns; col++) {
        const x = (col + 0.2 + rand() * 0.65) * scale;
        const y = (row + 0.2 + rand() * 0.65) * scale;
        const radius = scale * (0.65 + rand() * 0.65);
        const bright = rand() > 0.39;
        const pigment = bright ? light : shadow;
        const cloud = uc.createRadialGradient(x, y, 0, x, y, radius);
        const strength = (bright ? 0.11 : 0.065) * (scale > 40 ? 1 : 0.7);
        cloud.addColorStop(0, translucent(pigment, strength));
        cloud.addColorStop(0.43, translucent(pigment, strength * 0.5));
        cloud.addColorStop(1, translucent(pigment, 0));
        uc.fillStyle = cloud; uc.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }

    // Fine underfur is short and low contrast: it fills between the larger tufts
    // without covering the whole surface in equally long, high-contrast lines.
    const napCount = Math.min(21000, Math.round(w * h / 17));
    const napColors = Array.from({ length: 8 }, (_, i) => color(mix(base, i < 3 ? shadow : light, i < 3 ? 0.055 + i * 0.018 : 0.07 + (i - 3) * 0.037)));
    for (let shade = 0; shade < napColors.length; shade++) {
      uc.beginPath(); uc.strokeStyle = napColors[shade]; uc.lineWidth = 0.58; uc.lineCap = 'round';
      for (let i = shade; i < napCount; i += napColors.length) {
        const x = rand() * (w + 20) - 10, y = rand() * (h + 20) - 10;
        const length = 1.8 + rand() * 4.4;
        const lean = (rand() - 0.5) * 2.8 + Math.sin(x * 0.022 + y * 0.015) * 2;
        uc.moveTo(x, y); uc.quadraticCurveTo(x + lean * 0.1, y + length * 0.52, x + lean, y + length);
      }
      uc.stroke();
    }

    this.columns = Math.ceil(w / this.tileSize);
    this.rows = Math.ceil(h / this.tileSize);
    // Rotation is length-bounded, so even the softest style needs only this small halo.
    this.maxHairReach = s.furLength * 1.3 + 10;
    this.paintCellRadius = Math.ceil(this.maxHairReach / this.tileSize);
    this.cells = Array.from({ length: this.columns * this.rows }, () => []);
    this.dirtyTiles = new Uint8Array(this.columns * this.rows);
    this.nearbyCells = new Uint8Array(this.columns * this.rows);
    const count = clamp(Math.round(w * h / 56), 1800, 9000);
    const aspect = w / h;
    const gridX = Math.max(1, Math.round(Math.sqrt(count * aspect)));
    const gridY = Math.max(1, Math.ceil(count / gridX));
    this.hairs = [];
    const palette = Array.from({ length: 6 }, (_, band) => Array.from({ length: 16 }, (_, shade) => {
      const belly = band / 5 * 0.36;
      const floor = mix(base, light, belly);
      return color(shade < 5 ? mix(floor, shadow, 0.035 + (5 - shade) * 0.023) : mix(floor, light, 0.075 + (shade - 5) * 0.029));
    }));
    const shine = Array.from({ length: 6 }, (_, band) => color(mix(base, light, 0.53 + band * 0.035)));
    const combPalette = palette.map(band => band.map(restColor => {
      const channels = restColor.match(/\d+/g).map(Number);
      return Array.from({ length: 6 }, (_, level) => color(mix(channels, shadow, level * 0.036)));
    }));
    const edgePalette = palette.map(band => band.map(restColor => {
      const channels = restColor.match(/\d+/g).map(Number);
      return color(mix(channels, light, 0.26));
    }));
    for (let row = 0; row < gridY; row++) {
      for (let col = 0; col < gridX; col++) {
        const x = (col + rand()) / gridX * (w + 20) - 10;
        const y = (row + rand()) / gridY * (h + 30) - 15;
        // Neighbours share a soft sweep and tone, with small individual variation.
        // This creates clumps instead of a uniform field of unrelated needles.
        const sweep = Math.sin(x * 0.023 + y * 0.012) * 0.29 + Math.sin(y * 0.032 - x * 0.013) * 0.2;
        const a = Math.PI / 2 + (x / w - 0.5) * 0.4 + sweep + (rand() - 0.5) * 0.4;
        const clump = Math.sin(x * 0.047 + y * 0.019) * Math.cos(y * 0.038 - x * 0.011);
        const length = s.furLength * (0.55 + rand() * 0.65 + clump * 0.09);
        const band = Math.round(smoothstep(0.5, 1, y / h) * 5);
        const bend = ((rand() - 0.5) * 0.36 + sweep * 0.3) * length * (0.8 + s.curl * 1.45);
        const width = (3.1 + rand() * 3.2) * (0.9 + s.curl * 0.18);
        const shade = clamp(Math.round(8 + clump * 4.1 + (rand() - 0.5) * 7), 0, 15);
        const hair = {
          x, y, length, restAngle: a, ex: Math.cos(a) * length, ey: Math.sin(a) * length,
          bend, width, color: palette[band][shade], combColors: combPalette[band][shade], shine: shine[band], edge: edgePalette[band][shade],
          highlighted: rand() > 0.9, split: rand() > 0.38,
          angle: 0, angularVelocity: 0, heldAngle: 0,
          comb: 0, combVelocity: 0, heldComb: 0,
          press: 0, vp: 0, targetPress: 0, touched: 0,
        };
        const index = this.hairs.push(hair) - 1;
        this.cells[this.cellIndex(x, y)].push(index);
      }
    }
    this.restCtx.drawImage(this.undercoat, 0, 0, w, h);
    for (const hair of this.hairs) this.drawHair(this.restCtx, hair, false);
    this.ctx.drawImage(this.rest, 0, 0, w, h);
    this.sceneDirty = false;
    this.lastTime = 0;
  }

  cellIndex(x, y) {
    return clamp(Math.floor(y / this.tileSize), 0, this.rows - 1) * this.columns + clamp(Math.floor(x / this.tileSize), 0, this.columns - 1);
  }

  drawHair(ctx, hair, moving) {
    const { cx, cy, tipX, tipY, nx: normalX, ny: normalY, width } = getHairGeometry(hair, moving, this.geometry);
    ctx.fillStyle = moving ? hair.combColors[Math.round(clamp(hair.comb, 0, 1) * 5)] : hair.color;
    ctx.beginPath();
    ctx.moveTo(hair.x - normalX * width * 0.33, hair.y - normalY * width * 0.33);
    ctx.quadraticCurveTo(cx - normalX * width * 0.52, cy - normalY * width * 0.52, tipX, tipY);
    ctx.quadraticCurveTo(cx + normalX * width * 0.52, cy + normalY * width * 0.52, hair.x + normalX * width * 0.33, hair.y + normalY * width * 0.33);
    ctx.closePath(); ctx.fill();
    // Two fine, uneven tips break up the broad tuft silhouette. They rotate with
    // the same pinned root, so brushing never leaves static bright threads behind.
    if (hair.split) {
      const endX = hair.x * 0.035 + cx * 0.26 + tipX * 0.705;
      const endY = hair.y * 0.035 + cy * 0.26 + tipY * 0.705;
      ctx.strokeStyle = moving && hair.comb > 0.15 ? hair.edge : hair.color;
      ctx.lineWidth = moving ? 0.57 : 0.43;
      ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(hair.x + normalX * width * 0.15, hair.y + normalY * width * 0.15);
      ctx.quadraticCurveTo(cx + normalX * width * 0.37, cy + normalY * width * 0.37, endX + normalX * width * 0.42, endY + normalY * width * 0.42);
      ctx.moveTo(hair.x - normalX * width * 0.18, hair.y - normalY * width * 0.18);
      ctx.quadraticCurveTo(cx - normalX * width * 0.31, cy - normalY * width * 0.31, tipX - normalX * width * 0.18, tipY - normalY * width * 0.18);
      ctx.stroke();
    }
    if (hair.highlighted) {
      ctx.strokeStyle = hair.shine; ctx.lineWidth = 0.36;
      ctx.beginPath();
      ctx.moveTo(hair.x * 0.6084 + cx * 0.3432 + tipX * 0.0484, hair.y * 0.6084 + cy * 0.3432 + tipY * 0.0484);
      ctx.quadraticCurveTo(cx, cy, tipX, tipY); ctx.stroke();
    }
  }

  pointer(id, x, y, dx = 0, dy = 0) {
    if (this.destroyed || this.paused || !this.width || document.hidden) return;
    if (![x, y, dx, dy].every(Number.isFinite)) return;
    const now = performance.now();
    const previous = this.pointers.get(id);
    const speed = Math.hypot(dx, dy);
    const dragging = speed > 0.15;
    const pointer = {
      id,
      x: clamp(x, 0, this.width), y: clamp(y, 0, this.height),
      dragAngle: dragging ? Math.atan2(dy, dx) : previous?.dragAngle ?? null,
      radius: dragging ? 78 + Math.min(20, speed * 0.55) : previous?.radius || 78,
      affected: previous?.affected || new Set(), last: now,
    };
    this.pointers.set(id, pointer);
    const travel = previous ? Math.hypot(pointer.x - previous.x, pointer.y - previous.y) : 0;
    const samples = Math.min(32, Math.max(1, Math.ceil(travel / (pointer.radius * 0.35))));
    for (let step = 1; step <= samples; step++) {
      const fraction = step / samples;
      this.applyPointer(pointer, now,
        previous ? previous.x + (pointer.x - previous.x) * fraction : pointer.x,
        previous ? previous.y + (pointer.y - previous.y) * fraction : pointer.y);
    }
    // applyPointer replaces affected at every sample: only the final footprint is
    // kept alive by a stationary finger or stamped again when that finger lifts.
    this.sceneDirty = true;
    if (this.onActivity && now - this.lastActivity > 75) {
      this.lastActivity = now;
      this.onActivity({ x, y, speed, pointerCount: this.pointers.size });
    }
    this.start();
  }

  applyPointer(pointer, now, x = pointer.x, y = pointer.y) {
    const { radius } = pointer;
    const reach = radius + this.maxHairReach * 0.55;
    const c0 = clamp(Math.floor((x - reach) / this.tileSize), 0, this.columns - 1);
    const c1 = clamp(Math.floor((x + reach) / this.tileSize), 0, this.columns - 1);
    const r0 = clamp(Math.floor((y - reach) / this.tileSize), 0, this.rows - 1);
    const r1 = clamp(Math.floor((y + reach) / this.tileSize), 0, this.rows - 1);
    pointer.affected.clear();
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      for (const i of this.cells[row * this.columns + col]) {
        const hair = this.hairs[i];
        const px = hair.x + hair.ex * 0.55 - x, py = hair.y + hair.ey * 0.55 - y;
        const distance = Math.hypot(px, py);
        if (distance >= radius) continue;
        const weight = 1 - smoothstep(0.22, 1, distance / radius);
        const dragged = pointer.dragAngle !== null;
        const desiredDirection = dragged ? pointer.dragAngle : Math.atan2(py, px);
        const turn = wrappedAngle(desiredDirection - hair.restAngle);
        // Passing out of a footprint must not overwrite a strong comb mark with
        // the weak trailing edge of the same swipe. Preserve the laid-down nap.
        const previousComb = hair.heldComb * retainedBend(now - hair.touched);
        const strength = Math.max(weight, previousComb);
        let target = dragged
          ? turn * strength * clamp(1.05 - this.style.stiffness * 0.035, 0.97, 1)
          : previousComb > 0.4 ? hair.heldAngle : turn * weight * 0.23;
        // Avoid a full spin when an upward stroke crosses the -PI / +PI boundary.
        target += Math.round((hair.heldAngle - target) / TAU) * TAU;
        hair.heldAngle = clamp(target, -TAU, TAU);
        hair.heldComb = Math.max(previousComb, dragged ? weight : weight * 0.22);
        hair.targetPress = weight * (dragged ? 0.5 : 0.9);
        hair.touched = now;
        pointer.affected.add(i);
        this.moving.add(i);
      }
    }
  }

  release(id) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    const now = performance.now();
    for (const i of pointer.affected) this.hairs[i].touched = now;
    this.pointers.delete(id); this.sceneDirty = true; this.start();
  }

  releasePointers(now) {
    for (const pointer of this.pointers.values()) for (const i of pointer.affected) this.hairs[i].touched = now;
    if (this.pointers.size) this.sceneDirty = true;
    this.pointers.clear();
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.syncPause();
  }

  syncPause() {
    const now = performance.now();
    if (this.paused || document.hidden) {
      if (this.suspendedAt === null) { this.releasePointers(now); this.suspendedAt = now; }
      this.stop();
    } else {
      if (this.suspendedAt !== null) {
        const suspendedFor = Math.max(0, now - this.suspendedAt);
        for (const i of this.moving) this.hairs[i].touched += suspendedFor;
        this.suspendedAt = null;
      }
      this.lastTime = 0; this.start();
    }
  }

  start() {
    if (!this.frame && !this.destroyed && !this.paused && !document.hidden && this.width) this.frame = requestAnimationFrame(this._tick);
  }

  stop() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; }

  tick(now) {
    this.frame = 0;
    if (this.destroyed || this.paused || document.hidden) return;
    const started = performance.now();
    const dt = clamp((now - (this.lastTime || now - 16.67)) / 1000, 0.001, 0.05);
    this.lastTime = now;
    for (const pointer of this.pointers.values()) this.applyPointer(pointer, now);
    const hadMovement = this.moving.size > 0;
    let rendered = false;
    if (hadMovement) {
      let changed = this.sceneDirty;
      const omega = 18 * Math.sqrt(this.style.stiffness);
      const result = this.springResult;
      for (const i of this.moving) {
        const hair = this.hairs[i];
        const age = now - hair.touched;
        const previousAngle = hair.angle, previousComb = hair.comb, previousPress = hair.press;
        if (age > 70) {
          hair.targetPress *= Math.exp(-dt * 10);
          if (hair.targetPress < 0.00015) hair.targetPress = 0;
          const turns = Math.round(hair.heldAngle / TAU) * TAU;
          hair.heldAngle -= turns; hair.angle -= turns;
        }
        const retention = retainedBend(age);
        spring(hair.angle, hair.angularVelocity, hair.heldAngle * retention, omega, dt, result);
        hair.angle = result.value; hair.angularVelocity = result.velocity;
        spring(hair.comb, hair.combVelocity, hair.heldComb * retention, omega, dt, result);
        hair.comb = result.value; hair.combVelocity = result.velocity;
        spring(hair.press, hair.vp, hair.targetPress, 24, dt, result);
        hair.press = result.value; hair.vp = result.velocity;
        if (Math.abs(previousAngle - hair.angle) + Math.abs(previousComb - hair.comb) + Math.abs(previousPress - hair.press) > 0.000001) changed = true;
        if (age >= FUR_TIMING.holdMs + FUR_TIMING.returnMs + FUR_TIMING.settleMs) {
          hair.angle = hair.angularVelocity = hair.heldAngle = hair.comb = hair.combVelocity = hair.heldComb = hair.press = hair.vp = hair.targetPress = 0;
          this.moving.delete(i);
          changed = true;
        }
      }
      if (changed) {
        this.dirtyTiles.fill(0);
        for (const i of this.moving) this.markTiles(this.hairs[i]);
        this.render(now, true); rendered = true;
        this.sceneDirty = false;
      }
    } else if (this.reducedMotion || now - this.lastIdleFrame > 50) {
      this.render(now, false); rendered = true;
      this.lastIdleFrame = now;
    }
    const elapsed = performance.now() - started;
    if (rendered) {
      this.averageFrameMs = this.renderSamples ? this.averageFrameMs * 0.94 + elapsed * 0.06 : elapsed;
      this.renderSamples++;
    }
    if (this.moving.size || this.pointers.size || !this.reducedMotion) this.start();
  }

  markTiles(hair) {
    const padding = hair.length + hair.width + 4;
    const c0 = clamp(Math.floor((hair.x - padding) / this.tileSize), 0, this.columns - 1);
    const c1 = clamp(Math.floor((hair.x + padding) / this.tileSize), 0, this.columns - 1);
    const r0 = clamp(Math.floor((hair.y - padding) / this.tileSize), 0, this.rows - 1);
    const r1 = clamp(Math.floor((hair.y + padding) / this.tileSize), 0, this.rows - 1);
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) this.dirtyTiles[row * this.columns + col] = 1;
  }

  render(now, dynamic) {
    const ctx = this.ctx, w = this.width, h = this.height;
    ctx.drawImage(this.rest, 0, 0, w, h);
    if (dynamic && this.moving.size) {
      const dirty = this.dirtyTiles;
      ctx.save(); ctx.beginPath();
      for (let i = 0; i < dirty.length; i++) if (dirty[i]) ctx.rect(i % this.columns * this.tileSize, Math.floor(i / this.columns) * this.tileSize, this.tileSize, this.tileSize);
      ctx.clip();
      ctx.drawImage(this.undercoat, 0, 0, w, h);
      // A soft pressure shadow sits below the fibers, giving a fingertip a shallow plush indentation.
      for (const p of this.pointers.values()) {
        const shade = ctx.createRadialGradient(p.x, p.y + 6, 1, p.x, p.y + 6, p.radius * 0.76);
        shade.addColorStop(0, this.pressureColors.shadow); shade.addColorStop(0.48, this.pressureColors.shadowFade); shade.addColorStop(1, this.pressureColors.shadowClear);
        ctx.fillStyle = shade; ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
        const rim = ctx.createRadialGradient(p.x - 8, p.y - 12, p.radius * 0.34, p.x - 8, p.y - 12, p.radius);
        rim.addColorStop(0, this.pressureColors.lightClear); rim.addColorStop(0.65, this.pressureColors.light); rim.addColorStop(1, this.pressureColors.lightClear);
        ctx.fillStyle = rim; ctx.fillRect(p.x - p.radius - 8, p.y - p.radius - 12, p.radius * 2, p.radius * 2);
      }
      // Preserve the resting layer order while omitting distant fibers.
      const nearbyCells = this.nearbyCells;
      nearbyCells.fill(0);
      for (let cell = 0; cell < this.cells.length; cell++) {
        const col = cell % this.columns, row = Math.floor(cell / this.columns);
        let near = false;
        for (let ry = Math.max(0, row - this.paintCellRadius); ry <= Math.min(this.rows - 1, row + this.paintCellRadius) && !near; ry++) {
          for (let cx = Math.max(0, col - this.paintCellRadius); cx <= Math.min(this.columns - 1, col + this.paintCellRadius); cx++) if (dirty[ry * this.columns + cx]) { near = true; break; }
        }
        if (near) nearbyCells[cell] = 1;
      }
      for (const hair of this.hairs) if (nearbyCells[this.cellIndex(hair.x, hair.y)]) this.drawHair(ctx, hair, true);
      ctx.restore();
    }
    // Breathing is a tiny change in warm light, never an automatic touch or ripple.
    if (!this.reducedMotion) {
      ctx.fillStyle = `rgba(255,248,228,${0.007 + (Math.sin(now / 2300) + 1) * 0.007})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  diagnostics() {
    return {
      hairCount: this.hairs.length, width: this.width, height: this.height,
      activePointers: this.pointers.size, movingHairs: this.moving.size,
      averageFrameMs: Math.round(this.averageFrameMs * 100) / 100,
      avgFrameMs: Math.round(this.averageFrameMs * 100) / 100,
      dpr: this.dpr || 1, paused: this.paused || document.hidden, reducedMotion: this.reducedMotion,
    };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.stop();
    this.observer?.disconnect();
    window.removeEventListener('resize', this._resize);
    document.removeEventListener('visibilitychange', this._visibility);
    this.motionQuery.removeEventListener?.('change', this._motionChange);
    this.pointers.clear(); this.moving.clear(); this.hairs.length = 0;
    this.undercoat.width = this.undercoat.height = this.rest.width = this.rest.height = 1;
  }
}
