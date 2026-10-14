import React, { useEffect, useRef, useState } from 'react';
import {
  HitEffect,
  Particle,
  PlayerEntity,
  Projectile,
  WindState,
} from '../types/game';
import {
  GRAVITY,
  simulateTrajectory,
  stepPhysics,
  WIND_FACTOR,
} from '../utils/gunnyPhysics';
import { soundManager } from '../utils/audio';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 850;

interface Props {
  player1: PlayerEntity;
  player2: PlayerEntity;
  wind: WindState;
  currentTurnId: string;
  isTrajectoryGuide: boolean;
  projectiles: Projectile[];
  hitEffects: HitEffect[];
  onProjectileExplode: (
    proj: Projectile,
    impactX: number,
    impactY: number,
    radius: number
  ) => void;
  onPlayerFallCheck: (
    checkCollision: (x: number, y: number) => boolean
  ) => void;
  onSetTerrainReady: () => void;
}

export const GunnyCanvas: React.FC<Props> = ({
  player1,
  player2,
  wind,
  currentTurnId,
  isTrajectoryGuide,
  projectiles,
  hitEffects,
  onProjectileExplode,
  onPlayerFallCheck,
  onSetTerrainReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const screenShakeRef = useRef<number>(0);

  // Initialize terrain canvas
  useEffect(() => {
    const terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = CANVAS_WIDTH;
    terrainCanvas.height = CANVAS_HEIGHT;
    const tctx = terrainCanvas.getContext('2d');
    if (!tctx) return;

    // Generate classic Gunny landscape (Rolling hills, valley in middle)
    tctx.fillStyle = '#1e3a1e';
    tctx.beginPath();
    tctx.moveTo(0, CANVAS_HEIGHT);

    for (let x = 0; x <= CANVAS_WIDTH; x += 10) {
      // Harmonic sine waves for rich natural hills
      const y1 = Math.sin(x * 0.005) * 80;
      const y2 = Math.cos(x * 0.012) * 50;
      const y3 = Math.sin(x * 0.02) * 20;
      const baseY = 420 + y1 + y2 + y3;
      tctx.lineTo(x, baseY);
    }
    tctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    tctx.closePath();

    // Fill terrain gradient (Green grass on top, earthy rock underneath)
    const grad = tctx.createLinearGradient(0, 300, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, '#22c55e'); // Vibrant grass
    grad.addColorStop(0.08, '#15803d');
    grad.addColorStop(0.2, '#78350f'); // Dirt / Earth
    grad.addColorStop(0.6, '#451a03'); // Deep rock
    grad.addColorStop(1, '#1c1917');
    tctx.fillStyle = grad;
    tctx.fill();

    // Add rock texture speckles
    tctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 400; i++) {
      const rx = Math.random() * CANVAS_WIDTH;
      const ry = 420 + Math.random() * 200;
      tctx.beginPath();
      tctx.arc(rx, ry, Math.random() * 6 + 2, 0, Math.PI * 2);
      tctx.fill();
    }

    terrainCanvasRef.current = terrainCanvas;
    (window as any).__gunnyTerrainCanvas = terrainCanvas;
    onSetTerrainReady();
  }, []);

  // Collision checker against offscreen terrain
  const checkTerrainCollision = (x: number, y: number): boolean => {
    if (x < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) return false;
    if (y < 0) return false;
    const tctx = terrainCanvasRef.current?.getContext('2d');
    if (!tctx) return false;
    try {
      const pixel = tctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      return pixel[3] > 40; // Alpha > 40 means solid ground
    } catch {
      return false;
    }
  };

  // Carve crater into terrain canvas
  const carveCrater = (cx: number, cy: number, radius: number) => {
    const tctx = terrainCanvasRef.current?.getContext('2d');
    if (!tctx) return;
    tctx.save();
    tctx.globalCompositeOperation = 'destination-out';
    tctx.beginPath();
    tctx.arc(cx, cy, radius, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();

    // Trigger screen shake
    screenShakeRef.current = Math.min(15, radius * 0.35);

    // Spawn explosion debris particles
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 2;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        color: ['#f97316', '#eab308', '#ef4444', '#78350f'][Math.floor(Math.random() * 4)],
        radius: Math.random() * 4 + 2,
        alpha: 1,
        life: 0,
        maxLife: Math.random() * 25 + 20,
      });
    }
  };

  // Expose carveCrater through ref or global callback
  useEffect(() => {
    (window as any).__gunnyCarveCrater = carveCrater;
    (window as any).__gunnyCheckTerrain = checkTerrainCollision;
  }, []);

  // Animation Loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Check player ground fall every few frames
      onPlayerFallCheck(checkTerrainCollision);

      // Handle screen shake
      ctx.save();
      if (screenShakeRef.current > 0.2) {
        const sx = (Math.random() - 0.5) * screenShakeRef.current;
        const sy = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(sx, sy);
        screenShakeRef.current *= 0.88;
      }

      // 1. Clear background & Draw Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      skyGrad.addColorStop(0, '#0f172a'); // Night / Twilight Gunny sky
      skyGrad.addColorStop(0.4, '#1e293b');
      skyGrad.addColorStop(0.8, '#334155');
      skyGrad.addColorStop(1, '#0f766e');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Distant clouds
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.arc(300, 140, 70, 0, Math.PI * 2);
      ctx.arc(380, 130, 90, 0, Math.PI * 2);
      ctx.arc(460, 145, 65, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(800, 180, 80, 0, Math.PI * 2);
      ctx.arc(890, 170, 100, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw Destructible Terrain
      if (terrainCanvasRef.current) {
        ctx.drawImage(terrainCanvasRef.current, 0, 0);
      }

      // 3. Trajectory guide (if enabled for human player)
      const activePlayer = currentTurnId === player1.id ? player1 : player2;
      if (isTrajectoryGuide && !activePlayer.isBot) {
        // Same power the real shot will use: live charge while holding Space, else the last shot's power
        const w = window as any;
        const guidePower: number = w.__gunnyChargePower > 0 ? w.__gunnyChargePower : w.__gunnyLastPower || 55;
        const foe = activePlayer.id === player1.id ? player2 : player1;
        const guideCollide = (x: number, y: number) =>
          checkTerrainCollision(x, y) || Math.hypot(x - foe.x, y - foe.y) < 28;
        const { path } = simulateTrajectory(
          activePlayer.x + activePlayer.facing * 16,
          activePlayer.y - 18,
          activePlayer.angle,
          guidePower,
          activePlayer.facing,
          wind.speed,
          guideCollide,
          500
        );

        ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        path.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 4. Draw Players
      drawPlayer(ctx, player1, currentTurnId === player1.id);
      drawPlayer(ctx, player2, currentTurnId === player2.id);

      // 5. Update & Draw Active Projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];

        // Step physics
        const next = stepPhysics(p.x, p.y, p.vx, p.vy, wind.speed);
        p.x = next.x;
        p.y = next.y;
        p.vx = next.vx;
        p.vy = next.vy;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 16) p.trail.shift();

        // Draw trail
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.isPow ? 4 : 2;
        ctx.beginPath();
        p.trail.forEach((pt, tidx) => {
          if (tidx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();

        // Draw bullet graphic
        drawBullet(ctx, p);

        // Check collision with terrain or bottom
        const hitTerrain = checkTerrainCollision(p.x, p.y);
        const hitTarget1 =
          p.shooterId !== player1.id &&
          Math.hypot(p.x - player1.x, p.y - player1.y) < 28;
        const hitTarget2 =
          p.shooterId !== player2.id &&
          Math.hypot(p.x - player2.x, p.y - player2.y) < 28;

        if (hitTerrain || hitTarget1 || hitTarget2 || p.y > CANVAS_HEIGHT) {
          carveCrater(p.x, p.y, p.digRadius);
          onProjectileExplode(p, p.x, p.y, p.digRadius);
          projectiles.splice(i, 1);
        }
      }

      // 6. Update & Draw Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.2; // gravity on debris
        pt.life++;
        pt.alpha = 1 - pt.life / pt.maxLife;

        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (pt.life >= pt.maxLife) {
          particlesRef.current.splice(i, 1);
        }
      }

      // 7. Draw Floating Combat Text (Damage numbers)
      for (let i = hitEffects.length - 1; i >= 0; i--) {
        const effect = hitEffects[i];
        effect.y -= 1.2;
        effect.age++;

        ctx.save();
        ctx.font = effect.isCrit
          ? "900 24px 'Fredoka', sans-serif"
          : "800 18px 'Fredoka', sans-serif";
        ctx.textAlign = 'center';

        if (effect.isHeal) {
          ctx.fillStyle = '#4ade80';
          ctx.shadowColor = '#15803d';
          ctx.shadowBlur = 8;
          ctx.fillText(`+${effect.damage} HP`, effect.x, effect.y);
        } else if (effect.isCrit) {
          ctx.fillStyle = '#fbbf24';
          ctx.shadowColor = '#b45309';
          ctx.shadowBlur = 12;
          ctx.fillText(`⚡ CHÍ MẠNG! -${effect.damage}`, effect.x, effect.y);
        } else {
          ctx.fillStyle = '#f87171';
          ctx.shadowColor = '#991b1b';
          ctx.shadowBlur = 6;
          ctx.fillText(`-${effect.damage}`, effect.x, effect.y);
        }
        ctx.restore();

        if (effect.age > 45) {
          hitEffects.splice(i, 1);
        }
      }

      ctx.restore(); // restore screen shake
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    player1,
    player2,
    wind,
    currentTurnId,
    isTrajectoryGuide,
    projectiles,
    hitEffects,
  ]);

  const hexToRgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

  // Draw Cute Gunner Avatar
  const drawPlayer = (
    ctx: CanvasRenderingContext2D,
    player: PlayerEntity,
    isTurn: boolean
  ) => {
    if (player.isDead) return;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Active Turn Indicator arrow
    if (isTurn) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -84);
      ctx.lineTo(-7, -96);
      ctx.lineTo(7, -96);
      ctx.closePath();
      ctx.fill();
    }

    // Name tag & HP mini bar
    ctx.font = "bold 11px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(player.name, 0, -72);
    ctx.shadowBlur = 0;

    // Mini HP bar above head
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-20, -67, 40, 5);
    ctx.fillStyle = hpRatio > 0.4 ? '#22c55e' : '#ef4444';
    ctx.fillRect(-20, -67, 40 * hpRatio, 5);

    // Transparent ring around the character
    ctx.beginPath();
    ctx.arc(0, -12, 48, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(player.avatarColor, 0.07);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(player.avatarColor, 0.3);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Red aim line + angle readout for the active player
    if (isTurn) {
      const rad = (player.angle * Math.PI) / 180;
      const dx = player.facing * Math.cos(rad);
      const dy = -Math.sin(rad);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(dx * 18, -12 + dy * 18);
      ctx.lineTo(dx * 46, -12 + dy * 46);
      ctx.stroke();

      ctx.font = "bold 13px 'Nunito', sans-serif";
      ctx.textAlign = player.facing === 1 ? 'left' : 'right';
      ctx.fillStyle = '#fecaca';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      // keep the readout inside the ring, beside the line
      const tx = dx * 30 - dy * player.facing * 14;
      const ty = -12 + dy * 30 + dx * player.facing * 14;
      ctx.fillText(`${player.angle}°`, tx, ty + 4);
      ctx.shadowBlur = 0;
    }

    // Face orientation
    ctx.scale(player.facing, 1);

    // Shield bubble effect if shielded
    if (player.shieldTurns > 0) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -12, 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body (Round chibi Gunner)
    ctx.fillStyle = player.avatarColor;
    ctx.beginPath();
    ctx.arc(0, -12, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(4, -14, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Hat (if equipped)
    if (player.equipped.hat) {
      ctx.font = '14px serif';
      ctx.fillText(player.equipped.hat.icon, 0, -22);
    }

    ctx.restore(); // restore player transform
  };

  // Draw Projectiles
  const drawBullet = (ctx: CanvasRenderingContext2D, p: Projectile) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.vy, p.vx);
    ctx.rotate(angle);

    if (p.isPow) {
      // Big blazing POW super projectile!
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '22px serif';
      ctx.fillText('💥', -11, 7);
    } else if (p.isAirplane) {
      // Paper airplane
      ctx.font = '18px serif';
      ctx.fillText('✈️', -9, 6);
    } else if (p.icon) {
      // Shell head = the shooter's equipped weapon icon (kept upright, trail still follows the path)
      ctx.rotate(-angle);
      ctx.font = '20px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.icon, 0, 0);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  return (
    <div
      className="relative overflow-hidden bg-slate-950"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
      />
    </div>
  );
};
