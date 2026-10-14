// What the UI may ask the game to do. Local play calls the engine directly; online play sends the same intents to the server.
import type { RoyaleEngine, Seat, SeatInput } from './royaleEngine';

export interface GameIO {
  setInput(inp: Partial<SeatInput>): void;
  /** stop every held key and cancel a charge in progress (window lost focus) */
  releaseAll(): void;
  startCharge(): void;
  releaseCharge(): void;
  selectBoxAt(x: number, y: number): void;
  answerQuiz(choice: number): void;
  startUpgrade(uid: string): void;
  moveLineup(from: number, to: number): void;
  suggestLineup(): void;
  setReady(): void;
  cancelReady(): void;
}

export const localIO = (engine: RoyaleEngine, seat: Seat = 0): GameIO => ({
  setInput: (inp) => engine.setInput(seat, inp),
  releaseAll: () => {
    engine.clearInput(seat);
    engine.releaseCharge(seat);
  },
  startCharge: () => engine.startCharge(seat),
  releaseCharge: () => engine.releaseCharge(seat),
  selectBoxAt: (x, y) => engine.selectBoxAt(seat, x, y),
  answerQuiz: (c) => engine.answerQuiz(seat, c),
  startUpgrade: (uid) => engine.startUpgrade(seat, uid),
  moveLineup: (from, to) => engine.moveLineup(seat, from, to),
  suggestLineup: () => engine.suggestLineup(seat),
  setReady: () => engine.setReady(seat),
  cancelReady: () => engine.cancelReady(seat),
});

/** Keyboard wiring shared by local and online play: Space (hold) charges, release fires; W/S angle; A/D walk + turn. */
export function bindGameKeys(io: GameIO): () => void {
  const set = (e: KeyboardEvent, down: boolean) => {
    const k = e.key.toLowerCase();
    if (e.code === 'Space') {
      e.preventDefault();
      if (down && !e.repeat) io.startCharge();
      if (!down) io.releaseCharge();
      return;
    }
    if (k === 'arrowup' || k === 'w') io.setInput({ up: down });
    else if (k === 'arrowdown' || k === 's') io.setInput({ down: down });
    else if (k === 'arrowleft' || k === 'a') io.setInput({ left: down });
    else if (k === 'arrowright' || k === 'd') io.setInput({ right: down });
    else return;
    e.preventDefault();
  };
  const kd = (e: KeyboardEvent) => set(e, true);
  const ku = (e: KeyboardEvent) => set(e, false);
  const blur = () => io.releaseAll();
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('blur', blur);
  };
}
