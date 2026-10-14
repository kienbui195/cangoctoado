import React, { useMemo } from 'react';
import { calculateGunnyDistance, solvePower } from '../utils/gunnyPhysics';
import type { ViewInfo } from './GameViewport';
import type { PlayerEntity } from '../types/game';

interface Props {
  view: ViewInfo;
  shooter: PlayerEntity;
  target: PlayerEntity;
  windSpeed: number;
  visible: boolean;
  isCharging: boolean;
  chargingPower: number;
}

// 1 Gunny segment ("khúc") = 90px of battlefield (1 screen ≈ 10 khúc)
const SEGMENT_PX = 90;
// Ruler covers 0..21 khúc (1920px world / 90px); banner sits above the control bar
const TOTAL_SEGMENTS = 21;
const BANNER_BOTTOM = 52;

export const GunnyRuler: React.FC<Props> = ({ view, shooter, target, windSpeed, visible, isCharging, chargingPower }) => {
  // Real shots go where the shooter faces; the advice only makes sense when facing the opponent
  const facing: 1 | -1 = shooter.facing;
  const facingTarget = (target.x >= shooter.x ? 1 : -1) === facing;
  const relWind = Number((windSpeed * facing).toFixed(1));
  const segments = calculateGunnyDistance(shooter.x, target.x);

  // Power from real projectile physics for the current angle + wind
  const advice = useMemo(() => {
    if (!visible) return null;
    const check = (window as any).__gunnyCheckTerrain as
      | ((x: number, y: number) => boolean)
      | undefined;
    if (!check) return null;
    if (!facingTarget) return null;
    return solvePower(shooter.x, shooter.y, target.x, target.y, shooter.angle, facing, windSpeed, check);
  }, [visible, shooter.x, shooter.y, shooter.angle, target.x, target.y, facing, facingTarget, windSpeed]);

  // Fixed-size ruler (independent of camera zoom/pan): 0..TOTAL khúc, centered at the bottom edge
  const rulerW = Math.max(300, Math.min(view.w - 140, 1260));
  const segPx = rulerW / TOTAL_SEGMENTS;
  const distPx = Math.min(segments, TOTAL_SEGMENTS) * segPx;

  const needPower = advice ? Math.round(advice.power) : null;

  return (
    <div className="absolute inset-x-0 bottom-0 pointer-events-none select-none z-30">
      {/* Info banner: khúc + angle + wind -> power */}
      {visible && (
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 text-amber-300 font-bold text-[11px] px-3 py-1 rounded-full border border-amber-500/60 shadow-lg flex items-center gap-2"
          style={{ bottom: BANNER_BOTTOM }}
        >
          <span>📏 <b className="text-white text-sm">{segments}</b> khúc</span>
          <span className="text-slate-500">|</span>
          <span>Góc <b className="text-white">{shooter.angle}°</b></span>
          <span className="text-slate-500">|</span>
          <span className={relWind >= 0 ? 'text-cyan-300' : 'text-rose-300'}>
            {Math.abs(windSpeed).toFixed(1)} {relWind >= 0 ? 'xuôi gió' : 'ngược gió'}
          </span>
          <span className="text-slate-500">|</span>
          <span>
            Lực cần: {facingTarget ? (
              <b className="text-emerald-300 text-sm">{needPower ?? '--'}</b>
            ) : (
              <b className="text-rose-300">quay mặt về mục tiêu (A/D)</b>
            )}
          </span>
        </div>
      )}

      {/* Combined strip docked at the very bottom:
          top row = khúc ruler (0..21), bottom row = power charge bar (0..100) */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-10 border-b-2 border-amber-400 bg-slate-950/80 rounded-t overflow-hidden"
        style={{ width: rulerW }}
      >
        {visible && (
          <div
            className="absolute left-0 top-0 h-5 bg-amber-500/25 border-r-2 border-emerald-400"
            style={{ width: distPx }}
          />
        )}
        {Array.from({ length: TOTAL_SEGMENTS + 1 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 flex flex-col items-center -translate-x-1/2"
            style={{ left: i * segPx }}
          >
            <span className="text-[10px] font-black text-amber-300 leading-none">{i}</span>
            <div className="w-[2px] h-1.5 bg-amber-400" />
          </div>
        ))}

        <span className="absolute left-4 top-[3px] text-[9px] font-bold text-amber-200/70 tracking-wider">KHOẢNG CÁCH (KHÚC)</span>
        {/* Power charge bar (bottom half) */}
        <div className="absolute inset-x-0 bottom-0 h-4 bg-slate-900/90 border-t border-slate-700">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-600 transition-all duration-75"
            style={{ width: `${isCharging ? chargingPower : 0}%` }}
          />
          {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
            <div
              key={v}
              className="absolute top-0 h-full flex items-center"
              style={{ left: `${v}%`, transform: 'translateX(-100%)' }}
            >
              <span className="text-[8px] font-black text-slate-300 pr-0.5 drop-shadow">{v}</span>
              <div className="w-px h-full bg-slate-500/80" />
            </div>
          ))}
          {/* Recommended power marker */}
          {visible && needPower !== null && (
            <div
              className="absolute top-0 h-full w-[3px] bg-emerald-300 shadow-[0_0_6px_#6ee7b7]"
              style={{ left: `${needPower}%`, transform: 'translateX(-50%)' }}
              title={`Lực cần: ${needPower}`}
            >
              <span className="absolute left-1/2 -translate-x-1/2 -top-[17px] px-1 rounded bg-emerald-500 text-slate-950 text-[10px] font-black leading-4">
                {needPower}
              </span>
            </div>
          )}
          <span className="absolute left-2 top-0 text-[9px] font-bold text-slate-300/70 leading-4 tracking-wider">LỰC BẮN</span>
          {isCharging && (
            <span className="absolute right-1 -top-4 text-[11px] font-black text-amber-300 drop-shadow">
              {chargingPower} Lực
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
