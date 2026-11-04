import React, { useEffect, useRef, useState } from 'react';
import type { GameIO } from '../game/gameIO';

// On-screen controls for phones / tablets without a keyboard: ◀ ▶ walk + turn, ▲ ▼ angle, a big button to hold (charge) and release (fire).
// Every button follows its own pointer, so several fingers work at once (hold ▲ while charging...).
// Landscape phones are short, so the keys stay small and faint; they light up on my turn and while a finger is on them.

const STORE_KEY = 'cgtd.virtualPad';

/** On by default on touch screens; the player can switch it on/off at any time (remembered on this device). */
export function useVirtualPadSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v === '1' || v === '0') return v === '1';
    } catch {
      /* storage blocked: fall back to the device guess */
    }
    return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(STORE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return [on, set];
}

const noMenu = (e: React.SyntheticEvent) => e.preventDefault();

const KEY_STYLE: React.CSSProperties = { touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' };

/** A button that stays "down" while its pointer is held, even if the finger slides off it. */
const HoldButton: React.FC<{
  onDown: () => void;
  onUp: () => void;
  className: string;
  label: string;
  children: React.ReactNode;
}> = ({ onDown, onUp, className, label, children }) => {
  const held = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const up = () => {
    if (held.current === null) return;
    held.current = null;
    setPressed(false);
    onUp();
  };
  // unmounted while held (phase changed, pad switched off): let go so nothing stays stuck
  const upRef = useRef(up);
  upRef.current = up;
  useEffect(() => () => upRef.current(), []);
  return (
    <button
      type="button"
      aria-label={label}
      style={KEY_STYLE}
      className={`${className} ${pressed ? 'scale-90 brightness-125' : ''} transition-transform duration-75`}
      onPointerDown={(e) => {
        if (held.current !== null) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        held.current = e.pointerId;
        setPressed(true);
        onDown();
      }}
      onPointerUp={(e) => e.pointerId === held.current && up()}
      onPointerCancel={(e) => e.pointerId === held.current && up()}
      onLostPointerCapture={(e) => e.pointerId === held.current && up()}
      onContextMenu={noMenu}
    >
      {children}
    </button>
  );
};

export type PadKey = 'left' | 'right' | 'up' | 'down' | 'fire';
export interface PadControl {
  down(k: PadKey): void;
  up(k: PadKey): void;
}

/** "Thu thập vũ khí" mode (local or online): straight to the game intents. */
export const ioPad = (io: GameIO): PadControl => ({
  down: (k) => (k === 'fire' ? io.startCharge() : io.setInput({ [k]: true })),
  up: (k) => (k === 'fire' ? io.releaseCharge() : io.setInput({ [k]: false })),
});

const KEY_OF: Record<PadKey, { key: string; code: string }> = {
  left: { key: 'ArrowLeft', code: 'ArrowLeft' },
  right: { key: 'ArrowRight', code: 'ArrowRight' },
  up: { key: 'ArrowUp', code: 'ArrowUp' },
  down: { key: 'ArrowDown', code: 'ArrowDown' },
  fire: { key: ' ', code: 'Space' },
};

/**
 * Classic mode reads the keyboard directly: the pad plays the same keys (with key-repeat for held arrows, like a real
 * keyboard), so the classic controls keep one single code path.
 */
export const keyboardPad = (): PadControl => {
  const timers = new Map<PadKey, number>();
  const send = (type: 'keydown' | 'keyup', k: PadKey, repeat = false) =>
    window.dispatchEvent(new KeyboardEvent(type, { ...KEY_OF[k], repeat, bubbles: true, cancelable: true }));
  return {
    down: (k) => {
      send('keydown', k);
      if (k !== 'fire' && !timers.has(k)) timers.set(k, window.setInterval(() => send('keydown', k, true), 45));
    },
    up: (k) => {
      const t = timers.get(k);
      if (t !== undefined) window.clearInterval(t);
      timers.delete(k);
      send('keyup', k);
    },
  };
};

const ARROW = 'w-11 h-11 rounded-xl bg-slate-900/75 border-2 border-slate-400/70 text-slate-100 text-lg font-black flex items-center justify-center shadow-lg';

interface PadProps {
  control: PadControl;
  /** my turn: the keys are shown clearly */
  active: boolean;
  charging: boolean;
  /** room kept free on the left / right for the HUD panels in the bottom corners */
  insetLeft?: number;
  insetRight?: number;
}

export const VirtualPad: React.FC<PadProps> = ({ control, active, charging, insetLeft = 12, insetRight = 12 }) => {
  const [held, setHeld] = useState(0);
  const key = (k: PadKey, label: string, glyph: React.ReactNode, className = ARROW) => (
    <HoldButton
      label={label}
      className={className}
      onDown={() => {
        setHeld((n) => n + 1);
        control.down(k);
      }}
      onUp={() => {
        setHeld((n) => Math.max(0, n - 1));
        control.up(k);
      }}
    >
      {glyph}
    </HoldButton>
  );
  const opacity = held > 0 || charging ? 'opacity-100' : active ? 'opacity-80' : 'opacity-25';
  return (
    <div
      data-hud
      style={{ paddingLeft: insetLeft, paddingRight: insetRight }}
      className={`absolute inset-x-0 bottom-[92px] z-50 pointer-events-none flex justify-between transition-opacity duration-200 ${opacity}`}
    >
      {/* left hand: walk / turn */}
      <div className="pointer-events-auto flex gap-1.5 items-end">
        {key('left', 'Đi sang trái', '◀')}
        {key('right', 'Đi sang phải', '▶')}
      </div>
      {/* right hand: angle + fire */}
      <div className="pointer-events-auto flex gap-1.5 items-center">
        <div className="flex flex-col gap-1.5">
          {key('up', 'Tăng góc', '▲')}
          {key('down', 'Giảm góc', '▼')}
        </div>
        {key(
          'fire',
          'Giữ để nạp lực, thả để bắn',
          <>
            <span className="text-xl leading-none">🎯</span>
            <span className="text-[9px] leading-tight">{charging ? 'THẢ BẮN' : 'GIỮ NẠP'}</span>
          </>,
          `w-[68px] h-[68px] rounded-full border-[3px] font-black font-['Fredoka'] flex flex-col items-center justify-center gap-0.5 shadow-xl ${
            charging ? 'bg-rose-500 border-amber-200 text-white shadow-[0_0_20px_rgba(244,63,94,.7)]' : 'bg-amber-400/90 border-amber-100 text-slate-950'
          }`,
        )}
      </div>
    </div>
  );
};

/** The on/off switch shown next to the other HUD buttons. */
export const PadToggle: React.FC<{ on: boolean; onChange: (on: boolean) => void; className?: string }> = ({ on, onChange, className = '' }) => (
  <button
    onClick={() => onChange(!on)}
    className={`px-2 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 pointer-events-auto ${on ? 'bg-amber-400 border-amber-200 text-slate-950' : 'bg-slate-900/85 border-slate-700 text-slate-200 hover:bg-slate-800'} ${className}`}
    title="Bật/Tắt phím ảo (cho điện thoại, máy tính bảng)"
    aria-pressed={on}
  >
    🎮 Phím ảo
  </button>
);
