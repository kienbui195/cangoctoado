import {
  CharacterProfile,
  EquipmentSlot,
  Item,
  PlayerStats,
} from '../types/game';
import {
  INITIAL_WEAPONS,
  INITIAL_SUB_WEAPONS,
  INITIAL_HATS,
  INITIAL_ARMORS,
  INITIAL_GLOVES,
  INITIAL_RINGS,
  INITIAL_BRACELETS,
  INITIAL_PETS,
} from '../data/items';

const STORAGE_KEY = 'gunny_web_classic_profile_v1';
const STORAGE_KEY_P2 = 'gunny_web_classic_profile_p2_v1';

export type PlayerSlot = 'p1' | 'p2';
const keyOf = (who: PlayerSlot) => (who === 'p2' ? STORAGE_KEY_P2 : STORAGE_KEY);

export function getDefaultProfile(who: PlayerSlot = 'p1'): CharacterProfile {
  return {
    name: who === 'p2' ? 'Người Chơi 2' : 'GunnyPro_9x',
    level: 35,
    exp: 4200,
    gold: 500000000000000,
    enhancementStones: 60,
    equipped: {
      weapon: { ...INITIAL_WEAPONS[0] }, // Lu Gạch
      subWeapon: { ...INITIAL_SUB_WEAPONS[0] }, // Thiên Sứ Ban Phúc
      hat: { ...INITIAL_HATS[0] }, // Mũ Thuyền Trưởng
      armor: { ...INITIAL_ARMORS[0] }, // Áo Choàng Bá Tước
      gloves: { ...INITIAL_GLOVES[0] }, // Găng Tay Quyền Vương
      ring1: { ...INITIAL_RINGS[0] }, // Nhẫn Tình Nhân
      ring2: { ...INITIAL_RINGS[1] }, // Nhẫn Ác Ma
      bracelet1: { ...INITIAL_BRACELETS[0] }, // Vòng Tay Vàng Ròng
      bracelet2: { ...INITIAL_BRACELETS[1] }, // Vòng Tay Kim Cương
      pet: { ...INITIAL_PETS[0] }, // Mầm Xanh
    },
    inventory: [
      { ...INITIAL_WEAPONS[1] }, // Tủ Thuốc
      { ...INITIAL_WEAPONS[2] }, // Sấm Sét
      { ...INITIAL_WEAPONS[3] }, // Pháo Cao Xạ
      { ...INITIAL_WEAPONS[4] }, // Boomerang
      { ...INITIAL_SUB_WEAPONS[1] }, // Khiên Baron
      { ...INITIAL_HATS[1] }, // Nón Lá
      { ...INITIAL_ARMORS[1] }, // Kim Thân Giáp
      { ...INITIAL_GLOVES[1] }, // Găng Long Tộc
      { ...INITIAL_RINGS[2] }, // Nhẫn Chữ X
      { ...INITIAL_PETS[1] }, // Bé Đậu Đậu
      { ...INITIAL_PETS[2] }, // Kiến Con
      { ...INITIAL_PETS[3] }, // Đấu Sĩ Gà
    ],
  };
}

export function loadProfile(who: PlayerSlot = 'p1'): CharacterProfile {
  try {
    const raw = localStorage.getItem(keyOf(who));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.equipped && parsed.inventory) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse saved profile', e);
  }
  return getDefaultProfile(who);
}

export function saveProfile(profile: CharacterProfile, who: PlayerSlot = 'p1') {
  try {
    localStorage.setItem(keyOf(who), JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save profile', e);
  }
}

/**
 * Calculates aggregated player stats from all 10 equipped gear slots
 */
export function calculateTotalStats(equipped: Record<EquipmentSlot, Item | null>): PlayerStats {
  const baseHp = 1500;
  let attack = 150;
  let defense = 120;
  let agility = 100;
  let luck = 90;
  let hp = baseHp;
  let dig = 35;

  Object.values(equipped).forEach((item) => {
    if (!item) return;
    const levelMult = 1 + (item.level || 0) * 0.08; // 8% boost per enhancement level
    attack += Math.round((item.stats.attack || 0) * levelMult);
    defense += Math.round((item.stats.defense || 0) * levelMult);
    agility += Math.round((item.stats.agility || 0) * levelMult);
    luck += Math.round((item.stats.luck || 0) * levelMult);
    hp += Math.round((item.stats.hp || 0) * levelMult);
    if (item.stats.dig && item.stats.dig > dig) {
      dig = item.stats.dig;
    }
  });

  return {
    attack,
    defense,
    agility,
    luck,
    hp,
    maxHp: hp,
    dig,
  };
}

/**
 * Enhancement success rates for +0 to +12
 */
export const ENHANCE_RATES: Record<number, number> = {
  0: 100,
  1: 95,
  2: 90,
  3: 85,
  4: 75,
  5: 65,
  6: 55,
  7: 45,
  8: 35,
  9: 25,
  10: 18,
  11: 12,
  12: 8,
};
