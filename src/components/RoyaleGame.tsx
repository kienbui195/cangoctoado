import React, { useMemo, useState } from 'react';
import { GameStage } from './GameStage';
import { MatchSummary } from './MatchSummary';
import { RoyaleEngine } from '../game/royaleEngine';
import { baseProfile } from '../game/baseProfile';
import { localIO } from '../game/gameIO';
import { soundManager } from '../utils/audio';

const makeEngine = () => new RoyaleEngine([baseProfile('GunnyPro_9x'), baseProfile('Người Chơi 2')]);

// Practice mode: you against the built-in bot, everything runs in this browser.
export const RoyaleGame: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [engine, setEngine] = useState(makeEngine);
  const io = useMemo(() => localIO(engine), [engine]);

  return (
    <GameStage
      engine={engine}
      io={io}
      onExit={onExit}
      exitLabel="Thoát"
      renderResult={() => (
        <MatchSummary engine={engine}>
          <div className="flex gap-3">
            <button
              onClick={() => {
                soundManager.playClick();
                setEngine(makeEngine());
              }}
              className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-black text-sm rounded-xl shadow-lg transition active:scale-95"
            >
              CHƠI LẠI
            </button>
            <button onClick={onExit} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-sm rounded-xl border border-amber-500/30 transition">
              Màn hình chờ
            </button>
          </div>
        </MatchSummary>
      )}
    />
  );
};
