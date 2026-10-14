import React, { useState, useEffect, useRef } from 'react';
import {
  BattleSkillId,
  CharacterProfile,
  GameMode,
  HitEffect,
  Item,
  PlayerEntity,
  Projectile,
  WindState,
} from './types/game';
import {
  calculateTotalStats,
  getDefaultProfile,
  loadProfile,
  saveProfile,
} from './utils/playerStorage';
import {
  getInitialVelocity,
} from './utils/gunnyPhysics';
import { soundManager } from './utils/audio';
import { GunnyCanvas } from './components/GunnyCanvas';
import { GameViewport } from './components/GameViewport';
import { BattleHUD } from './components/BattleHUD';
import { InventoryModal } from './components/InventoryModal';
import { FormulaCalculatorModal } from './components/FormulaCalculatorModal';
import { LobbyScreen } from './components/LobbyScreen';
import { RoyaleGame } from './components/RoyaleGame';
import type { BotLevel } from './game/royaleEngine';
import { OnlineApp } from './online/OnlineApp';
import {
  Backpack,
  Calculator,
  Ruler,
  HelpCircle,
  Trophy,
  Swords,
  Target,
  Bot,
  User,
  RotateCcw,
  Volume2,
} from 'lucide-react';

export default function App() {
  const [profile, setProfile] = useState(() => loadProfile('p1'));
  const [profile2, setProfile2] = useState(() => loadProfile('p2'));
  const [inventoryOwner, setInventoryOwner] = useState<'p1' | 'p2'>('p1');
  const [gameMode, setGameMode] = useState<GameMode>('pvp');
  const [screen, setScreen] = useState<'lobby' | 'royale' | 'online' | 'classic'>('lobby');
  const [botLevel, setBotLevel] = useState<BotLevel>('medium');

  // Modals
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Tools
  const [isRulerVisible, setIsRulerVisible] = useState(true);
  const [isTrajectoryGuide, setIsTrajectoryGuide] = useState(false);

  // Match State
  const [wind, setWind] = useState<WindState>({ speed: 1.2, direction: 1 });
  const [currentTurnId, setCurrentTurnId] = useState<string>('p1');
  const [activeSkills, setActiveSkills] = useState<BattleSkillId[]>([]);
  const [isPowActive, setIsPowActive] = useState<boolean>(false);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [winner, setWinner] = useState<PlayerEntity | null>(null);
  const [terrainReady, setTerrainReady] = useState(false);

  // Initialize Players
  const p1Stats = calculateTotalStats(profile.equipped);
  const [player1, setPlayer1] = useState<PlayerEntity>(() => ({
    id: 'p1',
    name: profile.name,
    isBot: false,
    x: 220,
    y: 380,
    hp: p1Stats.hp,
    maxHp: p1Stats.maxHp,
    angle: 65,
    power: 55,
    facing: 1,
    rage: 30,
    stamina: 100,
    isDead: false,
    stats: p1Stats,
    equipped: profile.equipped,
    avatarColor: '#f59e0b',
    shieldTurns: 0,
    stealthTurns: 0,
    consecutiveKills: 0,
  }));

  const p2Stats = calculateTotalStats(profile2.equipped);
  const [player2, setPlayer2] = useState<PlayerEntity>(() => ({
    id: 'p2',
    name: profile2.name,
    isBot: false,
    x: 950,
    y: 390,
    hp: p2Stats.hp,
    maxHp: p2Stats.maxHp,
    angle: 65,
    power: 55,
    facing: -1,
    rage: 20,
    stamina: 100,
    isDead: false,
    stats: p2Stats,
    equipped: profile2.equipped,
    avatarColor: '#06b6d4',
    shieldTurns: 0,
    stealthTurns: 0,
    consecutiveKills: 0,
  }));

  // Persist both profiles
  useEffect(() => saveProfile(profile, 'p1'), [profile]);
  useEffect(() => saveProfile(profile2, 'p2'), [profile2]);

  // Update a player's stats when their equipment changes in the inventory
  const handleUpdateProfile = (updated: CharacterProfile) => {
    const newStats = calculateTotalStats(updated.equipped);
    const apply = (prev: PlayerEntity): PlayerEntity => ({
      ...prev,
      name: updated.name,
      stats: newStats,
      maxHp: newStats.maxHp,
      hp: Math.min(prev.hp, newStats.maxHp),
      equipped: updated.equipped,
    });
    if (inventoryOwner === 'p1') {
      setProfile(updated);
      setPlayer1(apply);
    } else {
      setProfile2(updated);
      setPlayer2(apply);
    }
  };

  // Handle skill toggling
  const handleToggleSkill = (skillId: BattleSkillId) => {
    const active = currentTurnId === player1.id ? player1 : player2;

    if (skillId === 'heal') {
      // Instant heal item
      if (active.stamina < 25) return;
      soundManager.playHeal();
      const healAmt = 450;
      if (active.id === player1.id) {
        setPlayer1((p) => ({
          ...p,
          hp: Math.min(p.maxHp, p.hp + healAmt),
          stamina: p.stamina - 25,
        }));
      } else {
        setPlayer2((p) => ({
          ...p,
          hp: Math.min(p.maxHp, p.hp + healAmt),
          stamina: p.stamina - 25,
        }));
      }
      setHitEffects((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          x: active.x,
          y: active.y - 40,
          damage: healAmt,
          isCrit: false,
          isHeal: true,
          age: 0,
        },
      ]);
      return;
    }

    if (skillId === 'subWeapon') {
      // Use sub weapon
      if (active.stamina < 30) return;
      const sub = active.equipped.subWeapon;
      soundManager.playHeal();
      if (sub?.subWeaponType === 'shield') {
        if (active.id === player1.id) {
          setPlayer1((p) => ({ ...p, shieldTurns: 2, stamina: p.stamina - 30 }));
        } else {
          setPlayer2((p) => ({ ...p, shieldTurns: 2, stamina: p.stamina - 30 }));
        }
      } else {
        // Angel bless
        const healAmt = 500;
        if (active.id === player1.id) {
          setPlayer1((p) => ({
            ...p,
            hp: Math.min(p.maxHp, p.hp + healAmt),
            shieldTurns: 1,
            stamina: p.stamina - 30,
          }));
        } else {
          setPlayer2((p) => ({
            ...p,
            hp: Math.min(p.maxHp, p.hp + healAmt),
            shieldTurns: 1,
            stamina: p.stamina - 30,
          }));
        }
        setHitEffects((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            x: active.x,
            y: active.y - 40,
            damage: healAmt,
            isCrit: false,
            isHeal: true,
            age: 0,
          },
        ]);
      }
      return;
    }

    if (skillId === 'petSkill') {
      if (active.stamina < 30) return;
      const pet = active.equipped.pet;
      if (!pet?.petSkill) return;
      soundManager.playHeal();
      const sk = pet.petSkill;
      if (sk.effectType === 'heal') {
        const healAmt = sk.value;
        if (active.id === player1.id) {
          setPlayer1((p) => ({
            ...p,
            hp: Math.min(p.maxHp, p.hp + healAmt),
            stamina: p.stamina - 30,
          }));
        } else {
          setPlayer2((p) => ({
            ...p,
            hp: Math.min(p.maxHp, p.hp + healAmt),
            stamina: p.stamina - 30,
          }));
        }
        setHitEffects((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            x: active.x,
            y: active.y - 40,
            damage: healAmt,
            isCrit: false,
            isHeal: true,
            age: 0,
          },
        ]);
      }
      return;
    }

    // Toggle skill in list
    if (activeSkills.includes(skillId)) {
      setActiveSkills((prev) => prev.filter((id) => id !== skillId));
    } else {
      setActiveSkills((prev) => [...prev, skillId]);
    }
  };

  const handleTogglePow = () => {
    setIsPowActive((prev) => !prev);
  };

  const handleChangeAngle = (newAngle: number) => {
    if (currentTurnId === player1.id) {
      setPlayer1((p) => ({ ...p, angle: newAngle }));
    } else {
      setPlayer2((p) => ({ ...p, angle: newAngle }));
    }
  };

  const handleMove = (dir: -1 | 1) => {
    const active = currentTurnId === player1.id ? player1 : player2;
    if (active.stamina < 6) return;

    soundManager.playClick();
    const stepDist = dir * 14;
    const newX = Math.max(60, Math.min(1860, active.x + stepDist));
    const newFacing = dir;

    // Follow the terrain: climb small slopes, refuse to walk into a cliff
    const isSolid = (window as any).__gunnyCheckTerrain as
      | ((x: number, y: number) => boolean)
      | undefined;
    let newY = active.y;
    if (isSolid) {
      let climbed = 0;
      while (isSolid(newX, newY) && climbed < 24) {
        newY -= 1;
        climbed += 1;
      }
      if (isSolid(newX, newY)) return;
    }

    if (active.id === player1.id) {
      setPlayer1((p) => ({
        ...p,
        x: newX,
        y: newY,
        facing: newFacing,
        stamina: Math.max(0, p.stamina - 6),
      }));
    } else {
      setPlayer2((p) => ({
        ...p,
        x: newX,
        y: newY,
        facing: newFacing,
        stamina: Math.max(0, p.stamina - 6),
      }));
    }
  };

  // Launch Projectiles
  const handleExecuteFire = (
    shooterId: string,
    angle: number,
    power: number,
    skills: BattleSkillId[],
    isPow: boolean
  ) => {
    const shooter = shooterId === player1.id ? player1 : player2;
    const isAirplane = skills.includes('airplane');

    // Calculate shot count (+1 or +2)
    let shotCount = 1;
    if (skills.includes('triple')) shotCount = 3;
    else if (skills.includes('dual')) shotCount = 2;

    const isScatter = skills.includes('scatter'); // 3 tia

    // Calculate damage multipliers
    let dmgMult = 1.0;
    if (skills.includes('dmg50')) dmgMult += 0.5;
    if (skills.includes('dmg40')) dmgMult += 0.4;
    if (skills.includes('dmg30')) dmgMult += 0.3;
    if (skills.includes('dmg20')) dmgMult += 0.2;
    if (isPow) dmgMult += 0.8;

    const baseDmg = Math.round((shooter.stats.attack * 1.35) * dmgMult);
    const digR = isPow ? 65 : shooter.stats.dig;

    // Reset Pow & Consume rage
    if (isPow) {
      if (shooter.id === player1.id) {
        setPlayer1((p) => ({ ...p, rage: 0 }));
      } else {
        setPlayer2((p) => ({ ...p, rage: 0 }));
      }
      setIsPowActive(false);
      soundManager.playPowShoot();
    } else if (isAirplane) {
      soundManager.playAirplane();
    } else {
      soundManager.playShoot();
    }

    // Fire shots sequentially with delays (just like Gunny!)
    for (let s = 0; s < shotCount; s++) {
      setTimeout(() => {
        if (s > 0) {
          soundManager.playShoot();
        }

        if (isScatter) {
          // 3 tia scatter shots (-4 deg, 0 deg, +4 deg)
          [-4, 0, 4].forEach((degOffset, idx) => {
            const { vx, vy } = getInitialVelocity(
              angle + degOffset,
              power,
              shooter.facing
            );
            const proj: Projectile = {
              id: `${shooterId}-${Date.now()}-${s}-${idx}`,
              shooterId,
              x: shooter.x + shooter.facing * 16,
              y: shooter.y - 18,
              vx,
              vy,
              radius: isPow ? 12 : 7,
              damage: Math.round(baseDmg * 0.45),
              digRadius: Math.round(digR * 0.75),
              isPow,
              isAirplane: false,
              color: shooter.equipped.weapon?.projectileColor || '#f97316',
              bulletType: shooter.equipped.weapon?.bulletType || 'brick',
              icon: shooter.equipped.weapon?.icon,
              trail: [],
              life: 0,
            };
            setProjectiles((prev) => [...prev, proj]);
          });
        } else {
          const { vx, vy } = getInitialVelocity(angle, power, shooter.facing);
          const proj: Projectile = {
            id: `${shooterId}-${Date.now()}-${s}`,
            shooterId,
            x: shooter.x + shooter.facing * 16,
            y: shooter.y - 18,
            vx,
            vy,
            radius: isPow ? 14 : isAirplane ? 9 : 8,
            damage: baseDmg,
            digRadius: digR,
            isPow,
            isAirplane,
            color: shooter.equipped.weapon?.projectileColor || '#f97316',
            bulletType: shooter.equipped.weapon?.bulletType || 'brick',
              icon: shooter.equipped.weapon?.icon,
            trail: [],
            life: 0,
          };
          setProjectiles((prev) => [...prev, proj]);
        }
      }, s * 380);
    }
  };

  // Called from BattleHUD when user releases Spacebar
  const handleFire = (power: number) => {
    const active = currentTurnId === player1.id ? player1 : player2;
    handleExecuteFire(
      active.id,
      active.angle,
      power,
      activeSkills,
      isPowActive
    );
  };

  // Projectile Explosion Handler
  const handleProjectileExplode = (
    proj: Projectile,
    impactX: number,
    impactY: number,
    radius: number
  ) => {
    soundManager.playExplode(proj.isPow);

    // If airplane: teleport shooter to impact spot!
    if (proj.isAirplane) {
      if (proj.shooterId === player1.id) {
        setPlayer1((p) => ({ ...p, x: impactX, y: impactY - 20 }));
      } else {
        setPlayer2((p) => ({ ...p, x: impactX, y: impactY - 20 }));
      }
      checkAndSwitchTurn();
      return;
    }

    // Check hit radius on both targets
    const targets = [player1, player2];
    targets.forEach((target) => {
      const dist = Math.hypot(impactX - target.x, impactY - target.y);
      if (dist < radius + 25) {
        // Damage falloff from epicenter
        const falloff = Math.max(0.35, 1 - dist / (radius + 25));
        const shooter = proj.shooterId === player1.id ? player1 : player2;

        // Luck based critical hit calculation
        const critChance = (shooter.stats.luck / (shooter.stats.luck + 600)) * 100;
        const isCrit = Math.random() * 100 < critChance;
        const critMult = isCrit ? 1.55 : 1.0;

        // Defense mitigation
        const defenseFactor = 1000 / (1000 + target.stats.defense);
        let finalDmg = Math.round(
          proj.damage * falloff * defenseFactor * critMult
        );

        // Shield damage reduction
        if (target.shieldTurns > 0) {
          finalDmg = Math.round(finalDmg * 0.6);
        }

        finalDmg = Math.max(25, finalDmg);

        if (isCrit) {
          soundManager.playCrit();
        }

        // Apply damage & update HP / Rage
        if (target.id === player1.id) {
          setPlayer1((p) => {
            const nextHp = Math.max(0, p.hp - finalDmg);
            const nextRage = Math.min(100, p.rage + Math.round(finalDmg * 0.08));
            return {
              ...p,
              hp: nextHp,
              rage: nextRage,
              isDead: nextHp <= 0,
            };
          });
        } else {
          setPlayer2((p) => {
            const nextHp = Math.max(0, p.hp - finalDmg);
            const nextRage = Math.min(100, p.rage + Math.round(finalDmg * 0.08));
            return {
              ...p,
              hp: nextHp,
              rage: nextRage,
              isDead: nextHp <= 0,
            };
          });
        }

        // Increase shooter rage slightly
        if (shooter.id === player1.id) {
          setPlayer1((p) => ({ ...p, rage: Math.min(100, p.rage + 15) }));
        } else {
          setPlayer2((p) => ({ ...p, rage: Math.min(100, p.rage + 15) }));
        }

        // Floating damage text
        setHitEffects((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            x: target.x,
            y: target.y - 35,
            damage: finalDmg,
            isCrit,
            age: 0,
          },
        ]);
      }
    });

    // Check if any player died
    checkAndSwitchTurn();
  };

  // Check fall gravity for players if ground was blown away
  const handlePlayerFallCheck = (checkCollision: (x: number, y: number) => boolean) => {
    // Player 1 gravity
    if (!player1.isDead) {
      // Buried inside terrain (e.g. after landing from the airplane): push back up to the surface
      if (checkCollision(player1.x, player1.y)) {
        setPlayer1((p) => ({ ...p, y: p.y - 1 }));
        return;
      }
      const isGrounded = checkCollision(player1.x, player1.y + 2);
      if (!isGrounded && player1.y < 650) {
        setPlayer1((p) => {
          const nextY = p.y + 4.5;
          const isDrowned = nextY >= 640;
          return {
            ...p,
            y: nextY,
            isDead: isDrowned,
            hp: isDrowned ? 0 : p.hp,
          };
        });
      }
    }

    // Player 2 gravity
    if (!player2.isDead) {
      // Buried inside terrain (e.g. after landing from the airplane): push back up to the surface
      if (checkCollision(player2.x, player2.y)) {
        setPlayer2((p) => ({ ...p, y: p.y - 1 }));
        return;
      }
      const isGrounded = checkCollision(player2.x, player2.y + 2);
      if (!isGrounded && player2.y < 650) {
        setPlayer2((p) => {
          const nextY = p.y + 4.5;
          const isDrowned = nextY >= 640;
          return {
            ...p,
            y: nextY,
            isDead: isDrowned,
            hp: isDrowned ? 0 : p.hp,
          };
        });
      }
    }
  };

  // Pass Turn
  const handlePassTurn = () => {
    soundManager.playTurnChange();
    setActiveSkills([]);
    setIsPowActive(false);

    // Randomize Wind (-3.5 to +3.5)
    const newSpeed = Number((Math.random() * 7 - 3.5).toFixed(1));
    setWind({
      speed: newSpeed,
      direction: newSpeed >= 0 ? 1 : -1,
    });

    // Switch turn
    setCurrentTurnId((prev) => (prev === player1.id ? player2.id : player1.id));

    // Restore stamina
    setPlayer1((p) => ({
      ...p,
      stamina: 100,
      shieldTurns: Math.max(0, p.shieldTurns - 1),
    }));
    setPlayer2((p) => ({
      ...p,
      stamina: 100,
      shieldTurns: Math.max(0, p.shieldTurns - 1),
    }));
  };

  const checkAndSwitchTurn = () => {
    // Allow small delay for explosions to finish
    setTimeout(() => {
      // Check win condition
      if (player1.hp <= 0 || player1.isDead) {
        setWinner(player2);
        return;
      }
      if (player2.hp <= 0 || player2.isDead) {
        setWinner(player1);
        return;
      }
      handlePassTurn();
    }, 600);
  };

  // Reset / New Match
  const handleResetMatch = () => {
    soundManager.playClick();
    const stats1 = calculateTotalStats(profile.equipped);
    setPlayer1({
      id: 'p1',
      name: profile.name,
      isBot: false,
      x: 220,
      y: 380,
      hp: stats1.hp,
      maxHp: stats1.maxHp,
      angle: 65,
      power: 55,
      facing: 1,
      rage: 30,
      stamina: 100,
      isDead: false,
      stats: stats1,
      equipped: profile.equipped,
      avatarColor: '#f59e0b',
      shieldTurns: 0,
      stealthTurns: 0,
      consecutiveKills: 0,
    });

    const stats2 = calculateTotalStats(profile2.equipped);
    setPlayer2({
      id: 'p2',
      name: profile2.name,
      isBot: false,
      x: 950,
      y: 390,
      hp: stats2.hp,
      maxHp: stats2.maxHp,
      angle: 65,
      power: 55,
      facing: -1,
      rage: 20,
      stamina: 100,
      isDead: false,
      stats: stats2,
      equipped: profile2.equipped,
      avatarColor: '#06b6d4',
      shieldTurns: 0,
      stealthTurns: 0,
      consecutiveKills: 0,
    });

    setWinner(null);
    setProjectiles([]);
    setHitEffects([]);
    setCurrentTurnId('p1');
    const newSpeed = Number((Math.random() * 6 - 3).toFixed(1));
    setWind({ speed: newSpeed, direction: newSpeed >= 0 ? 1 : -1 });
  };

  if (screen === 'lobby') {
    return <LobbyScreen onStart={(lv) => { setBotLevel(lv); setScreen('royale'); }} onOnline={() => setScreen('online')} onClassic={() => setScreen('classic')} />;
  }
  if (screen === 'online') {
    return <OnlineApp onBack={() => setScreen('lobby')} />;
  }
  if (screen === 'royale') {
    return <RoyaleGame level={botLevel} onExit={() => setScreen('lobby')} />;
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-['Nunito',sans-serif]">
      {/* Top Main Navigation Bar */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💣</span>
            <span className="text-xl font-black text-amber-400 font-['Fredoka'] tracking-wide">
              CĂN GÓC TỌA ĐỘ
            </span>
          </div>

          {/* Mode Selector Tabs */}
          <div className="hidden md:flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 ml-4">
            <button
              onClick={() => {
                soundManager.playClick();
                setGameMode('pvp');
              }}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                gameMode === 'pvp'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>2 Người (1v1)</span>
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                setGameMode('training');
                setIsTrajectoryGuide(true);
              }}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                gameMode === 'training'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Tập Bắn & Đo Lực</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Inventory Button */}
          <button
            onClick={() => {
              soundManager.playClick();
              setIsInventoryOpen(true);
            }}
            className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Backpack className="w-4 h-4" />
            <span>Túi Đồ & Lò Rèn</span>
          </button>

          {/* Calculator Button */}
          <button
            onClick={() => {
              soundManager.playClick();
              setIsCalculatorOpen(true);
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs rounded-xl border border-emerald-500/40 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Calculator className="w-4 h-4" />
            <span>Tính Góc 65/90</span>
          </button>

          {/* Help Button */}
          <button
            onClick={() => {
              soundManager.playClick();
              setIsHelpOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 rounded-xl hover:bg-slate-700 transition"
            title="Hướng dẫn chơi & Phím tắt"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Game Arena */}
      <main className="flex-1 min-h-0 w-full relative">
        <GameViewport
          focusPoints={[
            { x: player1.x, y: player1.y },
            { x: player2.x, y: player2.y },
          ]}
          world={
            <>
              {/* 2D Canvas Game Engine */}
              <GunnyCanvas
                player1={player1}
                player2={player2}
                wind={wind}
                currentTurnId={currentTurnId}
                isTrajectoryGuide={isTrajectoryGuide}
                projectiles={projectiles}
                hitEffects={hitEffects}
                onProjectileExplode={handleProjectileExplode}
                onPlayerFallCheck={handlePlayerFallCheck}
                onSetTerrainReady={() => setTerrainReady(true)}
              />

            </>
          }
          overlay={(view) => (
            <>
          {/* Battle HUD Controls */}
          <BattleHUD
            view={view}
            player1={player1}
            player2={player2}
            currentTurnId={currentTurnId}
            wind={wind}
            activeSkills={activeSkills}
            isPowActive={isPowActive}
            onToggleSkill={handleToggleSkill}
            onTogglePow={handleTogglePow}
            onChangeAngle={handleChangeAngle}
            onFire={handleFire}
            onMove={handleMove}
            onOpenCalculator={() => setIsCalculatorOpen(true)}
            onToggleRuler={() => setIsRulerVisible((prev) => !prev)}
            isRulerVisible={isRulerVisible}
            isTrajectoryGuide={isTrajectoryGuide}
            onToggleTrajectoryGuide={() => setIsTrajectoryGuide((prev) => !prev)}
            onResetMatch={handleResetMatch}
          />

          {/* Victory Modal Overlay */}
          {winner && (
            <div data-hud className="absolute inset-0 z-50 pointer-events-auto bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in zoom-in-95">
              <div className="bg-slate-900 border-2 border-amber-400 p-8 rounded-3xl text-center max-w-md w-full shadow-2xl shadow-amber-500/20">
                <div className="text-6xl mb-3 animate-bounce">🏆</div>
                <h3 className="text-3xl font-black text-amber-400 font-['Fredoka'] mb-2">
                  CHIẾN THẮNG TUYỆT VỜI!
                </h3>
                <p className="text-slate-300 text-sm mb-6">
                  Chúc mừng <span className="font-bold text-white">{winner.name}</span> đã
                  hạ gục đối thủ ngoạn mục!
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleResetMatch}
                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-black text-sm rounded-xl shadow-lg transition active:scale-95"
                  >
                    TÁI ĐẤU NGAY
                  </button>
                  <button
                    onClick={() => {
                      setIsInventoryOpen(true);
                      setWinner(null);
                    }}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-sm rounded-xl border border-amber-500/30 transition"
                  >
                    Nâng Cấp Túi Đồ
                  </button>
                </div>
              </div>
            </div>
          )}
            </>
          )}
        />
      </main>

      {/* Inventory & Enhancement Modal */}
      <InventoryModal
        profile={inventoryOwner === 'p1' ? profile : profile2}
        owner={inventoryOwner}
        onChangeOwner={setInventoryOwner}
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
        onUpdateProfile={handleUpdateProfile}
      />

      {/* Formula Calculator Modal */}
      <FormulaCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        currentWind={wind.speed}
        playerX={player1.x}
        playerY={player1.y}
        targetX={player2.x}
        targetY={player2.y}
        facing={player1.facing}
        onApplyShot={(angle, power) => {
          handleChangeAngle(angle);
        }}
      />

      {/* Help & Guide Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-lg w-full text-slate-300 text-xs space-y-4">
            <div className="flex justify-between items-center text-amber-400 font-bold text-base">
              <span>HƯỚNG DẪN BẮN VÀ PHÍM TẮT GUNNY</span>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <p>• <strong>Phím Space (Cách):</strong> Nhấn giữ phím Space để tích lực từ 0 đến 100, thả tay để bắn đạn!</p>
              <p>• <strong>Phím W / S (Mũi tên Lên / Xuống):</strong> Tăng hoặc giảm góc bắn (0° đến 90°).</p>
              <p>• <strong>Phím A / D (Mũi tên Trái / Phải):</strong> Di chuyển nhân vật sang trái hoặc phải (tiêu hao Thể lực).</p>
              <p>• <strong>Đạo cụ chiến đấu:</strong> +1 (2 phát), +2 (3 phát), 3 Tia, +50%, Máy bay giấy di chuyển tức thời.</p>
              <p>• <strong>POW (Nộ):</strong> Khi thanh nộ đạt 100%, nhấn POW để phóng siêu đạn phá hủy hủy diệt!</p>
              <p>• <strong>Công thức Góc 65:</strong> Góc = 65 ± (Gió × 2). Bật máy tính góc hoặc thước đo 10 khúc để bắn bách phát bách trúng!</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
