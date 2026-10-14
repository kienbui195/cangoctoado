// Gunny Physics Engine & Authentic Parabolic Trajectory Mechanics

export const GRAVITY = 0.36; // Constant downward acceleration
export const WIND_FACTOR = 0.055; // Wind coefficient per unit of wind
export const POWER_SCALE = 0.28; // Converts 0-100 power scale to initial velocity vector

export interface TrajectoryPoint {
  x: number;
  y: number;
  time: number;
}

export interface RecommendationResult {
  formulaName: string;
  angle: number;
  power: number;
  distanceSegments: number; // in Gunny "khúc" (1 screen = 10 segments)
  windAdjusted: number;
  description: string;
}

/**
 * Converts Gunny angle and power into initial velocity (vx, vy).
 * angle is in degrees [0, 90].
 * facing is 1 (right) or -1 (left).
 */
export function getInitialVelocity(
  angleDeg: number,
  power: number,
  facing: 1 | -1
): { vx: number; vy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const speed = power * POWER_SCALE;
  return {
    vx: facing * speed * Math.cos(rad),
    vy: -speed * Math.sin(rad), // negative because Canvas Y goes downwards
  };
}

/**
 * Step projectile physics by delta time (usually 1 frame)
 */
export function stepPhysics(
  x: number,
  y: number,
  vx: number,
  vy: number,
  windSpeed: number
): { x: number; y: number; vx: number; vy: number } {
  const nextVx = vx + windSpeed * WIND_FACTOR;
  const nextVy = vy + GRAVITY;
  const nextX = x + nextVx;
  const nextY = y + nextVy;
  return {
    x: nextX,
    y: nextY,
    vx: nextVx,
    vy: nextVy,
  };
}

/**
 * Simulates trajectory ahead of time (used for Practice mode guide line or AI bot aiming)
 */
export function simulateTrajectory(
  startX: number,
  startY: number,
  angleDeg: number,
  power: number,
  facing: 1 | -1,
  windSpeed: number,
  checkCollision: (x: number, y: number) => boolean,
  maxSteps: number = 220
): { path: TrajectoryPoint[]; hit: { x: number; y: number } | null } {
  const path: TrajectoryPoint[] = [];
  let { vx, vy } = getInitialVelocity(angleDeg, power, facing);
  let curX = startX;
  let curY = startY;

  path.push({ x: curX, y: curY, time: 0 });

  for (let step = 1; step <= maxSteps; step++) {
    const next = stepPhysics(curX, curY, vx, vy, windSpeed);
    curX = next.x;
    curY = next.y;
    vx = next.vx;
    vy = next.vy;

    path.push({ x: curX, y: curY, time: step });

    // Check collision with terrain or out of bounds bottom
    if (checkCollision(curX, curY)) {
      return { path, hit: { x: curX, y: curY } };
    }
    if (curY > 750) {
      return { path, hit: { x: curX, y: curY } };
    }
  }

  return { path, hit: null };
}

/**
 * Measures distance in Gunny standard units:
 * 1 standard screen (~900px) is exactly 10 "khúc" (segments).
 * 1 segment = 90px.
 */
export function calculateGunnyDistance(p1X: number, p2X: number): number {
  const pxDistance = Math.abs(p2X - p1X);
  const segments = pxDistance / 90;
  return Number(segments.toFixed(1));
}

/**
 * Authentic Gunny Góc 65 formula:
 * Real Angle = 65 +/- (Wind * 2)
 * Power lookup table for 1-15 segments:
 */
const GOC_65_POWER_TABLE: Record<number, number> = {
  1: 13,
  2: 21,
  3: 26,
  4: 31,
  5: 37,
  6: 41,
  7: 46,
  8: 51,
  9: 55,
  10: 60,
  11: 64,
  12: 68,
  13: 72,
  14: 75,
  15: 78,
  16: 82,
  17: 85,
  18: 88,
  19: 91,
  20: 94,
};

export function interpolatePower65(distSegments: number): number {
  const rounded = Math.round(distSegments);
  if (rounded <= 1) return GOC_65_POWER_TABLE[1];
  if (rounded >= 20) return GOC_65_POWER_TABLE[20];
  const lower = Math.floor(distSegments);
  const upper = Math.ceil(distSegments);
  if (lower === upper) return GOC_65_POWER_TABLE[lower] || 50;

  const pLow = GOC_65_POWER_TABLE[lower] || 30;
  const pHigh = GOC_65_POWER_TABLE[upper] || 60;
  const t = distSegments - lower;
  return Math.round(pLow + t * (pHigh - pLow));
}

/**
 * Calculates optimal Gunny formula advice based on current wind, distance, and shooter orientation.
 */
export function calculateGunnyFormulas(
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number,
  windSpeed: number, // positive = right, negative = left
  facing: 1 | -1 // 1 = shooting right, -1 = shooting left
): RecommendationResult[] {
  const distSegments = calculateGunnyDistance(playerX, targetX);

  // Effective wind relative to shooting direction:
  // If facing right (1) and wind > 0, wind is favorable (xuôi gió).
  // If facing right (1) and wind < 0, wind is against (ngược gió).
  const relWind = windSpeed * facing; // > 0: xuôi gió, < 0: ngược gió

  const results: RecommendationResult[] = [];

  // 1. Góc 65 độ (Phổ biến & Chuẩn xác nhất)
  // Công thức: Góc = 65 + (Gió * 2) (xuôi gió thì tăng góc, ngược gió thì giảm góc)
  const angle65 = Math.max(20, Math.min(85, Math.round(65 + relWind * 2)));
  const power65 = interpolatePower65(distSegments);
  results.push({
    formulaName: 'Góc 65° Chuẩn',
    angle: angle65,
    power: Math.min(100, Math.max(10, power65)),
    distanceSegments: distSegments,
    windAdjusted: Number(relWind.toFixed(1)),
    description: `Góc gốc 65° ${relWind >= 0 ? '+' : '-'} (Gió × 2). Tra bảng lực cự ly ${distSegments} khúc.`,
  });

  // 2. Góc Siêu Cao 90 độ (Đạn cắm từ trên mây xuống)
  // Công thức: Góc = 90 - Cự ly + (Gió * 2)
  // Lực bắn: 95 lực (ngược gió: 97, xuôi gió: 93)
  const angle90 = Math.max(45, Math.min(89, Math.round(90 - distSegments + relWind * 2)));
  const power90 = relWind < -1 ? 97 : relWind > 1 ? 93 : 95;
  results.push({
    formulaName: 'Góc Siêu Cao 90°',
    angle: angle90,
    power: power90,
    distanceSegments: distSegments,
    windAdjusted: Number(relWind.toFixed(1)),
    description: `90° - ${distSegments} khúc ${relWind >= 0 ? '+' : '-'} (Gió × 2). Lực cố định ~95.`,
  });

  // 3. Góc Cao 77 độ
  // Công thức: Góc = 77 - Cự ly + (Gió * 2.3)
  const angle77 = Math.max(30, Math.min(88, Math.round(77 - distSegments * 0.8 + relWind * 2.3)));
  // Lực góc 77: ~50-80
  const power77 = Math.min(98, Math.max(35, Math.round(35 + distSegments * 4.2)));
  results.push({
    formulaName: 'Góc Cao 77°',
    angle: angle77,
    power: power77,
    distanceSegments: distSegments,
    windAdjusted: Number(relWind.toFixed(1)),
    description: `77° căn cự ly và gió. Bắn tầm trung cực kỳ ổn định.`,
  });

  // 4. Góc Thấp 20 độ (Bắn thẳng nhanh, ít chịu ảnh hưởng của gió)
  // Công thức: Góc = 20 +/- Gió * 1.2
  const angle20 = Math.max(5, Math.min(45, Math.round(20 + relWind * 1.2)));
  const power20 = Math.min(95, Math.max(25, Math.round(25 + distSegments * 6.5)));
  results.push({
    formulaName: 'Góc Thấp 20°',
    angle: angle20,
    power: power20,
    distanceSegments: distSegments,
    windAdjusted: Number(relWind.toFixed(1)),
    description: `Bắn thẳng tầm thấp, đục chân và xuyên thủng địa hình.`,
  });

  return results;
}

/**
 * AI Bot aiming logic that uses the authentic Gunny formula with some difficulty error
 */
export function computeBotShot(
  botX: number,
  botY: number,
  targetX: number,
  targetY: number,
  windSpeed: number,
  facing: 1 | -1,
  difficulty: 'easy' | 'medium' | 'hard'
): { angle: number; power: number } {
  const recommendations = calculateGunnyFormulas(botX, botY, targetX, targetY, windSpeed, facing);
  // Pick standard 65 or super high
  const chosen = recommendations[0]; // 65 formula

  let angle = chosen.angle;
  let power = chosen.power;

  if (difficulty === 'easy') {
    // Add significant error +/- 5 to 10
    const errAngle = (Math.random() - 0.5) * 8;
    const errPower = (Math.random() - 0.5) * 16;
    angle = Math.max(10, Math.min(85, Math.round(angle + errAngle)));
    power = Math.max(15, Math.min(100, Math.round(power + errPower)));
  } else if (difficulty === 'medium') {
    // Add small error +/- 2 to 4
    const errAngle = (Math.random() - 0.5) * 4;
    const errPower = (Math.random() - 0.5) * 6;
    angle = Math.max(10, Math.min(85, Math.round(angle + errAngle)));
    power = Math.max(15, Math.min(100, Math.round(power + errPower)));
  } else {
    // Hard: nearly perfect with slight natural wind variance
    const errPower = (Math.random() - 0.5) * 1.5;
    power = Math.max(15, Math.min(100, Math.round(power + errPower)));
  }

  return { angle, power };
}

/**
 * Solves the integer power (8-100) that lands the shell on the target for the CURRENT angle and wind,
 * simulating exactly what a real shot does (same muzzle offset, same terrain + target hit rules).
 * Wind is relative to the world (+ = blowing right).
 */
export function solvePower(
  shooterX: number,
  shooterY: number,
  targetX: number,
  targetY: number,
  angleDeg: number,
  facing: 1 | -1,
  windSpeed: number,
  checkTerrain: (x: number, y: number) => boolean
): { power: number; error: number } | null {
  // A real shell explodes on terrain OR within 28px of the opponent
  const collide = (x: number, y: number) =>
    checkTerrain(x, y) || Math.hypot(x - targetX, y - targetY) < 28;

  let best: { power: number; error: number } | null = null;
  for (let power = 8; power <= 100; power += 1) {
    const { hit } = simulateTrajectory(
      shooterX + facing * 16,
      shooterY - 18,
      angleDeg,
      power,
      facing,
      windSpeed,
      collide,
      500
    );
    if (!hit) continue;
    const error = Math.hypot(hit.x - targetX, hit.y - targetY);
    if (!best || error < best.error) best = { power, error };
  }
  return best;
}
