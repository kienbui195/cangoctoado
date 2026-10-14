export type EquipmentSlot =
  | 'weapon'
  | 'subWeapon'
  | 'hat'
  | 'armor'
  | 'gloves'
  | 'ring1'
  | 'ring2'
  | 'bracelet1'
  | 'bracelet2'
  | 'pet';

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Item {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: ItemRarity;
  icon: string; // Emoji or svg token
  description: string;
  level: number; // +0 to +12
  stats: {
    attack: number;
    defense: number;
    agility: number;
    luck: number;
    hp: number;
    dig: number; // digging depth / explosion radius
  };
  projectileColor?: string;
  bulletType?: 'brick' | 'firstaid' | 'lightning' | 'cannon' | 'boomerang' | 'fruit' | 'axe';
  petSkill?: {
    name: string;
    description: string;
    effectType: 'heal' | 'shield' | 'boostDmg' | 'crit';
    value: number;
  };
  subWeaponType?: 'angel' | 'shield';
}

export interface CharacterProfile {
  name: string;
  level: number;
  exp: number;
  gold: number;
  enhancementStones: number;
  equipped: Record<EquipmentSlot, Item | null>;
  inventory: Item[];
}

export type BattleSkillId =
  | 'dual' // +1
  | 'triple' // +2
  | 'scatter' // 3 tia
  | 'dmg50' // +50%
  | 'dmg40' // +40%
  | 'dmg30' // +30%
  | 'dmg20' // +20%
  | 'heal' // Hồi máu
  | 'airplane' // Máy bay
  | 'subWeapon' // Vũ khí phụ (Thiên sứ / Khiên)
  | 'petSkill'; // Skill Thú Cưng

export interface BattleSkill {
  id: BattleSkillId;
  name: string;
  cost: number; // Stamina cost
  icon: string;
  description: string;
  isBuff?: boolean;
}

export interface PlayerStats {
  attack: number;
  defense: number;
  agility: number;
  luck: number;
  hp: number;
  maxHp: number;
  dig: number;
}

export interface PlayerEntity {
  id: string;
  name: string;
  isBot: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  angle: number; // 0 to 90
  power: number; // 0 to 100
  facing: 1 | -1; // 1 = right, -1 = left
  rage: number; // 0 to 100
  stamina: number; // 0 to 100
  isDead: boolean;
  stats: PlayerStats;
  equipped: Record<EquipmentSlot, Item | null>;
  avatarColor: string;
  shieldTurns: number;
  stealthTurns: number;
  consecutiveKills: number;
}

export interface Projectile {
  id: string;
  shooterId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  digRadius: number;
  isPow: boolean;
  isAirplane: boolean;
  isHeal?: boolean;
  color: string;
  trail: { x: number; y: number }[];
  life: number;
  bulletType: string;
  icon?: string; // equipped weapon icon drawn as the shell head
}

export interface WindState {
  speed: number; // -4.0 to +4.0
  direction: 1 | -1; // 1 = right, -1 = left
}

export interface HitEffect {
  id: string;
  x: number;
  y: number;
  damage: number;
  isCrit: boolean;
  isHeal?: boolean;
  text?: string;
  age: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export type GameMode = 'pvp' | 'training';
