import React from 'react';
import { BOT_LEVELS, BotLevel } from '../game/royaleEngine';
import { loadBotLevel, saveBotLevel } from '../game/botLevelStore';
import { soundManager } from '../utils/audio';

const ORDER = Object.keys(BOT_LEVELS) as BotLevel[];
const ICON: Record<BotLevel, string> = { easy: '🐣', medium: '🤖', super: '🔥' };

interface Props {
  onPick: (level: BotLevel) => void;
  /** back out without choosing (the lobby and the end-of-match screen both allow it) */
  onClose: () => void;
}

// Asks which bot to play against. The level used last time is only highlighted: the match starts after a click.
export const BotLevelModal: React.FC<Props> = ({ onPick, onClose }) => {
  const [remembered] = React.useState(loadBotLevel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4" role="dialog" aria-modal="true" aria-label="Chọn bot">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-center text-2xl font-black text-amber-300 font-['Fredoka']">Chơi với bot nào?</h2>
        <p className="mt-1 text-center text-xs text-slate-400">Bot khó hơn thì bắn trúng hộp và trả lời đúng nhiều hơn.</p>
        <div className="mt-4 space-y-3">
          {ORDER.map((lv) => {
            const cfg = BOT_LEVELS[lv];
            const mark = remembered === lv;
            return (
              <button
                key={lv}
                onClick={() => {
                  soundManager.playClick();
                  saveBotLevel(lv);
                  onPick(lv);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition hover:border-amber-400 hover:bg-slate-800 ${mark ? 'border-amber-400 bg-slate-800 ring-2 ring-amber-400/50' : 'border-slate-700 bg-slate-950/60'}`}
              >
                <span className="text-3xl">{ICON[lv]}</span>
                <span className="flex-1">
                  <span className="block font-black text-slate-100">
                    {cfg.label} {mark && <span className="ml-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">chọn lần trước</span>}
                  </span>
                  <span className="block text-xs text-slate-400">
                    Bắn trúng hộp {Math.round(cfg.hit * 100)}% · Trả lời đúng {Math.round(cfg.correct * 100)}%
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-xl border border-slate-700 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800">
          Quay lại
        </button>
      </div>
    </div>
  );
};
