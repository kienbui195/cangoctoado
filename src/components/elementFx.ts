// Elemental effects of the auto-battle (docs CanGocToaDo/hieu-ung-nguyen-to).
// Everything here is DRAWN from the battle state (element, step, time inside the step, hit flag) plus a seed fixed per turn,
// so every browser of a room shows the same picture and nothing travels over the network. Visual only: no game state is touched.
// No Math.random / Date here on purpose: use fxRng(seed) so two draws of the same moment are identical (no flicker).
import { CHARGE_MS, IMPACT_HIT_MS, type RoyaleEngine, type RPlayer } from '../game/royaleEngine';
import { ELEMENTS, type Tier } from '../data/royaleWeapons';
import { WORLD_H, WORLD_W } from '../utils/terrain';

type Ctx = CanvasRenderingContext2D;
export type FxLevel = 0 | 1 | 2; // 0 full, 1 reduced (half the particles), 2 minimum (main shape only)

// ---------------------------------------------------------------- numbers

/** VIP 1.0, WOW 1.2, LEGEND 1.4 times the size; 1.0 / 1.3 / 1.6 times the particles (Q6). */
export function tierScale(tier: Tier): { size: number; count: number } {
  return tier === 'red' ? { size: 1.4, count: 1.6 } : tier === 'blue' ? { size: 1.2, count: 1.3 } : { size: 1, count: 1 };
}

/** Same turn, same number: a stable seed for the particles of one battle turn. */
export const fxTurnSeed = (round: number, turnInRound: number, shooter: number) => ((round + 1) * 7919 + (turnInRound + 1) * 104729 + (shooter + 1) * 1299709) >>> 0;

/** mulberry32: a small deterministic random generator returning numbers in [0, 1). */
export function fxRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FX_SLOW_MS = 28; // average frame above this for a second: one level down
export const FX_FAST_MS = 20; // average frame below this for three seconds: one level up
const FX_DOWN_WINDOW = 1000;
const FX_UP_WINDOW = 3000;
const FX_MAX_FRAME = 100; // a hidden tab hands over one giant frame: do not let it count as a slow second

/** Watches the frame times and lowers / raises the effect level with hysteresis (US-05). */
export function createQualityMeter() {
  // two windows: the time they cover and the frames inside, so the average frame is time / frames
  let slowT = 0;
  let slowN = 0;
  let fastT = 0;
  let fastN = 0;
  const m = {
    level: 0 as FxLevel,
    feed(frameMs: number) {
      const f = Math.min(FX_MAX_FRAME, Math.max(0, frameMs));
      slowT += f;
      slowN++;
      fastT += f;
      fastN++;
      if (slowT >= FX_DOWN_WINDOW) {
        if (slowT / slowN > FX_SLOW_MS) {
          if (m.level < 2) m.level = (m.level + 1) as FxLevel;
          fastT = 0;
          fastN = 0; // a slow second: the climb back starts over
        }
        slowT = 0;
        slowN = 0;
      }
      if (fastT >= FX_UP_WINDOW) {
        if (fastT / fastN < FX_FAST_MS && m.level > 0) m.level = (m.level - 1) as FxLevel;
        fastT = 0;
        fastN = 0;
      }
    },
  };
  return m;
}
/** the meter the canvas feeds every frame */
export const fxQuality = createQualityMeter();

// ---------------------------------------------------------------- small helpers

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;
const easeIn = (v: number) => clamp01(v) ** 3;
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
};
/** extra particles: all of them / half / none */
const extra = (n: number, level: FxLevel) => Math.floor(n * [1, 0.5, 0][level]);
/** main-shape counts: never fewer than `min`, so the minimum level still shows the picture */
const main = (n: number, level: FxLevel, min: number) => Math.max(min, Math.floor(n * [1, 0.7, 0.5][level]));

const EXIT_MS: Record<string, number> = { kim: 600, thuy: 600, moc: 300, hoa: 300, tho: 300 };

interface O {
  x: number; // centre of the body
  y: number; // feet
  t: number; // ms inside the step
  k: number; // 0..1 progress of the charge
  s: number; // size factor of the tier
  c: number; // particle factor of the tier
  q: FxLevel;
  rnd: () => number;
  /** 0 while charging, 0..1 while the effect leaves after the launch */
  out: number;
}

// ---------------------------------------------------------------- shapes

function sword(ctx: Ctx, len: number, w: number, blade: string, edge: string) {
  // tip at (0, -len), hilt at the origin
  ctx.fillStyle = blade;
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1, w * 0.12);
  ctx.beginPath();
  ctx.moveTo(0, -len);
  ctx.lineTo(w / 2, -len * 0.82);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(-w / 2, 0);
  ctx.lineTo(-w / 2, -len * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath(); // central ridge
  ctx.moveTo(0, -len * 0.97);
  ctx.lineTo(0, -len * 0.04);
  ctx.stroke();
  ctx.fillStyle = '#b45309'; // guard and grip
  ctx.fillRect(-w * 1.1, 0, w * 2.2, w * 0.36);
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-w * 0.2, w * 0.36, w * 0.4, len * 0.22);
}

function leaf(ctx: Ctx, size: number, rot: number, fill: string) {
  ctx.save();
  ctx.rotate(rot);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(0, -size * 0.7, size, 0);
  ctx.quadraticCurveTo(0, size * 0.7, -size, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,83,45,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();
  ctx.restore();
}

function flame(ctx: Ctx, x: number, y: number, h: number, w: number, lean: number) {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w, y - h * 0.55, x + lean, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.55, x + w, y);
  ctx.closePath();
  ctx.fill();
}

function rock(ctx: Ctx, r: number, rnd: () => number) {
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rr = r * (0.7 + rnd() * 0.4);
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#a16207';
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(253,230,138,0.35)';
  ctx.beginPath();
  ctx.arc(-r * 0.25, -r * 0.25, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

/** A water dragon as a thick tapering line along `pts` (tail first, head last) plus a head. */
function dragon(ctx: Ctx, pts: { x: number; y: number }[], thick: number, alpha: number, faceDown: boolean) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const p = i / (pts.length - 1);
    ctx.strokeStyle = i % 2 ? '#2563eb' : '#38bdf8';
    ctx.lineWidth = thick * (0.25 + 0.75 * p);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(224,242,254,0.8)'; // light along the back
  ctx.lineWidth = Math.max(1.5, thick * 0.12);
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y - thick * 0.2) : ctx.lineTo(p.x, p.y - thick * 0.2)));
  ctx.stroke();
  const h = pts[pts.length - 1];
  const d = faceDown ? 1 : 0;
  ctx.translate(h.x, h.y);
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.ellipse(0, 0, thick * 0.9, thick * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#38bdf8'; // snout
  ctx.beginPath();
  ctx.ellipse(thick * 0.55 * (1 - d), thick * 0.5 * d, thick * 0.55, thick * 0.4, d ? Math.PI / 2 : 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0f2fe'; // horns
  ctx.beginPath();
  ctx.moveTo(-thick * 0.3, -thick * 0.5);
  ctx.lineTo(-thick * 1.0, -thick * 1.2);
  ctx.lineTo(-thick * 0.05, -thick * 0.6);
  ctx.moveTo(thick * 0.2, -thick * 0.6);
  ctx.lineTo(thick * 0.55, -thick * 1.35);
  ctx.lineTo(thick * 0.6, -thick * 0.5);
  ctx.fill();
  ctx.fillStyle = '#fef08a'; // eye
  ctx.beginPath();
  ctx.arc(thick * 0.1, -thick * 0.12, thick * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(thick * 0.14, -thick * 0.12, thick * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- charge-up (on the shooter) + the way out

function chargeKim(ctx: Ctx, o: O) {
  const R0 = 80 * o.s;
  const merge = easeIn((o.k - 0.65) / 0.35);
  const spin = o.t * (0.003 + o.k * 0.004);
  const cy = o.y - 28;
  if (o.out === 0 || merge < 1) {
    // 8 swords circle the shooter, tips toward the centre; in the last 35% they slide into the middle
    for (let i = 0; i < 8; i++) {
      const a = spin + (i * Math.PI) / 4;
      const r = R0 * (1 - merge * 0.92);
      ctx.save();
      ctx.globalAlpha = 1 - merge * 0.6;
      ctx.translate(o.x + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62);
      ctx.rotate(a + (3 * Math.PI) / 2);
      sword(ctx, 46 * o.s, 9 * o.s, '#fde68a', '#a16207');
      ctx.restore();
    }
  }
  if (merge > 0) {
    const rise = o.out > 0 ? easeIn(o.out) * 280 : 0;
    ctx.save();
    ctx.globalAlpha = merge * (1 - o.out * o.out);
    ctx.translate(o.x, cy + 40 * o.s - rise);
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 26;
    const g = ctx.createLinearGradient(0, -170 * o.s, 0, 0);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#facc15');
    sword(ctx, 170 * o.s * (0.5 + merge * 0.5), 30 * o.s, g as unknown as string, '#a16207');
    ctx.restore();
  }
}

function chargeThuy(ctx: Ctx, o: O) {
  const cy = o.y - 28;
  const grow = clamp01(o.k * 1.5);
  const alpha = o.out > 0 ? 1 - o.out : 1;
  const spread = 1 + o.out * 0.8;
  const pts: { x: number; y: number }[] = [];
  const steps = main(34, o.q, 18);
  const a0 = o.t * 0.006;
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * grow;
    const a = a0 + u * Math.PI * 4;
    pts.push({ x: o.x + Math.cos(a) * 62 * o.s * spread, y: cy + 52 * o.s - u * 118 * o.s + Math.sin(a) * 20 * o.s });
  }
  if (pts.length > 1) dragon(ctx, pts, 20 * o.s, alpha, false);
  const drops = extra(Math.round(10 * o.c), o.q);
  for (let i = 0; i < drops; i++) {
    const a = o.rnd() * Math.PI * 2 + o.t * 0.004;
    const r = (60 + o.rnd() * 30) * o.s;
    ctx.fillStyle = rgba('#7dd3fc', 0.8 * alpha);
    ctx.beginPath();
    ctx.arc(o.x + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6 + 20, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function chargeMoc(ctx: Ctx, o: O) {
  const n = main(Math.round((10 + 14 * o.k) * o.c), o.q, 6);
  const alpha = 1 - o.out;
  for (let i = 0; i < n; i++) {
    const phase = o.rnd();
    const rad = (46 + o.rnd() * 46) * o.s * (1 + o.out * 0.6);
    const a = o.t * (0.004 + o.k * 0.003) + phase * Math.PI * 2;
    const lift = ((o.t * 0.0004 + phase) % 1) * 120 * o.s;
    ctx.save();
    ctx.globalAlpha = alpha * (0.55 + 0.45 * o.k);
    ctx.translate(o.x + Math.cos(a) * rad, o.y + 10 - lift + Math.sin(a) * rad * 0.28);
    leaf(ctx, (9 + o.rnd() * 6) * o.s, a * 2 + i, i % 3 ? '#4ade80' : '#16a34a');
    ctx.restore();
  }
}

function chargeHoa(ctx: Ctx, o: O) {
  const alpha = 1 - o.out;
  const n = main(9, o.q, 5);
  const cy = o.y - 20;
  const g = ctx.createRadialGradient(o.x, cy, 6, o.x, cy, 100 * o.s);
  g.addColorStop(0, rgba('#fde047', 0.5 * o.k * alpha));
  g.addColorStop(1, rgba('#ef4444', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, cy, 100 * o.s, 0, Math.PI * 2);
  ctx.fill();
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (layer ? 0.3 : 0);
      const ph = o.rnd() * 6;
      const fl = Math.sin(o.t * 0.02 + ph);
      const h = (30 + o.k * 70 + fl * 12) * o.s * (layer ? 0.6 : 1);
      ctx.save();
      ctx.globalAlpha = alpha * (0.5 + 0.5 * o.k);
      ctx.fillStyle = layer ? '#fde047' : i % 2 ? '#f97316' : '#ef4444';
      flame(ctx, o.x + Math.cos(a) * 46 * o.s, o.y + 6 + Math.sin(a) * 12, h, 11 * o.s, fl * 8);
      ctx.restore();
    }
  }
}

function chargeTho(ctx: Ctx, o: O) {
  const n = main(6, o.q, 4);
  for (let i = 0; i < n; i++) {
    const a = o.t * 0.0025 + (i / n) * Math.PI * 2;
    const bob = Math.sin(o.t * 0.006 + i * 1.7) * 8;
    const rad = 70 * o.s * (1 + o.out * 0.5);
    ctx.save();
    ctx.globalAlpha = (1 - o.out) * (0.45 + 0.55 * o.k);
    ctx.translate(o.x + Math.cos(a) * rad, o.y - 40 + Math.sin(a) * rad * 0.32 + bob);
    ctx.rotate(a * 2);
    rock(ctx, (10 + o.rnd() * 7 + o.k * 5) * o.s, o.rnd);
    ctx.restore();
  }
  const dust = extra(Math.round(8 * o.c), o.q);
  for (let i = 0; i < dust; i++) {
    const a = o.rnd() * Math.PI * 2 + o.t * 0.003;
    ctx.fillStyle = rgba('#d6d3d1', 0.5 * (1 - o.out));
    ctx.beginPath();
    ctx.arc(o.x + Math.cos(a) * 80 * o.s, o.y + 4 + Math.sin(a) * 10, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

const CHARGE: Record<string, (ctx: Ctx, o: O) => void> = { kim: chargeKim, thuy: chargeThuy, moc: chargeMoc, hoa: chargeHoa, tho: chargeTho };

// ---------------------------------------------------------------- impact (on the target, 2200 ms)

function impactKim(ctx: Ctx, o: O) {
  const t = o.t;
  const headY = o.y - 84;
  const len = 150 * o.s;
  const appear = clamp01(t / 350);
  const fall = easeIn((t - 350) / 300);
  const tipY = headY - 230 + fall * 230;
  const fadeOut = clamp01((IMPACT_HIT_MS - t) / 500);
  ctx.save();
  ctx.globalAlpha = appear * fadeOut;
  ctx.translate(o.x, tipY - len);
  ctx.rotate(Math.PI); // red sword drops tip first
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 24;
  sword(ctx, len, 26 * o.s, '#ef4444', '#7f1d1d');
  ctx.restore();
  if (t >= 650) {
    const p = clamp01((t - 650) / 900);
    const rays = main(14, o.q, 8);
    ctx.save();
    ctx.strokeStyle = rgba('#fecaca', (1 - p) * fadeOut);
    ctx.lineWidth = 5 * (1 - p) + 1;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + 0.2;
      const r0 = 20 * o.s;
      const r1 = r0 + easeOut(p) * 150 * o.s;
      ctx.beginPath();
      ctx.moveTo(o.x + Math.cos(a) * r0, headY + Math.sin(a) * r0);
      ctx.lineTo(o.x + Math.cos(a) * r1, headY + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(o.x, headY, 14 + easeOut(p) * 90 * o.s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const sp = extra(Math.round(14 * o.c), o.q);
    for (let i = 0; i < sp; i++) {
      const a = o.rnd() * Math.PI * 2;
      const v = (0.05 + o.rnd() * 0.12) * o.s;
      const d = (t - 650) * v;
      ctx.fillStyle = rgba('#fde68a', (1 - p) * fadeOut);
      ctx.beginPath();
      ctx.arc(o.x + Math.cos(a) * d, headY + Math.sin(a) * d + (t - 650) * 0.02, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function impactThuy(ctx: Ctx, o: O) {
  const t = o.t;
  const headY = o.y - 150 * o.s;
  const appear = easeOut(t / 300);
  const fadeOut = clamp01((IMPACT_HIT_MS - t) / 400);
  const alpha = appear * fadeOut;
  const pts: { x: number; y: number }[] = [];
  const steps = main(24, o.q, 14);
  for (let i = 0; i <= steps; i++) {
    const u = 1 - i / steps; // 1 at the tail
    pts.push({ x: o.x + 20 + u * 130 * o.s + Math.sin(u * 7 - t * 0.008) * 16 * o.s, y: headY - 20 - u * 190 * o.s * appear });
  }
  pts.push({ x: o.x, y: headY });
  dragon(ctx, pts, 30 * o.s, alpha, true);
  // high-pressure jets: straight, narrow, bright, with a fast dash moving along them
  const len = clamp01((t - 250) / 160) * 175 * o.s * 1.0;
  if (len > 0) {
    const angles = [-0.42, -0.2, 0, 0.2, 0.42];
    const lvl = o.q === 2 ? 3 : 5;
    ctx.save();
    ctx.globalAlpha = fadeOut;
    ctx.lineCap = 'round';
    for (let i = 0; i < lvl; i++) {
      const a = angles[lvl === 3 ? i + 1 : i];
      const dx = Math.sin(a);
      const dy = Math.cos(a);
      const mx = o.x - 6;
      const my = headY + 14;
      ctx.strokeStyle = 'rgba(56,189,248,0.55)';
      ctx.lineWidth = 11 * o.s;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + dx * len, my + dy * len);
      ctx.stroke();
      ctx.strokeStyle = '#f0f9ff';
      ctx.lineWidth = 4 * o.s;
      ctx.setLineDash([30, 12]);
      ctx.lineDashOffset = -t * 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + dx * len, my + dy * len);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
    // splash where the jets hit the body
    const pulse = (t % 420) / 420;
    ctx.save();
    ctx.strokeStyle = rgba('#e0f2fe', (1 - pulse) * fadeOut);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(o.x, o.y - 40, 30 + pulse * 70 * o.s, 12 + pulse * 28 * o.s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const drops = extra(Math.round(22 * o.c), o.q);
    for (let i = 0; i < drops; i++) {
      const a = -Math.PI * o.rnd();
      const v = 0.12 + o.rnd() * 0.22;
      const age = ((t * 0.9 + o.rnd() * 500) % 520) / 520;
      ctx.fillStyle = rgba('#bae6fd', (1 - age) * fadeOut);
      ctx.beginPath();
      ctx.arc(o.x + Math.cos(a) * v * age * 500, o.y - 40 + Math.sin(a) * v * age * 500 + age * age * 160, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function impactMoc(ctx: Ctx, o: O) {
  const t = o.t;
  const offs = [-76, -46, -22, 0, 24, 48, 78];
  const n = o.q === 2 ? 5 : 7;
  const gy = o.y + 6;
  const retreat = clamp01((t - 1700) / 500);
  for (let j = 0; j < n; j++) {
    const i = n === 5 ? [1, 2, 3, 4, 5][j] : j;
    const hMax = (150 + o.rnd() * 70) * o.s * (Math.abs(offs[i]) < 30 ? 1.25 : 1);
    const delay = Math.abs(offs[i]) * 2.2;
    const rise = easeOut((t - delay) / 320);
    const h = hMax * rise * (1 - retreat);
    if (h <= 1) continue;
    const w = (13 + o.rnd() * 6) * o.s;
    const x = o.x + offs[i] * o.s;
    const lean = (o.rnd() - 0.5) * 24;
    const g = ctx.createLinearGradient(x, gy, x, gy - h);
    g.addColorStop(0, '#422006');
    g.addColorStop(0.6, '#4d7c0f');
    g.addColorStop(1, '#bef264');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, gy);
    ctx.quadraticCurveTo(x - w * 0.5, gy - h * 0.5, x + lean, gy - h);
    ctx.quadraticCurveTo(x + w * 0.5, gy - h * 0.5, x + w, gy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,83,45,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const soil = extra(Math.round(16 * o.c), o.q);
  for (let i = 0; i < soil; i++) {
    const a = -Math.PI * (0.1 + 0.8 * o.rnd());
    const v = 0.1 + o.rnd() * 0.2;
    const age = clamp01((t - o.rnd() * 250) / 700);
    ctx.fillStyle = rgba(i % 2 ? '#713f12' : '#65a30d', (1 - age) * (1 - retreat));
    ctx.beginPath();
    ctx.arc(o.x + Math.cos(a) * v * age * 420, gy + Math.sin(a) * v * age * 420 + age * age * 160, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function impactHoa(ctx: Ctx, o: O) {
  const t = o.t;
  const gy = o.y;
  if (t < 260) {
    ctx.fillStyle = rgba('#ffffff', (1 - t / 260) * 0.55);
    ctx.fillRect(-20, -20, WORLD_W + 40, WORLD_H + 40);
  }
  const ball = 135 * o.s * easeOut(t / 550);
  const ballA = 1 - clamp01((t - 900) / 600);
  if (ballA > 0) {
    const g = ctx.createRadialGradient(o.x, gy - 20, 4, o.x, gy - 20, ball);
    g.addColorStop(0, rgba('#ffffff', ballA));
    g.addColorStop(0.3, rgba('#fde047', ballA));
    g.addColorStop(0.65, rgba('#f97316', ballA * 0.9));
    g.addColorStop(1, rgba('#b91c1c', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(o.x, gy - 20, ball, 0, Math.PI * 2);
    ctx.fill();
  }
  if (t < 1150) {
    const p = easeOut(t / 1150);
    ctx.strokeStyle = rgba('#ffedd5', (1 - p) * 0.9);
    ctx.lineWidth = 9 * (1 - p) + 2;
    ctx.beginPath();
    ctx.ellipse(o.x, gy + 4, 40 + 440 * o.s * p, 10 + 120 * o.s * p, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // mushroom: a stem rising from the fireball and a cap of overlapping puffs on top
  if (t > 250) {
    const rise = easeOut((t - 250) / 900);
    const h = 215 * o.s * rise;
    const alpha = 1 - clamp01((t - 1500) / 700);
    ctx.save();
    ctx.globalAlpha = alpha;
    const sg = ctx.createLinearGradient(0, gy, 0, gy - h);
    sg.addColorStop(0, '#f97316');
    sg.addColorStop(1, '#57534e');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(o.x - 34 * o.s, gy);
    ctx.quadraticCurveTo(o.x - 16 * o.s, gy - h * 0.5, o.x - 22 * o.s, gy - h);
    ctx.lineTo(o.x + 22 * o.s, gy - h);
    ctx.quadraticCurveTo(o.x + 16 * o.s, gy - h * 0.5, o.x + 34 * o.s, gy);
    ctx.closePath();
    ctx.fill();
    const capR = 78 * o.s * easeOut((t - 350) / 800);
    const puffs = main(7, o.q, 5);
    for (let i = 0; i < puffs; i++) {
      const a = Math.PI + (i / (puffs - 1)) * Math.PI;
      const r = capR * (0.55 + o.rnd() * 0.15);
      const cg = ctx.createRadialGradient(o.x + Math.cos(a) * capR * 0.85, gy - h + Math.sin(a) * capR * 0.5, 2, o.x + Math.cos(a) * capR * 0.85, gy - h + Math.sin(a) * capR * 0.5, r);
      cg.addColorStop(0, '#fb923c');
      cg.addColorStop(0.6, '#9a3412');
      cg.addColorStop(1, '#44403c');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(o.x + Math.cos(a) * capR * 0.85, gy - h + Math.sin(a) * capR * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  const embers = extra(Math.round(26 * o.c), o.q);
  for (let i = 0; i < embers; i++) {
    const a = -Math.PI * (0.05 + 0.9 * o.rnd());
    const v = 0.2 + o.rnd() * 0.35;
    const age = clamp01((t - o.rnd() * 200) / 1300);
    ctx.fillStyle = rgba(i % 2 ? '#fde047' : '#f97316', 1 - age);
    ctx.beginPath();
    ctx.arc(o.x + Math.cos(a) * v * age * 700, gy + Math.sin(a) * v * age * 700 + age * age * 260, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hand(ctx: Ctx, s: number) {
  // an open palm seen from below, fingers hanging down; centre of the palm at the origin
  const gold = ctx.createLinearGradient(0, -40 * s, 0, 100 * s);
  gold.addColorStop(0, '#fde68a');
  gold.addColorStop(1, '#d97706');
  ctx.fillStyle = gold;
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 3;
  const finger = (x: number, len: number, w: number, rot: number) => {
    ctx.save();
    ctx.translate(x * s, 30 * s);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.roundRect((-w / 2) * s, 0, w * s, len * s, (w / 2) * s);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  finger(-38, 70, 21, 0.08);
  finger(-13, 88, 21, 0.02);
  finger(12, 92, 21, -0.02);
  finger(37, 78, 21, -0.1);
  ctx.beginPath(); // palm
  ctx.roundRect(-52 * s, -40 * s, 104 * s, 84 * s, 22 * s);
  ctx.fill();
  ctx.stroke();
  ctx.save(); // thumb
  ctx.translate(-50 * s, -5 * s);
  ctx.rotate(0.9);
  ctx.beginPath();
  ctx.roundRect((-12 * s) / 1, 0, 24 * s, 66 * s, 12 * s);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(120,53,15,0.55)'; // lines of the palm
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-30 * s, -8 * s);
  ctx.quadraticCurveTo(0, 10 * s, 30 * s, -14 * s);
  ctx.stroke();
}

function mountain(ctx: Ctx, s: number) {
  // base centred on the origin, peak up
  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#431407';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-125 * s, 0);
  ctx.lineTo(-78 * s, -92 * s);
  ctx.lineTo(-44 * s, -72 * s);
  ctx.lineTo(0, -205 * s);
  ctx.lineTo(36 * s, -112 * s);
  ctx.lineTo(64 * s, -138 * s);
  ctx.lineTo(125 * s, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#a16207'; // lit side
  ctx.beginPath();
  ctx.moveTo(-125 * s, 0);
  ctx.lineTo(-78 * s, -92 * s);
  ctx.lineTo(-44 * s, -72 * s);
  ctx.lineTo(0, -205 * s);
  ctx.lineTo(-10 * s, -40 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f5f5f4'; // cap of the peak
  ctx.beginPath();
  ctx.moveTo(0, -205 * s);
  ctx.lineTo(-22 * s, -158 * s);
  ctx.lineTo(-6 * s, -166 * s);
  ctx.lineTo(10 * s, -150 * s);
  ctx.lineTo(22 * s, -160 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(67,20,7,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20 * s, -110 * s);
  ctx.lineTo(8 * s, -60 * s);
  ctx.lineTo(24 * s, -20 * s);
  ctx.moveTo(-60 * s, -60 * s);
  ctx.lineTo(-48 * s, -20 * s);
  ctx.stroke();
}

function impactTho(ctx: Ctx, o: O) {
  const t = o.t;
  const handY = o.y - 190 * o.s;
  const down = easeOut(t / 650);
  const handAlpha = 1 - easeIn((t - 700) / 300);
  if (handAlpha > 0 && t < 1000) {
    ctx.save();
    ctx.globalAlpha = handAlpha;
    ctx.translate(o.x, handY - 340 * (1 - down));
    ctx.scale(1 + (1 - handAlpha) * -0.35, 1 + (1 - handAlpha) * -0.35);
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 30;
    hand(ctx, 1.5 * o.s);
    ctx.restore();
  }
  const fall = easeIn((t - 700) / 420);
  const mAlpha = clamp01((t - 700) / 150) * (1 - clamp01((t - 1800) / 400));
  if (mAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = mAlpha;
    ctx.translate(o.x, o.y + 8 - 300 * (1 - fall));
    mountain(ctx, 1.05 * o.s);
    ctx.restore();
  }
  if (t >= 1120) {
    const p = clamp01((t - 1120) / 700);
    ctx.strokeStyle = rgba('#d6d3d1', (1 - p) * 0.9);
    ctx.lineWidth = 7 * (1 - p) + 1;
    ctx.beginPath();
    ctx.ellipse(o.x, o.y + 8, 60 + 260 * o.s * easeOut(p), 10 + 50 * o.s * easeOut(p), 0, 0, Math.PI * 2);
    ctx.stroke();
    const dust = extra(Math.round(18 * o.c), o.q);
    for (let i = 0; i < dust; i++) {
      const dir = o.rnd() < 0.5 ? -1 : 1;
      const v = 0.1 + o.rnd() * 0.2;
      ctx.fillStyle = rgba('#a8a29e', (1 - p) * 0.8);
      ctx.beginPath();
      ctx.arc(o.x + dir * v * (t - 1120) * 1.3, o.y - 4 - o.rnd() * 40 * p, 5 + o.rnd() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const IMPACT: Record<string, (ctx: Ctx, o: O) => void> = { kim: impactKim, thuy: impactThuy, moc: impactMoc, hoa: impactHoa, tho: impactTho };

// ---------------------------------------------------------------- entry points

function lookup(e: RoyaleEngine) {
  const bt = e.battle;
  if (e.phase !== 'battle' || !bt || !bt.turn) return null;
  const t = bt.turn;
  if (!ELEMENTS[t.ow.element]) return null; // an unknown element (older server): the existing ring still shows
  const ts = tierScale(t.ow.tier);
  return { bt, t, ts, seed: fxTurnSeed(bt.round, bt.turnInRound, t.shooter) };
}

/** The elemental effects of the current battle moment: charge-up and the way out (on the shooter), the big impact (on the target). */
export function drawElementFx(ctx: Ctx, e: RoyaleEngine, _now: number, level: FxLevel = fxQuality.level) {
  const d = lookup(e);
  if (!d) return;
  const { bt, t, ts, seed } = d;
  const el = t.ow.element;
  const step = bt.step;
  const base = (p: RPlayer, tt: number, k: number, out: number, salt: number): O => ({ x: p.x, y: p.y, t: tt, k, s: ts.size, c: ts.count, q: level, rnd: fxRng(seed + salt), out });
  ctx.save();
  if (step === 'charge') {
    CHARGE[el]?.(ctx, base(e.players[t.shooter], bt.stepT, clamp01(bt.stepT / CHARGE_MS), 0, 1));
  } else if (step === 'flight') {
    const ms = EXIT_MS[el] ?? 300;
    if (bt.stepT < ms) CHARGE[el]?.(ctx, base(e.players[t.shooter], CHARGE_MS + bt.stepT, 1, clamp01(bt.stepT / ms), 1));
  } else if (step === 'impact' && t.hit !== false && bt.stepT < IMPACT_HIT_MS) {
    IMPACT[el]?.(ctx, base(e.players[t.target], bt.stepT, 1, 0, 2));
  }
  ctx.restore();
}

/** Extra look of a flying shell: leaves trail behind a Mộc shell, fire wraps a Hỏa shell. Kim, Thủy and Thổ keep the existing halo. */
export function drawShellFx(ctx: Ctx, s: { id: number; x: number; y: number; vx: number; vy: number; age: number; element?: string }, level: FxLevel = fxQuality.level) {
  if (s.element !== 'moc' && s.element !== 'hoa') return;
  const sp = Math.hypot(s.vx, s.vy) || 1;
  const bx = -s.vx / sp;
  const by = -s.vy / sp;
  const rnd = fxRng(s.id * 2654435761);
  ctx.save();
  if (s.element === 'moc') {
    const n = main(7, level, 3);
    for (let j = 1; j <= n; j++) {
      const wob = Math.sin(s.age * 0.3 + j) * 9;
      ctx.save();
      ctx.globalAlpha = 1 - j / (n + 1);
      ctx.translate(s.x + bx * j * 15 - by * wob, s.y + by * j * 15 + bx * wob);
      leaf(ctx, 13 - j * 0.9, s.age * 0.2 + j * 1.3 + rnd(), j % 2 ? '#4ade80' : '#16a34a');
      ctx.restore();
    }
  } else {
    const n = main(7, level, 3);
    const g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, 46);
    g.addColorStop(0, 'rgba(253,224,71,0.5)');
    g.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 46, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + s.age * 0.2;
      const fl = Math.sin(s.age * 0.5 + i * 2);
      ctx.save();
      ctx.translate(s.x + Math.cos(a) * 20, s.y + Math.sin(a) * 20);
      ctx.rotate(Math.atan2(by, bx) + Math.PI / 2 + (rnd() - 0.5) * 0.4);
      ctx.fillStyle = i % 2 ? '#f97316' : '#fde047';
      flame(ctx, 0, 0, 24 + fl * 6, 6, fl * 3);
      ctx.restore();
    }
  }
  ctx.restore();
}
