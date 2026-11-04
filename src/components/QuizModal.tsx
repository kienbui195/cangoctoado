import React from 'react';
import { RoyaleEngine } from '../game/royaleEngine';
import type { GameIO } from '../game/gameIO';
import { QUIZ_LIMIT_MS } from '../game/royaleEngine';
import { ELEMENTS, TIERS, TIER_ORDER, WEAPON_BY_ID } from '../data/royaleWeapons';
import { ElementBadge } from './WeaponBits';

const LETTERS = ['A', 'B', 'C', 'D'];
const DIFF_LABEL = { easy: 'DỄ', medium: 'TRUNG BÌNH', hard: 'KHÓ' } as const;

// Opens when this seat hits a gift box. Only this seat is frozen; the world and the clock keep running, so a question
// left open for QUIZ_LIMIT_MS counts as wrong. The engine closes the window a moment after the result is shown.
export const QuizModal: React.FC<{ engine: RoyaleEngine; io: GameIO }> = ({ engine, io }) => {
  const qz = engine.quiz;
  const done = !!qz?.result;
  const msLeft = qz ? Math.max(0, qz.expireAt - engine.time) : 0;
  const secLeft = Math.ceil(msLeft / 1000);
  const pctLeft = Math.min(100, (msLeft / QUIZ_LIMIT_MS) * 100);

  if (!qz) return null;
  const tier = TIERS[qz.tier];
  const q = qz.question;
  const reward = qz.result?.reward ?? null;
  const rw = reward ? WEAPON_BY_ID[reward.weaponId] : null;
  const upgrade = qz.kind === 'upgrade';
  const target = upgrade ? engine.players[engine.mySeat].lineup.find((o) => o.uid === qz.uid) ?? null : null;
  const targetW = target ? WEAPON_BY_ID[target.weaponId] : rw;
  const fromTier = TIERS[TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(qz.tier) - 1)]];

  return (
    <div data-hud className="absolute inset-0 z-50 pointer-events-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 short:p-2">
      <div
        className="w-full max-w-xl short:w-fit short:min-w-[380px] short:max-w-[600px] max-h-full overflow-y-auto overscroll-contain rounded-3xl short:rounded-2xl bg-slate-900 p-6 short:px-4 short:py-2.5 shadow-2xl"
        style={{ border: `3px solid ${tier.color}`, boxShadow: `0 0 40px ${tier.color}55` }}
      >
        <div className="flex items-center justify-between mb-4 short:mb-1.5">
          <span className="flex items-center gap-2 text-sm short:text-xs font-black" style={{ color: tier.color }}>
            {upgrade && targetW ? (
              <>
                ⬆ Nâng cấp {targetW.icon} {targetW.name}: {fromTier.label} → {tier.label}
              </>
            ) : (
              <>🎁 Hộp quà {tier.label}</>
            )}
          </span>
          <span className="text-[11px] short:text-[10px] font-black px-2.5 py-1 short:py-0.5 rounded-full border" style={{ color: tier.color, borderColor: tier.color }}>
            Độ khó: {DIFF_LABEL[q.difficulty]}
          </span>
        </div>

        {!done && (
          <div className="mb-4 short:mb-1.5">
            <div className="flex items-center justify-between mb-1.5 short:mb-1">
              <span className="text-xs font-bold text-slate-400">Thời gian trả lời</span>
              <span className={`text-4xl short:text-xl font-black font-['Fredoka'] leading-none ${secLeft <= 5 ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>
                ⏱ {secLeft}
                <span className="text-lg short:text-sm">s</span>
              </span>
            </div>
            <div className="h-2.5 short:h-1.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className={`h-full transition-[width] duration-100 ${secLeft <= 5 ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${pctLeft}%` }} />
            </div>
          </div>
        )}

        {!done ? (
          <>
            <h3 className="text-xl short:text-base font-extrabold text-white mb-5 short:mb-2 leading-snug">{q.text}</h3>
            <div className="grid gap-2.5 short:gap-1.5 short:grid-cols-2">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => io.answerQuiz(i)}
                  className="text-left px-4 py-3 short:px-2.5 short:py-1.5 short:text-sm rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-amber-400 text-slate-100 font-bold transition active:scale-[0.98] flex items-center gap-3"
                >
                  <span className="w-7 h-7 short:w-6 short:h-6 shrink-0 rounded-lg bg-slate-950 text-amber-300 flex items-center justify-center text-sm font-black">{LETTERS[i]}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 short:mt-1.5 text-center text-[11px] short:text-[10px] text-slate-500">{upgrade ? 'Trả lời đúng để nâng phẩm cấp · Trả lời sai hoặc quá giờ vẫn mất 1 lượt nâng cấp' : 'Đồng hồ trận vẫn chạy · Quá giờ tính là sai · Trả lời đúng để nhận ngẫu nhiên 1 vũ khí'}</p>
          </>
        ) : qz.result!.correct && rw && reward ? (
          <div className="text-center py-4 short:py-1 animate-in zoom-in-95">
            <div className="text-emerald-400 font-black text-2xl short:text-lg mb-3 short:mb-1">{upgrade ? '⬆ NÂNG CẤP THÀNH CÔNG!' : '✔ CHÍNH XÁC!'}</div>
            <div className={`relative mx-auto w-28 h-28 short:w-16 short:h-16 rounded-2xl flex items-center justify-center text-6xl short:text-4xl bg-slate-950 ${reward.tier === 'red' ? 'legend-glow' : ''}`} style={{ border: `3px solid ${TIERS[reward.tier].color}`, boxShadow: `0 0 30px ${TIERS[reward.tier].color}88` }}>
              {rw.icon}
              <span className="absolute -bottom-2 -right-2"><ElementBadge element={reward.element} size={30} /></span>
            </div>
            <div className="mt-3 short:mt-1 text-xl short:text-base font-black text-white">{rw.name}</div>
            <div className="text-sm font-bold" style={{ color: TIERS[reward.tier].color }}>
              Phẩm cấp {TIERS[reward.tier].label} · Hệ {ELEMENTS[reward.element].name}
            </div>
            {upgrade && reward.tier === 'red' && <div className="text-xs font-bold text-amber-300 mt-1">✨ LEGEND: phát sáng và mạnh hơn!</div>}
            <div className="mt-1 text-xs text-slate-300 max-w-sm mx-auto">{rw.trait}</div>
          </div>
        ) : (
          <div className="text-center py-8 short:py-2">
            <div className="text-6xl short:text-4xl mb-3 short:mb-1">😵</div>
            <div className="text-rose-400 font-black text-2xl short:text-lg">✘ TRẢ LỜI SAI!</div>
            <div className="text-xs text-slate-400 mt-2">{upgrade ? 'Bạn mất 1 lượt nâng cấp.' : 'Hộp quà đã biến mất...'}</div>
          </div>
        )}
      </div>
    </div>
  );
};
