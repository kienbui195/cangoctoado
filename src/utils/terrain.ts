// Heightmap terrain shared by the "Thu thập vũ khí" mode (non-destructible, O(1) collision).
// Uses the same hills as the classic canvas so both modes look alike.

export const WORLD_W = 1920;
export const WORLD_H = 850;

const STEP = 10;
/** Extra sky above the hills: the whole ground sits this much lower so the top of the screen (HUD) never hides gift boxes. */
const SKY_LIFT = 120;

const rawHeight = (x: number) =>
  420 + SKY_LIFT + Math.sin(x * 0.005) * 80 + Math.cos(x * 0.012) * 50 + Math.sin(x * 0.02) * 20;

const HEIGHTS: number[] = [];
for (let x = 0; x <= WORLD_W + STEP; x += STEP) HEIGHTS.push(rawHeight(x));

/** Ground surface Y at world x (linear between the 10px samples, exactly like the drawn polygon). */
export function terrainHeight(x: number): number {
  const cx = Math.max(0, Math.min(WORLD_W, x));
  const i = Math.floor(cx / STEP);
  const t = (cx - i * STEP) / STEP;
  return HEIGHTS[i] + (HEIGHTS[i + 1] - HEIGHTS[i]) * t;
}

/** True when the point is inside the ground. Out of the left/right edge is open air. */
export function isSolid(x: number, y: number): boolean {
  if (x < 0 || x >= WORLD_W) return false;
  return y >= terrainHeight(x);
}

/** Pre-render the terrain once to an offscreen canvas. */
export function createTerrainCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = WORLD_H;
  const g = c.getContext('2d')!;

  g.beginPath();
  g.moveTo(0, WORLD_H);
  for (let x = 0; x <= WORLD_W; x += STEP) g.lineTo(x, terrainHeight(x));
  g.lineTo(WORLD_W, WORLD_H);
  g.closePath();

  const grad = g.createLinearGradient(0, 300 + SKY_LIFT, 0, WORLD_H);
  grad.addColorStop(0, '#22c55e');
  grad.addColorStop(0.08, '#15803d');
  grad.addColorStop(0.2, '#78350f');
  grad.addColorStop(0.6, '#451a03');
  grad.addColorStop(1, '#1c1917');
  g.fillStyle = grad;
  g.fill();

  // deterministic rock speckles
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 400; i++) {
    g.beginPath();
    g.arc(rnd() * WORLD_W, 420 + SKY_LIFT + rnd() * 200, rnd() * 6 + 2, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
