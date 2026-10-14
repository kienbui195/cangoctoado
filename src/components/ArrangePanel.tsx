import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { GameIO } from '../game/gameIO';
import { RoyaleEngine, MAX_LINEUP, UPGRADES_PER_PLAYER, sameBonusAt, sinhBonusAt, teamOf, weaponScore } from '../game/royaleEngine';
import { ELEMENTS, isSinh, nextTier, TIERS, WEAPON_BY_ID } from '../data/royaleWeapons';
import { ElementBadge, ElementRules } from './WeaponBits';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Simple toolbar at the bottom-center: order your weapons (1st = round 1 ...), the 7th goes to the bench.
export const ArrangePanel: React.FC<{ engine: RoyaleEngine; io: GameIO }> = ({ engine: e, io }) => {
  const me = e.players[e.mySeat];
  const others = e.players.filter((p) => p.idx !== e.mySeat && !p.out);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const slots = Math.max(MAX_LINEUP, me.lineup.length);

  return (
    <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none z-40 px-2">
      <div data-hud className="pointer-events-auto bg-slate-950/92 backdrop-blur-md border border-amber-500/50 rounded-2xl shadow-2xl p-3 max-w-full">
        <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
          <div>
            <div className="text-sm font-black text-amber-300 font-['Fredoka'] tracking-wide">SẮP XẾP VŨ KHÍ RA TRẬN</div>
            <div className="text-[11px] text-slate-400">Kéo thả hoặc dùng ◀ ▶ · Tối đa {MAX_LINEUP} vũ khí = {MAX_LINEUP} hiệp · Vũ khí dự bị không ra trận</div>

          </div>
          <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
            <span className="px-2 py-1 rounded-lg bg-slate-900 border border-violet-500/60 text-violet-200">
              ⬆ Lượt nâng cấp: <b className="text-white">{me.upgradesLeft}/{UPGRADES_PER_PLAYER}</b>
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200">
              ⏱ Chuẩn bị: <b className="text-amber-300">{mmss(e.arrangeLeft)}</b>
            </span>
            {others.map((o) => (
              <span key={o.idx} className={`px-2 py-1 rounded-lg border ${o.ready ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                {e.players.length > 2 && <b className={teamOf(o.idx) === teamOf(e.mySeat) ? 'text-sky-300' : 'text-rose-300'}>{teamOf(o.idx) === teamOf(e.mySeat) ? '[đồng đội] ' : '[địch] '}</b>}
                {o.name}: {o.ready ? 'Sẵn sàng ✔' : 'đang sắp xếp...'}
              </span>
            ))}
          </div>
        </div>

        <div className="mb-2"><ElementRules /></div>

        <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
          {Array.from({ length: slots }).map((_, i) => {
            const ow = me.lineup[i];
            const bench = i >= MAX_LINEUP;
            const w = ow ? WEAPON_BY_ID[ow.weaponId] : null;
            const t = ow ? TIERS[ow.tier] : null;
            const prev = i > 0 ? me.lineup[i - 1] : undefined;
            const chain = !!ow && !!prev && !bench && isSinh(prev.element, ow.element);
            const sinhPct = ow && !bench ? Math.round(sinhBonusAt(me.lineup, i) * 100) : 0;
            const samePct = ow && !bench ? Math.round(sameBonusAt(me.lineup, i) * 100) : 0;
            const canUp = !!ow && !me.ready && me.upgradesLeft > 0 && !!nextTier(ow.tier);
            return (
              <React.Fragment key={i}>
                {bench && i === MAX_LINEUP && <div className="w-px bg-slate-600 mx-1" />}
                <div
                  className={`relative w-[100px] shrink-0 rounded-xl p-1.5 text-center transition ${ow && ow.tier === 'red' ? 'legend-glow' : ''} ${ow ? 'bg-slate-900' : 'bg-slate-900/40 border border-dashed border-slate-700'} ${over === i && dragFrom !== null ? 'ring-2 ring-amber-300' : ''} ${bench ? 'opacity-70' : ''}`}
                  style={ow ? { border: `2px solid ${t!.color}`, boxShadow: `0 0 10px ${t!.color}44` } : undefined}
                  draggable={!!ow && !me.ready}
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(ev) => {
                    ev.preventDefault();
                    setOver(i);
                  }}
                  onDrop={() => {
                    if (dragFrom !== null && ow) io.moveLineup(dragFrom, i);
                    setDragFrom(null);
                    setOver(null);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setOver(null);
                  }}
                  title={w ? `${w.name} — ${t!.label} — Hệ ${ELEMENTS[ow!.element].name}\n${w.trait}\n${ELEMENTS[ow!.element].perk}` : undefined}
                >
                  <div className="text-[9px] font-black tracking-wider text-slate-400">{bench ? 'DỰ BỊ' : `HIỆP ${i + 1}`}</div>
                  {ow && w && t ? (
                    <>
                      <span className="absolute top-1 right-1"><ElementBadge element={ow.element} size={18} /></span>
                      {chain && (
                        <span className="absolute -left-2 top-1/2 -translate-y-1/2 z-10 px-1 rounded bg-emerald-500 text-slate-950 text-[9px] font-black shadow" title={`${ELEMENTS[prev!.element].name} sinh ${ELEMENTS[ow.element].name}`}>
                          +{sinhPct}%
                        </span>
                      )}
                      {samePct > 0 && (
                        <span className="absolute -right-2 top-1/2 -translate-y-1/2 z-10 px-1 rounded bg-sky-400 text-slate-950 text-[9px] font-black shadow" title={`Cùng hệ ${ELEMENTS[ow.element].name} liên tiếp: hiệu ứng +${samePct}%`}>
                          🔁{samePct}%
                        </span>
                      )}
                      <div className="text-3xl leading-9">{w.icon}</div>
                      <div className="text-[10px] font-bold text-slate-100 leading-tight h-6 flex items-center justify-center">{w.name}</div>
                      <div className="text-[9px] font-black" style={{ color: t.color }}>
                        {t.label} · {Math.round(weaponScore(ow))}
                      </div>
                      {canUp && (
                        <button
                          onClick={() => io.startUpgrade(ow.uid)}
                          className="mt-1 w-full text-[9px] font-black py-0.5 rounded bg-violet-600 hover:bg-violet-500 text-white"
                          title={`Mỗi lần thử tốn 1 lượt (kể cả trả lời sai). Trả lời đúng 1 câu trung bình/khó để lên ${TIERS[nextTier(ow.tier)!].label}`}
                        >
                          ⬆ Nâng cấp
                        </button>
                      )}
                      {!me.ready && (
                        <div className="flex justify-between mt-1">
                          <button disabled={i === 0} onClick={() => io.moveLineup(i, i - 1)} className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-25 text-slate-200">
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <button disabled={i >= me.lineup.length - 1} onClick={() => io.moveLineup(i, i + 1)} className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-25 text-slate-200">
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-[72px] flex items-center justify-center text-slate-700 text-2xl">+</div>
                  )}
                </div>
              </React.Fragment>
            );
          })}

          <div className="flex items-center pl-2">
            <div className="flex flex-col gap-1.5 h-full min-h-[84px]">
              <button
                disabled={me.ready}
                onClick={() => io.suggestLineup()}
                className="flex-1 px-3 rounded-xl font-black text-[11px] leading-tight text-slate-950 bg-gradient-to-b from-violet-300 to-violet-500 hover:from-violet-200 disabled:opacity-40 shadow active:scale-95 transition"
                title="Tự xếp theo Ngũ hành tương sinh (ưu tiên số mắt xích sinh), sau đó bạn vẫn có thể nâng cấp hoặc sắp xếp lại"
              >
                ✨ Đề xuất
                <br />
                tương sinh
              </button>
              {me.ready ? (
                <button
                  onClick={() => io.cancelReady()}
                  className="flex-1 px-3 rounded-xl font-black text-[11px] leading-tight text-white bg-gradient-to-b from-rose-500 to-rose-700 hover:from-rose-400 shadow active:scale-95 transition"
                >
                  ✋ BỎ SẴN SÀNG
                </button>
              ) : (
                <button
                  onClick={() => io.setReady()}
                  className="flex-1 px-4 rounded-xl font-black text-sm tracking-wide text-slate-950 bg-gradient-to-b from-emerald-300 to-emerald-500 hover:from-emerald-200 shadow-lg active:scale-95 transition flex items-center justify-center gap-1"
                >
                  <Check className="w-5 h-5" />
                  SẴN SÀNG
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
