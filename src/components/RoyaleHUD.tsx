import React from 'react';
import { motion } from 'motion/react';
import { Wind } from 'lucide-react';
import { RoyaleEngine, RPlayer, MAX_LINEUP, WEAPONS_TO_WIN, TEAM_LABEL, teamOf } from '../game/royaleEngine';
import { OwnedWeapon, TIERS, WEAPON_BY_ID } from '../data/royaleWeapons';
import { GunnyRuler } from './GunnyRuler';
import { ElementBadge } from './WeaponBits';
import { CARD_H, minimapTopFor, MINIMAP_BLOCK_H, type ViewInfo } from './GameViewport';
import type { PlayerEntity } from '../types/game';

interface Props {
  engine: RoyaleEngine;
  view: ViewInfo;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const titleStroke =
  '-2px -2px 0 #1d4ed8, 2px -2px 0 #1d4ed8, -2px 2px 0 #1d4ed8, 2px 2px 0 #1d4ed8, 0 0 14px #60a5fa';

export const RoyaleHUD: React.FC<Props> = ({ engine: e, view }) => {
  const p1 = e.players[e.mySeat]; // left = my team (me first), right = the enemy team
  const myTeam = teamOf(e.mySeat);
  const allies = [p1, ...e.players.filter((p) => teamOf(p.idx) === myTeam && p.idx !== e.mySeat)];
  const foes = e.players.filter((p) => teamOf(p.idx) !== myTeam);
  const perTeam = e.players.length / 2;
  const leftPanelsTop = 6 + perTeam * CARD_H;
  const rightPanelsTop = minimapTopFor(perTeam) + MINIMAP_BLOCK_H;
  const multi = e.players.length > 2;
  const inCollect = e.phase === 'collect';
  const showTitle = e.phase === 'intro' || e.phase === 'collect';

  // --- adapters so the classic ruler can be reused: shooter = human, target = nearest box
  const target = inCollect ? e.rulerTarget() : null;
  const shooter = {
    x: p1.x,
    y: p1.y,
    facing: p1.facing,
    angle: Math.round(p1.angle),
  } as unknown as PlayerEntity;
  const rulerTarget = target
    ? ({ x: target.x, y: target.y } as unknown as PlayerEntity)
    : ({ x: p1.x + p1.facing * 400, y: p1.y } as unknown as PlayerEntity);

  const banner = e.banner && e.time < e.banner.until ? e.banner : null;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-30">
      {inCollect && (
        <GunnyRuler
          view={view}
          shooter={shooter}
          target={rulerTarget}
          windSpeed={e.wind}
          visible={e.canAim(e.mySeat)}
          isCharging={p1.charging}
          chargingPower={Math.round(p1.charge)}
        />
      )}

      {/* Player cards + wind */}
      <div className="absolute top-1 left-1 right-1 flex items-start justify-between pointer-events-none">
        <div className="flex flex-col gap-1 w-full max-w-[260px]">
          {allies.map((p) => (
            <PlayerCard key={p.idx} p={p} side="left" e={e} />
          ))}
        </div>
        <WindGauge speed={e.wind} />
        <div className="flex flex-col items-end gap-1 w-full max-w-[260px]">
          {foes.map((p) => (
            <PlayerCard key={p.idx} p={p} side="right" e={e} />
          ))}
        </div>
      </div>

      {/* Weapon panels in the bottom corners (left = your team, right = the enemy team): the ground there is never in play */}
      <div className="absolute left-1 bottom-12 flex flex-wrap-reverse content-end gap-1 w-[244px]">
        {allies.map((p) => (
          <WeaponPanel key={p.idx} p={p} e={e} named={multi} />
        ))}
      </div>
      <div className="absolute right-14 bottom-2 flex flex-wrap-reverse content-end justify-end gap-1 w-[244px]">
        {foes.map((p) => (
          <WeaponPanel key={p.idx} p={p} e={e} named={multi} />
        ))}
      </div>

      {/* Knocked out (disconnected for good): the match goes on without this seat */}
      {p1.alert && e.time < p1.alert.until && (
        <div data-hud className="absolute top-[110px] left-1/2 -translate-x-1/2 z-40 max-w-[80vw] text-center px-5 py-3 rounded-2xl bg-rose-700/95 border-2 border-amber-300 text-white text-base font-black shadow-2xl animate-pulse">
          {p1.alert.text}
        </div>
      )}
      {p1.out && e.phase !== 'result' && (
        <div className="absolute top-[100px] left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl bg-rose-900/90 border border-rose-500 text-rose-100 text-sm font-black">
          📴 Bạn đã bị loại khỏi ván (mất kết nối quá lâu). Đồng đội vẫn đang chơi, bạn có thể xem tiếp.
        </div>
      )}

      {/* Whose turn (collection is turn-based) */}
      {inCollect && e.cturn && <TurnPill e={e} />}

      {/* Round indicator in battle */}
      {e.phase === 'battle' && e.battle && (
        <div className="absolute top-[70px] left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-slate-950/85 border border-amber-400/60 text-amber-300 font-black text-sm font-['Fredoka'] tracking-wider">
          HIỆP {Math.min(e.battle.round + 1, e.battle.rounds)} / {e.battle.rounds}
        </div>
      )}

      {/* Title that starts big in the middle, then shrinks to the top-left with the countdown */}
      {showTitle && <CollectTitle engine={e} />}

      
      {/* Center banners (time up, rounds, weapon name...) */}
      {banner && (
        <motion.div
          key={`${banner.text}-${banner.until}`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 text-center px-6"
        >
          <div
            className="font-black font-['Fredoka'] tracking-wide text-5xl md:text-6xl"
            style={{ color: banner.color, textShadow: '0 3px 0 rgba(2,6,23,.9), 0 0 24px rgba(0,0,0,.6)' }}
          >
            {banner.text}
          </div>
          {banner.sub && (
            <div className="mt-2 inline-block max-w-[80vw] px-4 py-1 rounded-full bg-slate-950/80 text-slate-100 text-sm font-bold border border-slate-600">
              {banner.sub}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- turn
const TurnPill: React.FC<{ e: RoyaleEngine }> = ({ e }) => {
  const ct = e.cturn!;
  const mine = ct.seat === e.mySeat;
  const who = mine ? 'bạn' : e.players[ct.seat].name;
  const left = Math.max(0, Math.ceil((ct.until - e.time) / 1000));
  const aiming = ct.step === 'aim';
  const urgent = aiming && left <= 5;
  // big announcement in the middle for the first 1.4s of my turn, then only the pill stays
  const sinceStart = aiming ? e.time - ct.startedAt : Infinity;
  const splash = mine && aiming && sinceStart < 1400;
  const text =
    aiming
      ? mine
        ? 'LƯỢT CỦA BẠN · ngắm và bắn'
        : `Lượt của ${who}`
      : ct.step === 'quiz'
        ? `📝 ${mine ? 'Bạn đang' : who + ' đang'} trả lời câu hỏi`
        : ct.step === 'flight'
          ? `💥 ${mine ? 'Bạn' : who} đã bắn...`
          : `Lượt kế tiếp: ${mine ? 'bạn' : who}`;
  return (
    <>
      {splash && (
        <motion.div
          key={ct.startedAt}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.15, 1, 1] }}
          transition={{ duration: 1.4, times: [0, 0.2, 0.75, 1] }}
          className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none"
        >
          <div
            className="font-black font-['Fredoka'] text-6xl md:text-7xl text-amber-300"
            style={{ textShadow: '0 4px 0 #92400e, 0 0 30px rgba(251,191,36,.8)' }}
          >
            LƯỢT CỦA BẠN!
          </div>
        </motion.div>
      )}
      <div
        className={`absolute top-[68px] left-1/2 -translate-x-1/2 flex items-center gap-3 pl-4 pr-3 py-1.5 rounded-2xl border-2 font-black font-['Fredoka'] tracking-wide ${
          mine && aiming ? 'bg-amber-400 text-slate-950 border-amber-100 shadow-[0_0_26px_rgba(251,191,36,.7)]' : 'bg-slate-950/90 text-slate-100 border-slate-500'
        }`}
      >
        <span className="text-lg">{text}</span>
        {aiming && (
          <span className={`min-w-[64px] text-center rounded-xl px-2 py-0.5 text-3xl leading-none ${urgent ? 'bg-rose-600 text-white animate-pulse' : mine ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-amber-300'}`}>
            {left}
            <span className="text-base">s</span>
          </span>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------- title
const CollectTitle: React.FC<{ engine: RoyaleEngine }> = ({ engine: e }) => {
  const big = e.phase === 'intro';
  return (
    <motion.div
      className="absolute"
      initial={false}
      animate={
        big
          ? { left: '50%', top: '38%', x: '-50%', y: '-50%', fontSize: 76 }
          : { left: 282, top: 22, x: '0%', y: '0%', fontSize: 24 }
      }
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontStyle: 'italic', color: '#e0f2fe', textShadow: titleStroke, whiteSpace: 'nowrap', lineHeight: 1.1 }}
    >
      {big ? (
        <>
          <div className="text-center">THU THẬP VŨ KHÍ</div>
          <div className="text-center not-italic" style={{ fontSize: 28, color: '#fde68a', textShadow: '0 2px 0 #92400e, 0 0 12px #f59e0b' }}>
            Thời gian thu thập: 5 phút
          </div>
          <div className="text-center not-italic" style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0', textShadow: '0 2px 6px rgba(0,0,0,.9)', marginTop: 6 }}>
            Trong giai đoạn này, người chơi không thể gây sát thương cho nhau.
          </div>
        </>
      ) : (
        <span>Thu thập vũ khí còn {mmss(e.collectLeft)}s</span>
      )}
    </motion.div>
  );
};

// ---------------------------------------------------------------- pieces
const WindGauge: React.FC<{ speed: number }> = ({ speed }) => (
  <div className="flex flex-col items-center">
    <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1 rounded-xl border border-cyan-500/50 shadow-xl flex items-center gap-2">
      <Wind className={`w-5 h-5 ${speed >= 0 ? 'text-cyan-400' : 'text-amber-400'}`} />
      <div className="text-center">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">SỨC GIÓ (WIND)</div>
        <div className="flex items-center gap-1.5">
          <span className={`text-base font-black font-['Fredoka'] ${speed > 0 ? 'text-cyan-300' : speed < 0 ? 'text-amber-400' : 'text-slate-300'}`}>
            {Math.abs(speed).toFixed(1)} m/s
          </span>
          <span className="text-xs font-bold text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
            {speed > 0 ? '➔ Xuôi' : speed < 0 ? '⬅ Ngược' : 'Lặng'}
          </span>
        </div>
      </div>
      <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden relative border border-slate-700">
        <div
          className={`absolute top-0 bottom-0 ${speed >= 0 ? 'bg-cyan-400' : 'bg-amber-400'}`}
          style={{
            left: speed >= 0 ? '50%' : `${50 + (speed / 4) * 50}%`,
            width: `${Math.min(50, (Math.abs(speed) / 4) * 50)}%`,
          }}
        />
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/70" />
      </div>
    </div>
  </div>
);

const PlayerCard: React.FC<{ p: RPlayer; side: 'left' | 'right'; e: RoyaleEngine }> = ({ p, side, e }) => {
  const left = side === 'left';
  const team = teamOf(p.idx);
  const inBattle = e.phase === 'battle' || e.phase === 'result';
  const down = p.out || (inBattle && p.hp <= 0);
  const multi = e.players.length > 2;
  const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);
  const count = inBattle ? Math.min(p.lineup.length, MAX_LINEUP) : e.phase === 'arrange' ? p.collected : p.weapons.length;
  return (
    <div
      style={{ height: CARD_H - 4 }}
      className={`flex items-center gap-3 bg-slate-950/80 backdrop-blur-md p-1.5 rounded-xl border shadow-xl max-w-[260px] w-full ${p.idx === e.mySeat && multi ? 'border-amber-400/70' : 'border-slate-800'} ${down ? 'opacity-50 grayscale' : ''} ${left ? '' : 'flex-row-reverse'}`}
    >
      <div className="relative">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl shadow-lg border ${team === 0 ? 'bg-gradient-to-tr from-amber-600 to-yellow-400 border-yellow-300/40' : 'bg-gradient-to-tr from-cyan-600 to-blue-400 border-cyan-300/40'}`}>
          {down ? '💀' : left ? '🤠' : '🤖'}
        </div>
        {multi && <span className={`absolute -bottom-1 -right-1 text-[9px] font-black rounded px-1 ${team === 0 ? 'bg-amber-400 text-slate-950' : 'bg-cyan-400 text-slate-950'}`}>{TEAM_LABEL[team]}</span>}
      </div>
      <div className={`flex-1 min-w-0 ${left ? '' : 'text-right'}`}>
        <div className={`flex justify-between items-baseline mb-1 ${left ? '' : 'flex-row-reverse'}`}>
          <span className={`text-xs font-bold truncate max-w-[120px] ${team === 0 ? 'text-amber-300' : 'text-cyan-300'}`}>
            {p.name}
            {p.idx === e.mySeat && multi ? ' (bạn)' : ''}
            {p.out ? ' · rời trận' : p.away ? ' 📴' : ''}
          </span>
          <span className="text-[11px] font-black text-rose-400">
            {Math.max(0, Math.round(p.hp))} / {p.maxHp}
          </span>
        </div>
        <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
          <div
            className={`h-full ${left ? 'bg-gradient-to-r' : 'bg-gradient-to-l ml-auto'} from-red-600 via-rose-500 to-emerald-400 transition-all duration-300`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
        <div className={`mt-1 flex items-center gap-1 text-[9px] font-bold ${left ? '' : 'justify-end'}`}>
          <span className="text-amber-400">VŨ KHÍ</span>
          <span className="text-white">
            {count}/{inBattle ? MAX_LINEUP : WEAPONS_TO_WIN}
          </span>
          {p.shield > 0 && <span className="text-sky-300">🛡️-{Math.round(p.shield * 100)}%</span>}
          {p.weaken > 0 && <span className="text-cyan-300">❄️-{Math.round(p.weaken * 100)}%</span>}
          {p.empower > 0 && <span className="text-lime-300">🔋+{Math.round(p.empower * 100)}%</span>}
        </div>
      </div>
    </div>
  );
};

const Slot: React.FC<{ ow?: OwnedWeapon; dim?: boolean; mark?: boolean; index?: number }> = ({ ow, dim, mark, index }) => {
  if (!ow) {
    return (
      <div className="h-9 rounded-lg border border-dashed border-slate-700/80 bg-slate-900/50 flex items-center justify-center text-[10px] text-slate-600 font-bold">
        {index !== undefined ? index + 1 : ''}
      </div>
    );
  }
  const w = WEAPON_BY_ID[ow.weaponId];
  const t = TIERS[ow.tier];
  return (
    <div
      className={`relative h-9 rounded-lg border-2 flex items-center justify-center text-xl bg-slate-900 ${ow.tier === 'red' ? 'legend-glow' : ''} ${dim ? 'opacity-35 grayscale' : ''} ${mark ? 'ring-2 ring-amber-300 scale-105' : ''}`}
      style={{ borderColor: t.color, boxShadow: `0 0 8px ${t.color}55` }}
      title={`${w.name} — ${t.label}\n${w.trait}`}
    >
      {w.icon}
      <span className="absolute -bottom-1 -right-1"><ElementBadge element={ow.element} size={14} /></span>
      {index !== undefined && <span className="absolute -top-1 -left-1 text-[8px] bg-slate-950 text-slate-300 rounded px-0.5 font-black">{index + 1}</span>}
    </div>
  );
};

const WeaponPanel: React.FC<{ p: RPlayer; e: RoyaleEngine; named?: boolean }> = ({ p, e, named }) => {
  const inBattle = e.phase === 'battle' || e.phase === 'result';
  const arranging = e.phase === 'arrange';
  const items: (OwnedWeapon | undefined)[] = [];
  const slots = inBattle || arranging ? MAX_LINEUP : WEAPONS_TO_WIN;
  const src = inBattle || arranging ? p.lineup : p.weapons;
  for (let i = 0; i < slots; i++) items.push(src[i]);

  const round = e.battle?.round ?? 0;
  return (
    <div className={`w-[118px] bg-slate-950/70 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl ${p.out || (inBattle && p.hp <= 0) ? 'opacity-50' : ''}`}>
      {named && <div className={`text-[10px] font-black text-center truncate ${teamOf(p.idx) === 0 ? 'text-amber-300' : 'text-cyan-300'}`}>{p.name}</div>}
      <div className="text-[9px] font-black text-slate-400 tracking-wider text-center mb-1">
        {inBattle ? 'THỨ TỰ RA TRẬN' : arranging ? (teamOf(p.idx) === teamOf(e.mySeat) ? 'ĐỘI HÌNH' : 'ĐỘI HÌNH (ẨN)') : 'VŨ KHÍ ĐÃ NHẶT'}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {items.map((ow, i) => (
          <Slot key={i} ow={ow} index={inBattle || arranging ? i : undefined} dim={inBattle && i < round} mark={inBattle && i === p.lastWeaponIdx && e.battle?.turn?.shooter === p.idx} />
        ))}
      </div>
      {!inBattle && !arranging && (
        <div className="mt-1 text-center text-[10px] font-bold text-amber-300">
          {p.weapons.length} / {WEAPONS_TO_WIN}
        </div>
      )}
    </div>
  );
};
