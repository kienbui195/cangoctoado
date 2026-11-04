import React, { useEffect, useMemo, useState } from 'react';
import { DoorOpen, Volume2, VolumeX } from 'lucide-react';
import { GameViewport, minimapTopFor, useShortScreen } from './GameViewport';
import { RoyaleCanvas } from './RoyaleCanvas';
import { RoyaleHUD } from './RoyaleHUD';
import { QuizModal } from './QuizModal';
import { ArrangePanel } from './ArrangePanel';
import { ioPad, PadToggle, VirtualPad, useVirtualPadSetting } from './VirtualPad';
import { RoyaleEngine, TEAM_COLOR, teamOf } from '../game/royaleEngine';
import { bindGameKeys, GameIO } from '../game/gameIO';
import { isSolid, WORLD_H, WORLD_W } from '../utils/terrain';
import { soundManager } from '../utils/audio';

const WORLD_CORNERS = [
  { x: 0, y: 0 },
  { x: WORLD_W, y: WORLD_H },
];

interface Props {
  engine: RoyaleEngine;
  io: GameIO;
  onExit: () => void;
  exitLabel?: string;
  /** overlay drawn when the match is over (rendered again on every HUD refresh) */
  renderResult: () => React.ReactNode;
  /** small strip on top of the world, e.g. a connection warning */
  renderStatus?: () => React.ReactNode;
}

// The match screen shared by local play and online play: world canvas + HUD + arrange panel + question window.
export const GameStage: React.FC<Props> = ({ engine, io, onExit, exitLabel = 'Thoát', renderResult, renderStatus }) => {
  // the classic ruler asks the page for a terrain test: must exist before the first render
  useState(() => {
    (window as any).__gunnyCheckTerrain = isSolid;
    return 0;
  });
  const [, setTick] = useState(0);
  const [muted, setMuted] = useState(!soundManager.enabled);
  const [padOn, setPadOn] = useVirtualPadSetting();
  const short = useShortScreen();
  const pad = useMemo(() => ioPad(io), [io]);

  // HUD refresh (the canvas runs on its own rAF loop)
  useEffect(() => {
    // 10 Hz is plenty for the clocks; the canvas and the power bar run on their own rAF loops
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1e9), 100);
    const unsub = engine.subscribe(() => setTick((t) => (t + 1) % 1e9));
    return () => {
      window.clearInterval(id);
      unsub();
    };
  }, [engine]);

  useEffect(() => bindGameKeys(io), [io]);

  // beep when the turn passes to me
  const ct = engine.cturn;
  const myTurnKey = engine.phase === 'collect' && ct && ct.step === 'aim' && ct.seat === engine.mySeat ? ct.startedAt || 1 : 0;
  useEffect(() => {
    if (myTurnKey) soundManager.playYourTurn();
  }, [myTurnKey]);

  const battleView = engine.phase === 'battle' || engine.phase === 'result';
  const markerKey = engine.players.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
  const markers = useMemo(() => engine.players.map((p) => ({ x: p.x, y: p.y, color: TEAM_COLOR[teamOf(p.idx)] })), [markerKey, engine]);
  const standing = engine.players.filter((p) => !p.out);
  const battlePoints = (standing.length ? standing : engine.players).map((p) => ({ x: p.x, y: p.y }));

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-100 font-['Nunito',sans-serif]">
      <GameViewport
        focusPoints={battleView ? battlePoints : WORLD_CORNERS}
        markers={markers}
        minimapTop={minimapTopFor(engine.players.length / 2, short)}
        onWorldClick={(x, y) => io.selectBoxAt(x, y)}
        world={<RoyaleCanvas engine={engine} />}
        overlay={(view) => (
          <>
            <RoyaleHUD engine={engine} view={view} />
            {renderStatus?.()}
            {engine.phase === 'arrange' && !engine.players[engine.mySeat].out && <ArrangePanel engine={engine} io={io} />}
            {padOn && engine.phase === 'collect' && !engine.quiz && !engine.players[engine.mySeat].out && (
              <VirtualPad control={pad} active={engine.canAim(engine.mySeat)} charging={engine.players[engine.mySeat].charging} insetLeft={132} insetRight={184} />
            )}
            {engine.quiz && <QuizModal engine={engine} io={io} />}
            {engine.phase === 'result' && engine.result && renderResult()}

            <div data-hud className="absolute left-2 bottom-2 z-40 flex gap-1 pointer-events-auto">
              <button onClick={onExit} className="p-1.5 rounded-lg bg-slate-900/85 border border-slate-700 text-rose-300 hover:bg-slate-800" title={exitLabel} aria-label={exitLabel}>
                <DoorOpen className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  soundManager.enabled = !soundManager.enabled;
                  setMuted(!soundManager.enabled);
                }}
                className="p-1.5 rounded-lg bg-slate-900/85 border border-slate-700 text-slate-200 hover:bg-slate-800"
                title="Bật/Tắt âm thanh"
              >
                {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <PadToggle on={padOn} onChange={setPadOn} />
            </div>
          </>
        )}
      />
    </div>
  );
};
