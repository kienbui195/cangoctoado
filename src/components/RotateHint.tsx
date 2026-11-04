import React from 'react';

// The game is played sideways: on a touch screen held upright, cover everything with a "turn your device" hint.
// Pure CSS (the `portrait-touch:` variant), so it appears / disappears the moment the device is turned.
export const RotateHint: React.FC = () => (
  <div className="hidden portrait-touch:flex fixed inset-0 z-[1000] flex-col items-center justify-center gap-5 bg-slate-950 px-8 text-center select-none">
    <div className="rotate-hint-phone relative h-28 w-16 rounded-2xl border-4 border-amber-300 shadow-[0_0_30px_rgba(251,191,36,.35)]">
      <div className="absolute left-1/2 top-1.5 h-1 w-5 -translate-x-1/2 rounded-full bg-amber-300/70" />
    </div>
    <div className="font-['Fredoka'] text-2xl font-bold text-amber-300">Xoay ngang màn hình</div>
    <p className="max-w-xs text-sm font-semibold text-slate-300">
      Game được thiết kế cho màn hình ngang. Hãy xoay điện thoại / máy tính bảng để chơi.
      <br />
      <span className="text-xs text-slate-500">(Nếu không xoay được, hãy tắt khoá xoay màn hình.)</span>
    </p>
  </div>
);
