import React, { useEffect, useRef } from 'react';
import { REACTION_MS, RoyaleEngine, RPlayer } from '../game/royaleEngine';
import { ELEMENTS, TIERS, WEAPON_BY_ID } from '../data/royaleWeapons';
import { createTerrainCanvas, WORLD_H, WORLD_W } from '../utils/terrain';
import { soundManager } from '../utils/audio';

interface Props {
  engine: RoyaleEngine;
}

const SPINNERS = new Set(['dep_tong', 'bong_da', 'may_giat', 'quat_dien', 'gio_trai_cay', 'o_du']);

const hexToRgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export const RoyaleCanvas: React.FC<Props> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const terrain = createTerrainCanvas();
    (window as any).__gunnyTerrainCanvas = terrain; // mini map
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    let last = performance.now();
    const sfxState = { seen: 0 };

    const frame = (now: number) => {
      engine.update(now - last);
      last = now;
      drain(engine, sfxState);
      draw(ctx, engine, terrain, now);
      raf = requestAnimationFrame(frame);
    };
    // debug hook: lets tests (or a hidden tab) advance the simulation manually
    (window as any).__royale = {
      engine,
      step: (ms: number) => {
        for (let t = 0; t < ms; t += 1000 / 60) engine.update(1000 / 60);
        drain(engine, sfxState);
        draw(ctx, engine, terrain, performance.now());
      },
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div className="relative overflow-hidden bg-slate-950" style={{ width: WORLD_W, height: WORLD_H }}>
      <canvas ref={canvasRef} width={WORLD_W} height={WORLD_H} className="block" style={{ width: WORLD_W, height: WORLD_H }} />
    </div>
  );
};

// ---------------------------------------------------------------- sound
function drain(e: RoyaleEngine, st: { seen: number }) {
  if (e.sfxSeq === st.seen) return;
  const pending = e.sfxLog.filter((s) => s.seq > st.seen);
  st.seen = e.sfxSeq;
  const seen = new Set<string>();
  pending.forEach((s) => {
    if (seen.has(s.name)) return; // one of each kind per frame is plenty
    seen.add(s.name);
    switch (s.name) {
      case 'shoot':
        soundManager.playShoot();
        break;
      case 'boxhit':
        soundManager.playBoxHit();
        break;
      case 'correct':
        soundManager.playCheer();
        break;
      case 'wrong':
        soundManager.playWrong();
        break;
      case 'chargeup':
        soundManager.playChargeUp();
        break;
      case 'chargestop':
        soundManager.stopChargeUp();
        break;
      case 'hitplayer':
        soundManager.playHitPlayer();
        break;
      case 'explode':
        soundManager.playExplode(false);
        break;
      case 'bigexplode':
        soundManager.playExplode(true);
        break;
      case 'heal':
        soundManager.playHeal();
        break;
      case 'power':
        soundManager.stopChargeUp(0.08); // the shell is flying: the charge-up sound ends
        soundManager.playPowShoot();
        break;
      case 'turn':
        soundManager.playTurnChange();
        break;
      case 'win':
        soundManager.playEnhanceSuccess();
        break;
      case 'tick':
        soundManager.playChargeTick(0.5);
        break;
    }
  });
}

// ---------------------------------------------------------------- drawing
// Cheer / sad emoji floating above a player after a box question: lets the players waiting for their turn see what is happening.
function drawReaction(ctx: CanvasRenderingContext2D, e: RoyaleEngine, p: RPlayer) {
  const r = p.reaction;
  if (!r || e.time >= r.until) return;
  const k = Math.max(0, Math.min(1, (r.until - e.time) / REACTION_MS)); // 1 -> 0
  const rise = (1 - k) * 26;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 3);
  ctx.font = `${44 + (1 - k) * 8}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(r.emoji, p.x, p.y - 112 - rise);
  ctx.restore();
}
function draw(ctx: CanvasRenderingContext2D, e: RoyaleEngine, terrain: HTMLCanvasElement, now: number) {
  ctx.save();
  if (e.shake > 0.3) ctx.translate((Math.random() - 0.5) * e.shake, (Math.random() - 0.5) * e.shake);

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  sky.addColorStop(0, '#0f172a');
  sky.addColorStop(0.4, '#1e293b');
  sky.addColorStop(0.8, '#334155');
  sky.addColorStop(1, '#0f766e');
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, WORLD_W + 40, WORLD_H + 40);

  // clouds
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(300, 140, 70, 0, Math.PI * 2);
  ctx.arc(380, 130, 90, 0, Math.PI * 2);
  ctx.arc(460, 145, 65, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(800, 180, 80, 0, Math.PI * 2);
  ctx.arc(890, 170, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1400, 120, 75, 0, Math.PI * 2);
  ctx.arc(1480, 110, 95, 0, Math.PI * 2);
  ctx.arc(1560, 125, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.drawImage(terrain, 0, 0);

  // wind streaks
  ctx.strokeStyle = 'rgba(186,230,253,0.10)';
  ctx.lineWidth = 2;
  const wl = e.wind * 14;
  for (let i = 0; i < 8; i++) {
    const wx = ((now * 0.03 * Math.sign(e.wind || 1) * Math.min(1, Math.abs(e.wind)) + i * 260) % (WORLD_W + 200)) - 100;
    const wy = 70 + ((i * 97) % 300);
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + wl + Math.sign(e.wind || 1) * 20, wy);
    ctx.stroke();
  }

  // boxes (gift boxes in the color of their tier)
  if (e.phase === 'intro' || e.phase === 'collect' || e.phase === 'timeup') {
    const rt = e.phase === 'collect' ? e.rulerTarget() : null;
    e.boxes.forEach((b) => drawBox(ctx, b.x, b.y + Math.sin(now / 420 + b.phase) * 3, b.r, b.tier, rt?.id === b.id, now, e.players[e.mySeat].selectedBoxId === b.id));
  }

  // players
  e.players.forEach((p) => {
    drawPlayer(ctx, e, p, now);
    drawReaction(ctx, e, p);
  });

  // charge-up aura / giant weapon icon
  drawChargeAura(ctx, e, now);

  // shells
  e.shells.forEach((s) => {
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = s.kind === 'battle' ? 3 : 2;
    ctx.beginPath();
    s.trail.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.kind === 'battle') {
      const ec = s.element ? ELEMENTS[s.element as keyof typeof ELEMENTS].color : s.color;
      // element halo
      ctx.strokeStyle = hexToRgba(ec, 0.85);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + Math.sin(s.age * 0.4) * 2, 0, Math.PI * 2);
      ctx.stroke();
      if (s.legend) {
        // LEGEND: golden sparkles orbiting the shell
        ctx.fillStyle = '#fde68a';
        for (let k = 0; k < 4; k++) {
          const ang = s.age * 0.15 + (k * Math.PI) / 2;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * 30, Math.sin(ang) * 30, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowColor = s.legend ? '#fde047' : s.color;
      ctx.shadowBlur = s.legend ? 28 : 16;
      if (s.weaponId && SPINNERS.has(s.weaponId)) ctx.rotate(s.age * 0.3);
      ctx.font = '30px serif';
    } else {
      ctx.font = '20px serif';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.ammo, 0, 0);
    ctx.restore();
  });

  // rings
  e.rings.forEach((r) => {
    const k = r.life / r.max;
    ctx.strokeStyle = hexToRgba(r.color, 1 - k);
    ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * k, 0, Math.PI * 2);
    ctx.stroke();
  });

  // particles
  e.particles.forEach((p) => {
    const a = 1 - p.life / p.max;
    ctx.globalAlpha = Math.max(0, a);
    if (p.emoji) {
      ctx.font = `${Math.round(p.size * 4 + 8)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  // floating texts
  e.floaters.forEach((f) => {
    const k = f.life / f.max;
    ctx.save();
    ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    ctx.font = `800 ${f.size}px 'Fredoka', sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(2,6,23,0.85)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  });

  ctx.restore();
}

function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tier: 'white' | 'blue' | 'red', targeted: boolean, now: number, picked = false) {
  const t = TIERS[tier];
  ctx.save();
  ctx.translate(x, y);
  // glow
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 2);
  g.addColorStop(0, hexToRgba(t.color, 0.45));
  g.addColorStop(1, hexToRgba(t.color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
  ctx.fill();
  // body
  const s = r * 1.5;
  ctx.fillStyle = t.color;
  ctx.strokeStyle = t.dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-s / 2, -s / 2, s, s, 6);
  ctx.fill();
  ctx.stroke();
  // ribbon
  ctx.fillStyle = t.dark;
  ctx.fillRect(-3.5, -s / 2, 7, s);
  ctx.fillRect(-s / 2, -3.5, s, 7);
  // bow
  ctx.beginPath();
  ctx.ellipse(-8, -s / 2 - 3, 8, 5, -0.4, 0, Math.PI * 2);
  ctx.ellipse(8, -s / 2 - 3, 8, 5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // question mark
  ctx.fillStyle = '#0f172a';
  ctx.font = "900 15px 'Fredoka', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, 1);
  // hit radius ring (so players can see what counts)
  ctx.strokeStyle = hexToRgba(t.color, 0.5);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (targeted) {
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 14 + Math.sin(now / 180) * 2, 0, Math.PI * 2);
    ctx.stroke();
    if (picked) {
      // manually picked target: crosshair + label
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r - 24, 0);
      ctx.lineTo(-r - 8, 0);
      ctx.moveTo(r + 8, 0);
      ctx.lineTo(r + 24, 0);
      ctx.moveTo(0, -r - 24);
      ctx.lineTo(0, -r - 8);
      ctx.moveTo(0, r + 8);
      ctx.lineTo(0, r + 24);
      ctx.stroke();
      ctx.font = "800 12px 'Nunito', sans-serif";
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText('MỤC TIÊU', 0, -r - 30);
    }
  }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, e: RoyaleEngine, p: RPlayer, now: number) {
  const inBattle = e.phase === 'battle' || e.phase === 'result';
  const dead = p.out || (inBattle && p.hp <= 0);
  const turn = e.battle?.turn;
  const isShooter = inBattle && turn?.shooter === p.idx;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (dead) ctx.globalAlpha = 0.35;

  // marker over the shooter
  if (isShooter) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, -84);
    ctx.lineTo(-7, -96);
    ctx.lineTo(7, -96);
    ctx.closePath();
    ctx.fill();
  }

  // team rooms: tell which one is you
  if (e.players.length > 2 && p.idx === e.mySeat && !isShooter) {
    ctx.font = "900 11px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText('▼ BẠN', 0, -86);
    ctx.shadowBlur = 0;
  }

  // name + mini HP
  ctx.font = "bold 12px 'Nunito', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.fillText(p.name, 0, -72);
  ctx.shadowBlur = 0;
  const hr = Math.max(0, p.hp / p.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(-24, -67, 48, 5);
  ctx.fillStyle = hr > 0.4 ? '#22c55e' : '#ef4444';
  ctx.fillRect(-24, -67, 48 * hr, 5);

  // soft ring
  ctx.beginPath();
  ctx.arc(0, -12, 48, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(p.avatarColor, 0.035);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(p.avatarColor, 0.14);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // red aim line (human in collect phase, and every battle shooter)
  const aiming = (e.phase === 'collect' && p.idx === e.mySeat && e.canAim(p.idx)) || isShooter;
  if (aiming) {
    const rad = (p.angle * Math.PI) / 180;
    const dx = p.facing * Math.cos(rad);
    const dy = -Math.sin(rad);
    // faded dashed aim line, reaching 10px past the ring
    ctx.strokeStyle = 'rgba(239,68,68,0.5)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(dx * 18, -12 + dy * 18);
    ctx.lineTo(dx * 58, -12 + dy * 58);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "bold 13px 'Nunito', sans-serif";
    ctx.textAlign = p.facing === 1 ? 'left' : 'right';
    ctx.fillStyle = '#fecaca';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(`${Math.round(p.angle)}°`, dx * 34 - dy * p.facing * 14, -12 + dy * 34 + dx * p.facing * 14 + 4);
    ctx.shadowBlur = 0;
  }

  // body
  ctx.save();
  ctx.scale(p.facing, 1);
  if (p.shield > 0) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -12, 25, 0, Math.PI * 2);
    ctx.stroke();
  }
  const bob = e.phase === 'collect' || dead ? 0 : Math.sin(now / 300 + p.idx) * 1.2;
  ctx.fillStyle = p.avatarColor;
  ctx.beginPath();
  ctx.arc(0, -12 + bob, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(4, -14 + bob, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // status bubbles
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (e.phase === 'collect' || e.phase === 'timeup') {
    // whose turn it is: a timer ring above the head while aiming
    const ct = e.cturn;
    const myTurn = !!ct && ct.seat === p.idx && ct.step === 'aim' && e.phase === 'collect';
    if (myTurn) {
      const left = Math.max(0, (ct!.until - e.time) / 1000);
      ctx.strokeStyle = left < 5 ? 'rgba(248,113,113,0.95)' : 'rgba(250,204,21,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -12, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = "800 14px 'Fredoka', sans-serif";
      ctx.fillStyle = left < 5 ? '#fecaca' : '#fef08a';
      ctx.fillText(`⏱ ${left.toFixed(0)}s`, 0, -98);
    } else if (p.status === 'answering') {
      // the opponent only sees a notepad next to the answering player: clear and bright
      const by = -52 + Math.sin(now / 200) * 3;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(34, by, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = '26px serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('📝', 34, by + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }
  if (p.speech && e.time < p.speech.until) {
    const text = p.speech.text;
    ctx.font = "900 20px 'Fredoka', sans-serif";
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 28;
    const by = -148;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-w / 2, by - 24, w, 36, 14);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, by + 12);
    ctx.lineTo(0, by + 26);
    ctx.lineTo(8, by + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b91c1c';
    ctx.fillText(text, 0, by + 2);
  }
  if (p.lastAction && e.phase === 'battle' && isShooter) {
    ctx.font = "800 13px 'Fredoka', sans-serif";
    ctx.fillStyle = '#fde68a';
    ctx.fillText(p.lastAction, 0, -112);
  }
  ctx.restore();
}

function drawChargeAura(ctx: CanvasRenderingContext2D, e: RoyaleEngine, now: number) {
  const bt = e.battle;
  if (e.phase !== 'battle' || !bt || !bt.turn) return;
  if (bt.step !== 'charge') return;
  const t = bt.turn;
  const sh = e.players[t.shooter];
  const w = WEAPON_BY_ID[t.ow.weaponId];
  const tier = TIERS[t.ow.tier];
  const k = Math.min(1, bt.stepT / 1300);

  ctx.save();
  ctx.translate(sh.x, sh.y - 22);
  // pulsing aura
  const rad = 40 + k * 90 + Math.sin(now / 60) * 4 * k;
  const g = ctx.createRadialGradient(0, 0, 6, 0, 0, rad);
  g.addColorStop(0, hexToRgba(w.color, 0.55 + 0.3 * k));
  g.addColorStop(0.6, hexToRgba(tier.color, 0.25 * k + 0.05));
  g.addColorStop(1, hexToRgba(w.color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fill();

  // element ring (+ golden crown of light for LEGEND)
  const ec = ELEMENTS[t.ow.element].color;
  ctx.strokeStyle = hexToRgba(ec, 0.35 + 0.5 * k);
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.8, now / 500, now / 500 + Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = hexToRgba(ec, 0.9);
  ctx.font = `900 ${Math.round(16 + k * 12)}px 'Fredoka', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ELEMENTS[t.ow.element].name, 0, rad * 0.8 * -1 - 8);
  if (t.ow.tier === 'red') {
    ctx.fillStyle = hexToRgba('#fde68a', 0.5 * k + 0.2);
    for (let i = 0; i < 14; i++) {
      const a2 = (i / 14) * Math.PI * 2 - now / 700;
      const rr = rad * (0.6 + 0.3 * Math.sin(now / 120 + i));
      ctx.beginPath();
      ctx.arc(Math.cos(a2) * rr, Math.sin(a2) * rr, 2.5 + k * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // rotating energy spokes
  ctx.strokeStyle = hexToRgba(tier.color, 0.5 * k);
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + now / 400;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (rad * 0.45), Math.sin(a) * (rad * 0.45));
    ctx.lineTo(Math.cos(a) * rad * 0.95, Math.sin(a) * rad * 0.95);
    ctx.stroke();
  }

  // the weapon itself swells above the shooter and trembles right before the burst
  const size = 26 + k * 50;
  const tremble = k > 0.7 ? (Math.random() - 0.5) * 6 * k : 0;
  ctx.shadowColor = w.color;
  ctx.shadowBlur = 24;
  ctx.font = `${Math.round(size)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(w.icon, tremble, -70 - k * 18 + tremble);
  ctx.restore();
}
