import React, { useState, useEffect } from 'react';
import {
  calculateGunnyDistance,
  calculateGunnyFormulas,
  RecommendationResult,
} from '../utils/gunnyPhysics';
import { soundManager } from '../utils/audio';
import { X, Calculator, Compass, Gauge, CheckCircle, Info } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentWind: number; // e.g. -2.5 to 2.5
  playerX: number;
  playerY: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  onApplyShot?: (angle: number, power: number) => void;
}

export const FormulaCalculatorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentWind,
  playerX,
  playerY,
  targetX,
  targetY,
  facing,
  onApplyShot,
}) => {
  const initialDist = calculateGunnyDistance(playerX, targetX);
  const [distance, setDistance] = useState<number>(initialDist || 5);
  const [wind, setWind] = useState<number>(currentWind || 0);
  const [selectedFormula, setSelectedFormula] = useState<number>(0);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  // Sync when modal opens or live data changes
  useEffect(() => {
    if (isOpen) {
      setDistance(calculateGunnyDistance(playerX, targetX));
      setWind(currentWind);
    }
  }, [isOpen, playerX, targetX, currentWind]);

  if (!isOpen) return null;

  const liveRecommendations = calculateGunnyFormulas(
    0,
    0,
    distance * 90,
    0,
    wind,
    facing
  );

  const selectedRec: RecommendationResult =
    liveRecommendations[selectedFormula] || liveRecommendations[0];

  const handleApply = (rec: RecommendationResult) => {
    soundManager.playClick();
    if (onApplyShot) {
      onApplyShot(rec.angle, rec.power);
      setAppliedMsg(`Đã cài đặt: Góc ${rec.angle}° - Lực ${rec.power}!`);
      setTimeout(() => {
        setAppliedMsg(null);
        onClose();
      }, 700);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-emerald-500/70 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl shadow-emerald-500/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950/40 border-b border-emerald-500/30">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📐</span>
            <div>
              <h2 className="text-xl font-bold text-emerald-400 font-['Fredoka'] tracking-wide">
                HỆ THỐNG TÍNH TOÁN GÓC & LỰC BẮN CHUẨN XÁC
              </h2>
              <p className="text-xs text-slate-400">
                Bộ công thức kinh điển Gunny: Góc 65°, Siêu Cao 90°, Góc Cao 77° & Góc Thấp 20°
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundManager.playClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick sync / Input panel */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* Distance */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-400">Cự ly khoảng cách:</span>
                <span className="text-emerald-400 font-bold">{distance} khúc (~{Math.round(distance * 90)}px)</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="18"
                step="0.5"
                value={distance}
                onChange={(e) => setDistance(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                1 màn hình = 10 khúc đo Gunny
              </div>
            </div>

            {/* Wind */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-400">Tốc độ & Hướng gió:</span>
                <span
                  className={`font-bold ${
                    wind > 0 ? 'text-cyan-400' : wind < 0 ? 'text-amber-400' : 'text-slate-300'
                  }`}
                >
                  {wind > 0 ? `+${wind.toFixed(1)} (Xuôi gió)` : wind < 0 ? `${wind.toFixed(1)} (Ngược gió)` : '0.0 (Lặng gió)'}
                </span>
              </div>
              <input
                type="range"
                min="-4.0"
                max="4.0"
                step="0.1"
                value={wind}
                onChange={(e) => setWind(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                {facing === 1 ? 'Hướng bắn: Phải ➔' : 'Hướng bắn: ⬅ Trái'}
              </div>
            </div>

            {/* Sync live button */}
            <div className="flex items-center">
              <button
                onClick={() => {
                  soundManager.playClick();
                  setDistance(calculateGunnyDistance(playerX, targetX));
                  setWind(currentWind);
                }}
                className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-xs text-emerald-300 font-bold rounded-lg border border-emerald-500/30 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Calculator className="w-4 h-4" />
                <span>Lấy Dữ Liệu Thực Tế</span>
              </button>
            </div>
          </div>

          {/* Formula selection tabs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {liveRecommendations.map((rec, idx) => (
              <button
                key={rec.formulaName}
                onClick={() => {
                  soundManager.playClick();
                  setSelectedFormula(idx);
                }}
                className={`p-3 rounded-xl border text-left transition ${
                  selectedFormula === idx
                    ? 'bg-emerald-950/60 border-emerald-400 text-white shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-emerald-400 mb-1">
                  {rec.formulaName}
                </div>
                <div className="text-lg font-black text-white font-['Fredoka']">
                  {rec.angle}° / {rec.power}L
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-1">
                  {rec.description}
                </div>
              </button>
            ))}
          </div>

          {/* Detailed Calculator Result Card */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30 p-5 rounded-2xl border-2 border-emerald-500/50 shadow-xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-400" />
                  <span>KẾT QUẢ TÍNH TOÁN THEO: {selectedRec.formulaName}</span>
                </div>
                <div className="text-xs text-emerald-300 mt-1">
                  {selectedRec.description}
                </div>
              </div>

              {/* Big Angle & Power badge */}
              <div className="flex items-center gap-4 bg-slate-950 px-5 py-3 rounded-xl border border-emerald-500/40">
                <div className="text-center">
                  <div className="text-[11px] text-slate-400 font-semibold">GÓC BẮN</div>
                  <div className="text-3xl font-black text-amber-400 font-['Fredoka']">
                    {selectedRec.angle}°
                  </div>
                </div>
                <div className="w-[1px] h-10 bg-slate-700" />
                <div className="text-center">
                  <div className="text-[11px] text-slate-400 font-semibold">LỰC BẮN</div>
                  <div className="text-3xl font-black text-emerald-400 font-['Fredoka']">
                    {selectedRec.power}
                  </div>
                </div>
              </div>
            </div>

            {/* Action button to apply directly to game controls */}
            {onApplyShot && (
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={() => handleApply(selectedRec)}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <Gauge className="w-5 h-5" />
                  <span>ÁP DỤNG GÓC & LỰC VÀO LƯỢT BẮN HIỆN TẠI</span>
                </button>
              </div>
            )}

            {appliedMsg && (
              <div className="mt-3 text-center text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5 animate-bounce">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>{appliedMsg}</span>
              </div>
            )}
          </div>

          {/* Educational Cheatsheet Guide for Gunny Veterans */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mb-2">
              <Info className="w-4 h-4" />
              <span>BẢNG TRA CỨU CÔNG THỨC GUNNY CHI TIẾT</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <span className="font-bold text-emerald-400">1. Công thức Góc 65:</span>
                <p className="text-[11px] text-slate-400 mt-1">
                  • <strong>Góc:</strong> 65 ± (Gió × 2) [Xuôi gió cộng góc, ngược gió trừ góc].<br/>
                  • <strong>Lực:</strong> 1 khúc: 13 | 2 khúc: 21 | 3 khúc: 26 | 4 khúc: 31 | 5 khúc: 37 | 6 khúc: 41 | 7 khúc: 46 | 8 khúc: 51 | 9 khúc: 55 | 10 khúc: 60 | 15 khúc: 78.
                </p>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <span className="font-bold text-emerald-400">2. Công thức Siêu Cao 90:</span>
                <p className="text-[11px] text-slate-400 mt-1">
                  • <strong>Góc:</strong> 90 - Cự ly ± (Gió × 2).<br/>
                  • <strong>Lực:</strong> Cố định 95 lực (ngược gió 97 lực, xuôi gió 93 lực). Đạn bay thẳng tắp lên mây rồi rơi cắm đầu 90°, hoàn toàn không bị vướng đồi núi!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
