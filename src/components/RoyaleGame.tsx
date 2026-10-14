import React, { useMemo, useState } from 'react';
import { GameStage } from './GameStage';
import { MatchSummary } from './MatchSummary';
import { BotLevelModal } from './BotLevelModal';
import { BOT_LEVELS, BotLevel, RoyaleEngine } from '../game/royaleEngine';
import { baseProfile } from '../game/baseProfile';
import { localIO } from '../game/gameIO';
import { soundManager } from '../utils/audio';

const makeEngine = (level: BotLevel) => new RoyaleEngine([baseProfile('GunnyPro_9x'), baseProfile('Người Chơi 2')], { botLevel: level });

// Practice mode: you against the built-in bot (the level was picked in the popup), everything runs in this browser.
export const RoyaleGame: React.FC<{ onExit: () => void; level: BotLevel }> = ({ onExit, level: firstLevel }) => {
  const [engine, setEngine] = useState(() => makeEngine(firstLevel));
  const level = engine.botLevel;
  const [pickOpen, setPickOpen] = useState(false);
  const io = useMemo(() => localIO(engine), [engine]);

  return (
    <>
      <GameStage
        engine={engine}
        io={io}
        onExit={onExit}
        exitLabel="Thoát"
        renderResult={() => (
          <MatchSummary engine={engine}>
            <div className="mb-2 text-center text-xs text-slate-400">Đã chơi với bot: <b className="text-amber-300">{BOT_LEVELS[level].label}</b></div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  soundManager.playClick();
                  setPickOpen(true);
                }}
                className="flex-1 min-w-[140px] py-3 bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-sm rounded-xl border border-sky-500/30 transition"
              >
                ĐỘ KHÓ KHÁC
              </button>
              <button
                onClick={() => {
                  soundManager.playClick();
                  setEngine(makeEngine(level));
                }}
                className="flex-1 min-w-[140px] py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-black text-sm rounded-xl shadow-lg transition active:scale-95"
              >
                CHƠI LẠI
              </button>
              <button onClick={onExit} className="flex-1 min-w-[140px] px-4 py-3 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-sm rounded-xl border border-amber-500/30 transition">
                Về phòng chờ
              </button>
            </div>
          </MatchSummary>
        )}
      />
      {pickOpen && (
        <BotLevelModal
          onClose={() => setPickOpen(false)}
          onPick={(lv) => {
            setPickOpen(false);
            setEngine(makeEngine(lv));
          }}
        />
      )}
    </>
  );
};
