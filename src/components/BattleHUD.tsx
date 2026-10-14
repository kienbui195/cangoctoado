import React, { useState, useEffect, useRef } from 'react';
import { BattleSkill, BattleSkillId, PlayerEntity, WindState } from '../types/game';
import { soundManager } from '../utils/audio';
import { GunnyRuler } from './GunnyRuler';
import type { ViewInfo } from './GameViewport';
import {
  Compass,
  Wind,
  Shield,
  Zap,
  Volume2,
  VolumeX,
  Calculator,
  Ruler,
  RotateCcw,
  Sparkles,
  Heart,
  Plane,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

export const BATTLE_SKILLS: BattleSkill[] = [
  { id: 'dual', name: '+1 (2 Phát)', cost: 30, icon: '⚡+1', description: 'Bắn liên tiếp 2 phát đạn trong lượt' },
  { id: 'triple', name: '+2 (3 Phát)', cost: 40, icon: '⚡+2', description: 'Bắn liên tiếp 3 phát đạn hủy diệt' },
  { id: 'scatter', name: '3 Tia', cost: 35, icon: '🔱', description: 'Bắn chùm 3 tia đạn lan tỏa' },
  { id: 'dmg50', name: '+50%', cost: 30, icon: '💥50', description: 'Tăng 50% sát thương đòn đánh' },
  { id: 'dmg40', name: '+40%', cost: 25, icon: '💥40', description: 'Tăng 40% sát thương đòn đánh' },
  { id: 'dmg30', name: '+30%', cost: 20, icon: '💥30', description: 'Tăng 30% sát thương đòn đánh' },
  { id: 'dmg20', name: '+20%', cost: 15, icon: '💥20', description: 'Tăng 20% sát thương đòn đánh' },
  { id: 'heal', name: 'Hồi Máu', cost: 25, icon: '💚', description: 'Hồi ngay 400 lượng máu (HP)' },
  { id: 'airplane', name: 'Máy Bay', cost: 20, icon: '✈️', description: 'Bắn máy bay giấy để bay dịch chuyển' },
  { id: 'subWeapon', name: 'Vũ Khí Phụ', cost: 30, icon: '🛡️', description: 'Kích hoạt Thiên sứ / Khiên Baron' },
  { id: 'petSkill', name: 'Pet Skill', cost: 30, icon: '🐾', description: 'Tuyệt chiêu của Thú Cưng đồng hành' },
];

interface Props {
  view: ViewInfo;
  player1: PlayerEntity;
  player2: PlayerEntity;
  currentTurnId: string;
  wind: WindState;
  activeSkills: BattleSkillId[];
  isPowActive: boolean;
  onToggleSkill: (skillId: BattleSkillId) => void;
  onTogglePow: () => void;
  onChangeAngle: (newAngle: number) => void;
  onFire: (power: number) => void;
  onMove: (dir: -1 | 1) => void;
  onOpenCalculator: () => void;
  onToggleRuler: () => void;
  isRulerVisible: boolean;
  isTrajectoryGuide: boolean;
  onToggleTrajectoryGuide: () => void;
  onResetMatch: () => void;
}

export const BattleHUD: React.FC<Props> = ({
  view,
  player1,
  player2,
  currentTurnId,
  wind,
  activeSkills,
  isPowActive,
  onToggleSkill,
  onTogglePow,
  onChangeAngle,
  onFire,
  onMove,
  onOpenCalculator,
  onToggleRuler,
  isRulerVisible,
  isTrajectoryGuide,
  onToggleTrajectoryGuide,
  onResetMatch,
}) => {
  const activePlayer = currentTurnId === player1.id ? player1 : player2;
  const opponent = currentTurnId === player1.id ? player2 : player1;
  const isHumanTurn = !activePlayer.isBot;

  // Spacebar power charging
  const [isCharging, setIsCharging] = useState(false);
  const [chargingPower, setChargingPower] = useState(0);
  const chargingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chargeStartTimeRef = useRef<number>(0);
  const [audioMuted, setAudioMuted] = useState(false);

  // Toggle sound
  const handleToggleSound = () => {
    soundManager.enabled = !soundManager.enabled;
    setAudioMuted(!soundManager.enabled);
  };

  // Keyboard controls listener (Space to charge, W/S or Up/Down for angle, A/D or Left/Right to walk)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isHumanTurn) return;

      // Spacebar hold to charge
      if (e.code === 'Space' && !e.repeat && !isCharging) {
        e.preventDefault();
        startCharging();
      }

      // Angle controls
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        soundManager.playClick();
        onChangeAngle(Math.min(90, activePlayer.angle + 1));
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        soundManager.playClick();
        onChangeAngle(Math.max(0, activePlayer.angle - 1));
      }

      // Movement
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        onMove(-1);
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        onMove(1);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isHumanTurn) return;
      if (e.code === 'Space' && isCharging) {
        e.preventDefault();
        stopChargingAndFire();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isHumanTurn, isCharging, activePlayer.angle, chargingPower]);

  // Charging loop
  const startCharging = () => {
    if (!isHumanTurn || isCharging) return;
    setIsCharging(true);
    setChargingPower(0);
    chargeStartTimeRef.current = Date.now();

    let curP = 0;
    chargingIntervalRef.current = setInterval(() => {
      curP += 1;
      if (curP >= 100) {
        curP = 100;
        clearInterval(chargingIntervalRef.current!);
        stopChargingAndFire();
        return;
      }
      setChargingPower(Math.round(curP));
      (window as any).__gunnyChargePower = Math.round(curP);
      if (Math.round(curP) % 8 === 0) {
        soundManager.playChargeTick(curP / 100);
      }
    }, 28);
  };

  const stopChargingAndFire = () => {
    if (!isCharging) return;
    setIsCharging(false);
    if (chargingIntervalRef.current) {
      clearInterval(chargingIntervalRef.current);
      chargingIntervalRef.current = null;
    }
    const finalPower = Math.max(8, Math.min(100, chargingPower));
    (window as any).__gunnyLastPower = finalPower;
    (window as any).__gunnyChargePower = 0;
    onFire(finalPower);
    setChargingPower(0);
  };

  const canPow = activePlayer.rage >= 100;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-30">
      <GunnyRuler
        view={view}
        shooter={activePlayer}
        target={opponent}
        windSpeed={wind.speed}
        visible={isRulerVisible}
        isCharging={isCharging}
        chargingPower={chargingPower}
      />
      {/* Top Header Bar */}
      <div className="absolute top-1 left-1 right-1 flex items-start justify-between pointer-events-none">
        {/* Left Player Card */}
        <div className="flex items-center gap-3 bg-slate-950/80 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl max-w-[260px] w-full pointer-events-auto">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-xl shadow-lg border border-yellow-300/40">
              {player1.equipped.weapon?.icon || '🤠'}
            </div>
            {player1.equipped.pet && (
              <span className="absolute -bottom-1 -right-1 text-xs bg-slate-900 rounded-full px-1 border border-slate-700">
                {player1.equipped.pet.icon}
              </span>
            )}
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs font-bold text-amber-300 truncate max-w-[120px]">
                {player1.name}
              </span>
              <span className="text-[11px] font-black text-rose-400">
                {Math.max(0, player1.hp)} / {player1.maxHp}
              </span>
            </div>
            {/* HP Bar */}
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.max(0, (player1.hp / player1.maxHp) * 100)}%` }}
              />
            </div>
            {/* Rage & Stamina sub bars */}
            <div className="flex items-center gap-2 mt-1.5 text-[9px]">
              <div className="flex-1 flex items-center gap-1">
                <span className="text-amber-400 font-bold">NỘ</span>
                <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all"
                    style={{ width: `${player1.rage}%` }}
                  />
                </div>
              </div>
              <div className="flex-1 flex items-center gap-1">
                <span className="text-cyan-400 font-bold">TL</span>
                <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all"
                    style={{ width: `${player1.stamina}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Turn Timer & Wind Gauge */}
        <div className="flex flex-col items-center">
          {/* Wind Gauge Box */}
          <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1 rounded-xl border border-cyan-500/50 shadow-xl flex items-center gap-2 pointer-events-auto">
            <Wind className={`w-5 h-5 ${wind.speed >= 0 ? 'text-cyan-400' : 'text-amber-400'}`} />
            <div className="text-center">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                SỨC GIÓ (WIND)
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-base font-black font-['Fredoka'] ${
                    wind.speed > 0
                      ? 'text-cyan-300'
                      : wind.speed < 0
                      ? 'text-amber-400'
                      : 'text-slate-300'
                  }`}
                >
                  {Math.abs(wind.speed).toFixed(1)} m/s
                </span>
                <span className="text-xs font-bold text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {wind.speed > 0 ? '➔ Xuôi' : wind.speed < 0 ? '⬅ Ngược' : 'Lặng'}
                </span>
              </div>
            </div>
            {/* Visual wind meter */}
            <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden relative border border-slate-700">
              <div
                className={`absolute top-0 bottom-0 ${
                  wind.speed >= 0 ? 'bg-cyan-400' : 'bg-amber-400'
                }`}
                style={{
                  left: wind.speed >= 0 ? '50%' : `${50 + (wind.speed / 4) * 50}%`,
                  width: `${Math.min(50, (Math.abs(wind.speed) / 4) * 50)}%`,
                }}
              />
              <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/70" />
            </div>
          </div>

        </div>

        {/* Right Player Card */}
        <div className="flex items-center gap-3 bg-slate-950/80 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl max-w-[260px] w-full pointer-events-auto">
          <div className="flex-1 text-right">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[11px] font-black text-rose-400">
                {Math.max(0, player2.hp)} / {player2.maxHp}
              </span>
              <span className="text-xs font-bold text-amber-300 truncate max-w-[120px]">
                {player2.name}
              </span>
            </div>
            {/* HP Bar */}
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-l from-red-600 via-rose-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.max(0, (player2.hp / player2.maxHp) * 100)}%` }}
              />
            </div>
            {/* Rage & Stamina */}
            <div className="flex items-center gap-2 mt-1.5 text-[9px] justify-end">
              <div className="flex-1 flex items-center gap-1">
                <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all ml-auto"
                    style={{ width: `${player2.stamina}%` }}
                  />
                </div>
                <span className="text-cyan-400 font-bold">TL</span>
              </div>
              <div className="flex-1 flex items-center gap-1">
                <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all ml-auto"
                    style={{ width: `${player2.rage}%` }}
                  />
                </div>
                <span className="text-amber-400 font-bold">NỘ</span>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-400 flex items-center justify-center text-xl shadow-lg border border-cyan-300/40">
              {player2.equipped.weapon?.icon || '🤖'}
            </div>
            {player2.equipped.pet && (
              <span className="absolute -bottom-1 -left-1 text-xs bg-slate-900 rounded-full px-1 border border-slate-700">
                {player2.equipped.pet.icon}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Top Utility Controls (Floating right under header) */}
      <div className="absolute right-1 top-[156px] flex flex-col items-end gap-1 pointer-events-auto">
        {/* Toggle Trajectory line (Practice mode) */}
        <button
          onClick={onToggleTrajectoryGuide}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${
            isTrajectoryGuide
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-400'
              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title="Bật / Tắt đường đạn dự đoán tập ngắm"
        >
          <span>🎯 Tia:</span>
          <span>{isTrajectoryGuide ? 'BẬT' : 'TẮT'}</span>
        </button>

        {/* Toggle Gunny Ruler */}
        <button
          onClick={onToggleRuler}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${
            isRulerVisible
              ? 'bg-amber-950/80 text-amber-300 border-amber-400'
              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title="Bật thước đo khoảng cách 10 khúc kinh điển Gunny"
        >
          <Ruler className="w-3.5 h-3.5" />
          <span>Thước Đo</span>
        </button>

        {/* Gunny Calculator */}
        <button
          onClick={onOpenCalculator}
          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900/80 hover:bg-slate-800 text-emerald-400 border border-emerald-500/40 transition flex items-center gap-1 cursor-pointer"
          title="Máy tính công thức góc & lực 65, 90, 77, 20"
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Tính Góc/Lực</span>
        </button>

        {/* Sound toggle */}
        <button
          onClick={handleToggleSound}
          className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
          title="Bật/Tắt âm thanh"
        >
          {audioMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Reset match */}
        <button
          onClick={onResetMatch}
          className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
          title="Ván mới"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Main Combat Controls: Skills Bar + Angle + Power Bar */}
      <>
        {/* Battle Skills Bar */}
        <div className="absolute left-1 top-16 grid grid-cols-2 gap-1 w-[118px] bg-slate-950/70 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl pointer-events-auto">
          {BATTLE_SKILLS.map((skill) => {
            const isSelected = activeSkills.includes(skill.id);
            const canAfford = activePlayer.stamina >= skill.cost;

            return (
              <button
                key={skill.id}
                disabled={!isHumanTurn || (!isSelected && !canAfford)}
                onClick={() => {
                  soundManager.playClick();
                  onToggleSkill(skill.id);
                }}
                className={`relative px-1 py-1 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-0.5 border active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30'
                    : 'bg-slate-900 text-slate-200 border-slate-700/80 hover:border-slate-500'
                }`}
                title={`${skill.description} (Tiêu hao ${skill.cost} Thể lực)`}
              >
                <span>{skill.icon}</span>
                                <span className="text-[9px] opacity-70">(-{skill.cost})</span>
              </button>
            );
          })}

          {/* POW Button */}
          <button
            disabled={!isHumanTurn || !canPow}
            onClick={() => {
              soundManager.playPowShoot();
              onTogglePow();
            }}
            className={`col-span-2 px-2 py-1 rounded-lg text-[11px] font-black tracking-wider transition border flex items-center justify-center gap-1 ${
              isPowActive
                ? 'bg-red-600 text-yellow-300 border-yellow-300 shadow-lg shadow-red-600/50 animate-pulse scale-105'
                : canPow
                ? 'bg-gradient-to-r from-red-600 to-amber-500 text-white border-amber-400 animate-bounce'
                : 'bg-slate-900 text-slate-500 border-slate-800 opacity-40 cursor-not-allowed'
            }`}
          >
            <span>🔥 POW</span>
            {canPow && <span>MAX</span>}
          </button>
        </div>

      </>
    </div>
  );
};
