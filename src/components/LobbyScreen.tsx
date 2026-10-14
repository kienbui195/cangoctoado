import React, { useState } from 'react';
import { motion } from 'motion/react';
import { soundManager } from '../utils/audio';
import { QuestionBankModal } from './QuestionBankModal';
import { bankStats, isCustomBank } from '../data/questions';
import { BotLevelModal } from './BotLevelModal';
import type { BotLevel } from '../game/royaleEngine';

interface Props {
  onStart: (level: BotLevel) => void;
  onOnline: () => void;
  onClassic: () => void;
}

const FLOATERS = ['🧊', '🩴', '🔫', '🗑️', '📖', '🥥', '🍳', '🧺', '🚗', '⚽', '🐉', '🥚', '🎄', '🍚', '🌀', '🧸', '🔋', '☂️'];

// Waiting screen: one big "bắt đầu chơi" button.
export const LobbyScreen: React.FC<Props> = ({ onStart, onOnline, onClassic }) => {
  const [bankOpen, setBankOpen] = useState(false);
  const [pickBot, setPickBot] = useState(false);
  const st = bankStats();
  return (
  <div className="relative h-screen overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-teal-950 text-slate-100 flex flex-col items-center justify-center font-['Nunito',sans-serif]">
    {FLOATERS.map((e, i) => (
      <motion.span
        key={i}
        className="absolute text-4xl opacity-25 select-none"
        style={{ left: `${(i * 53) % 96}%`, top: `${(i * 37) % 90}%` }}
        animate={{ y: [0, -18, 0], rotate: [0, 12, -12, 0] }}
        transition={{ duration: 4 + (i % 5), repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
      >
        {e}
      </motion.span>
    ))}

    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative text-center px-4">
      <div className="text-7xl mb-2">💣</div>
      <h1 className="text-5xl md:text-6xl font-black text-amber-400 font-['Fredoka'] tracking-wide drop-shadow-[0_4px_0_rgba(120,53,15,0.8)]">CĂN GÓC TỌA ĐỘ</h1>
      <p className="mt-3 text-slate-300 text-sm md:text-base max-w-xl mx-auto">
        Thu thập vũ khí từ những hộp quà bằng cách bắn trúng &amp; trả lời câu hỏi, sắp xếp đội hình, rồi để vũ khí tự quyết định thắng thua!
      </p>
    </motion.div>

    <motion.button
      onClick={() => {
        soundManager.playClick();
        setPickBot(true);
      }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      className="relative mt-10 px-14 py-5 rounded-2xl bg-gradient-to-b from-amber-300 to-orange-500 text-slate-950 text-2xl font-black font-['Fredoka'] tracking-wider shadow-[0_8px_0_#92400e,0_0_40px_rgba(251,191,36,0.45)] cursor-pointer"
    >
      ▶ CHƠI VỚI MÁY
    </motion.button>

    <motion.button
      onClick={() => {
        soundManager.playClick();
        onOnline();
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="relative mt-5 px-10 py-3.5 rounded-2xl bg-gradient-to-b from-sky-300 to-blue-500 text-slate-950 text-xl font-black font-['Fredoka'] tracking-wider shadow-[0_6px_0_#1e3a8a,0_0_30px_rgba(56,189,248,0.35)] cursor-pointer"
    >
      🌐 CHƠI ONLINE VỚI BẠN
    </motion.button>

    <button
      onClick={() => {
        soundManager.playClick();
        setBankOpen(true);
      }}
      className="relative mt-6 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-600 hover:border-amber-400 text-xs font-bold text-slate-200"
    >
      📚 Bộ câu hỏi: {isCustomBank() ? 'tùy chỉnh' : 'mặc định'} ({st.easy + st.medium + st.hard} câu) — Nhập / Xuất CSV
    </button>

    <button onClick={onClassic} className="relative mt-8 text-xs text-slate-400 hover:text-amber-300 underline underline-offset-4">
      Chế độ cổ điển (luyện bắn / 1v1 theo lượt)
    </button>
      {bankOpen && <QuestionBankModal onClose={() => setBankOpen(false)} />}
      {pickBot && <BotLevelModal onPick={(lv) => { setPickBot(false); onStart(lv); }} onClose={() => setPickBot(false)} />}
  </div>
  );
};
