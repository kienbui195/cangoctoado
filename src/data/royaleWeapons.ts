// 20 everyday-object "weapons" for the Weapon Royale mode.
// Tier (white / blue / red) is decided by the gift box that was hit, NOT by the weapon type.

export type Tier = 'white' | 'blue' | 'red';

export interface TierInfo {
  id: Tier;
  label: string;
  color: string; // main color (borders / glow)
  dark: string; // ribbon / dark shade
  damageMult: number;
  effectMult: number; // scales the special effect strength
  question: 'easy' | 'medium' | 'hard';
}

export const TIERS: Record<Tier, TierInfo> = {
  white: { id: 'white', label: 'VIP', color: '#f1f5f9', dark: '#94a3b8', damageMult: 1, effectMult: 1, question: 'easy' },
  blue: { id: 'blue', label: 'WOW', color: '#38bdf8', dark: '#1d4ed8', damageMult: 1.35, effectMult: 1.25, question: 'medium' },
  red: { id: 'red', label: 'LEGEND', color: '#f43f5e', dark: '#9f1239', damageMult: 1.95, effectMult: 1.6, question: 'hard' },
};

export type Tier3 = Tier;
export const TIER_ORDER: Tier[] = ['white', 'blue', 'red'];
export const nextTier = (t: Tier): Tier | null => TIER_ORDER[TIER_ORDER.indexOf(t) + 1] ?? null;

// ---- Ngũ hành. Sinh: Mộc→Hỏa→Thổ→Kim→Thủy→Mộc. Firing a weapon right after one whose element "sinh" it = +30%.
export type Element = 'kim' | 'moc' | 'thuy' | 'hoa' | 'tho';
export interface ElementInfo {
  id: Element;
  name: string; // Vietnamese name
  color: string;
  perk: string; // small bonus every weapon of this element gets when it lands
}
// Colors: Hỏa đỏ, Thủy xanh lam, Mộc xanh lá, Thổ nâu, Kim vàng
export const ELEMENTS: Record<Element, ElementInfo> = {
  kim: { id: 'kim', name: 'Kim', color: '#facc15', perk: 'Sắc bén: +15% tỉ lệ chí mạng.' },
  moc: { id: 'moc', name: 'Mộc', color: '#22c55e', perk: 'Sinh trưởng: hồi 3% máu khi trúng.' },
  thuy: { id: 'thuy', name: 'Thủy', color: '#3b82f6', perk: 'Làm chậm: đòn kế tiếp của đối thủ yếu đi 10%.' },
  hoa: { id: 'hoa', name: 'Hỏa', color: '#ef4444', perk: 'Thiêu đốt: gây thêm bỏng nhẹ.' },
  tho: { id: 'tho', name: 'Thổ', color: '#a16207', perk: 'Vững chãi: nhận giáp giảm 15% đòn kế tiếp.' },
};
export const ELEMENT_LIST: Element[] = ['kim', 'moc', 'thuy', 'hoa', 'tho'];
/** Tương sinh: key sinh value (Mộc→Hỏa→Thổ→Kim→Thủy→Mộc). Weapon fired right after one that "sinh" it: +30%. */
export const SINH: Record<Element, Element> = { moc: 'hoa', hoa: 'tho', tho: 'kim', kim: 'thuy', thuy: 'moc' };
export const isSinh = (prev: Element, cur: Element) => SINH[prev] === cur;
/** Tương khắc: key khắc value (Mộc→Thổ→Thủy→Hỏa→Kim→Mộc). In the same round, the countered weapon loses 20%. */
export const KHAC: Record<Element, Element> = { moc: 'tho', tho: 'thuy', thuy: 'hoa', hoa: 'kim', kim: 'moc' };
export const isKhac = (attacker: Element, victim: Element) => KHAC[attacker] === victim;
export const KHAC_PENALTY = 0.2;

export type EffectKind =
  | 'heavy' // pure big hit + bigger crater
  | 'multi' // several shells on different arcs
  | 'bounce' // second, weaker strike after a bounce
  | 'splash' // wide explosion
  | 'crit' // high crit chance
  | 'pierce' // ignores defense
  | 'burn' // damage over time
  | 'freeze' // opponent's next weapon is weaker
  | 'shield' // damage reduction vs the opponent's next weapon
  | 'heal' // heal self (% max HP)
  | 'lifesteal' // heal self by % of damage dealt
  | 'empower' // own next weapon is stronger
  | 'revive'; // passive: come back once when KO'd (if in the lineup)

export interface RoyaleWeapon {
  id: string;
  name: string;
  icon: string; // weapon emoji (charge-up animation, cards)
  ammo: string; // emoji of the flying shell
  color: string; // aura / trail color
  fx: string[]; // particle emojis for the burst and the impact
  base: number; // base power (~100 = average)
  hits: number[]; // damage share of every shell (length = number of shells)
  stagger: number; // ms between shells
  effect: EffectKind;
  power: number; // effect strength (0..1 ratio, meaning depends on the effect)
  blast: number; // impact radius for visuals
  trait: string; // short Vietnamese description of the special trait
}

export const ROYALE_WEAPONS: RoyaleWeapon[] = [
  { id: 'tu_lanh', name: 'Tủ Lạnh 2 Cánh', icon: '🧊', ammo: '🧊', color: '#7dd3fc', fx: ['❄️', '🧊', '💎'], base: 100, hits: [1], stagger: 0, effect: 'freeze', power: 0.3, blast: 60, trait: 'Đóng băng: vũ khí kế tiếp của đối thủ yếu đi 30%.' },
  { id: 'dep_tong', name: 'Dép Tông Thần Tốc', icon: '🩴', ammo: '🩴', color: '#fb923c', fx: ['💢', '⭐', '💥'], base: 90, hits: [0.5, 0.5, 0.5], stagger: 260, effect: 'multi', power: 0, blast: 38, trait: 'Tát liên hoàn: 3 chiếc dép bay theo 3 đường cong khác nhau.' },
  { id: 'sung_nuoc', name: 'Súng Phun Nước', icon: '🔫', ammo: '💦', color: '#38bdf8', fx: ['💧', '💦', '🫧'], base: 95, hits: [1], stagger: 0, effect: 'splash', power: 0.5, blast: 95, trait: 'Bóng nước nổ tung, bán kính nổ cực rộng.' },
  { id: 'sot_rac', name: 'Sọt Rác Tái Chế', icon: '🗑️', ammo: '🥫', color: '#a3e635', fx: ['♻️', '🍌', '🥫'], base: 85, hits: [1], stagger: 0, effect: 'heal', power: 0.1, blast: 55, trait: 'Tái chế: hồi 10% máu tối đa cho chủ nhân.' },
  { id: 'sach_phep', name: 'Quyển Sách Phép', icon: '📖', ammo: '🔥', color: '#f97316', fx: ['🔥', '✨', '🌟'], base: 100, hits: [1], stagger: 0, effect: 'burn', power: 0.45, blast: 70, trait: 'Cầu lửa: thiêu đốt thêm sát thương theo thời gian.' },
  { id: 'lo_vi_song', name: 'Lò Vi Sóng', icon: '📟', ammo: '📡', color: '#facc15', fx: ['⚡', '✨', '📡'], base: 105, hits: [1], stagger: 0, effect: 'pierce', power: 1, blast: 60, trait: 'Tia vi sóng xuyên giáp: bỏ qua phòng thủ đối thủ.' },
  { id: 'gao_dua', name: 'Gáo Dừa Khổng Lồ', icon: '🥥', ammo: '🥥', color: '#a16207', fx: ['🥥', '💥', '🪵'], base: 130, hits: [1], stagger: 0, effect: 'heavy', power: 0, blast: 85, trait: 'Nặng ký: một cú đập sát thương rất lớn.' },
  { id: 'chao', name: 'Cái Chảo Bất Hoại', icon: '🍳', ammo: '🍳', color: '#94a3b8', fx: ['🛡️', '✨', '🍳'], base: 90, hits: [1], stagger: 0, effect: 'shield', power: 0.35, blast: 55, trait: 'Chảo chống đạn: giảm 35% sát thương của đòn kế tiếp.' },
  { id: 'gio_trai_cay', name: 'Giỏ Trái Cây', icon: '🧺', ammo: '🍎', color: '#4ade80', fx: ['🍎', '🍊', '🍇', '🍓', '🍐'], base: 80, hits: [0.3, 0.3, 0.3, 0.3, 0.3], stagger: 170, effect: 'multi', power: 0, blast: 34, trait: 'Mưa trái cây: 5 quả bay tản ra nhiều hướng.' },
  { id: 'xe_hoi', name: 'Xe Hơi Mini', icon: '🚗', ammo: '🚗', color: '#ef4444', fx: ['💨', '🔥', '💥'], base: 140, hits: [1], stagger: 0, effect: 'heavy', power: 0, blast: 100, trait: 'Tông thẳng mặt: sát thương khủng, nổ cực to.' },
  { id: 'bong_da', name: 'Bóng Đá Thần Sầu', icon: '⚽', ammo: '⚽', color: '#e2e8f0', fx: ['⚽', '💫', '⭐'], base: 90, hits: [1, 0.6], stagger: 650, effect: 'bounce', power: 0, blast: 50, trait: 'Nảy 2 lần: cú thứ hai nhẹ hơn nhưng khó đỡ.' },
  { id: 'rong_nuoc', name: 'Rồng Nước', icon: '🐉', ammo: '🐲', color: '#22d3ee', fx: ['🌊', '💧', '🐉'], base: 110, hits: [1], stagger: 0, effect: 'splash', power: 0.7, blast: 115, trait: 'Rồng phun sóng thần: vụ nổ nước diện rộng.' },
  { id: 'trung_phuc_sinh', name: 'Quả Trứng Phục Sinh', icon: '🥚', ammo: '🥚', color: '#fde68a', fx: ['✨', '🐣', '💛'], base: 60, hits: [1], stagger: 0, effect: 'revive', power: 0.3, blast: 55, trait: 'Phục sinh: nếu đang ra trận, hồi sinh 1 lần với 30% máu khi bị hạ gục.' },
  { id: 'thong_noel', name: 'Cây Thông Giáng Sinh', icon: '🎄', ammo: '⭐', color: '#34d399', fx: ['⭐', '🎁', '❄️', '🔔'], base: 85, hits: [0.6, 0.6, 0.6], stagger: 220, effect: 'heal', power: 0.06, blast: 45, trait: 'Ba ngôi sao ban phước, hồi 6% máu cho chủ nhân.' },
  { id: 'noi_com', name: 'Nồi Cơm Điện', icon: '🍚', ammo: '🍚', color: '#fbbf24', fx: ['♨️', '🍚', '💨'], base: 95, hits: [1], stagger: 0, effect: 'burn', power: 0.35, blast: 65, trait: 'Hơi nước nóng bỏng: gây bỏng liên tục.' },
  { id: 'may_giat', name: 'Máy Giặt Cuồng Quay', icon: '🌀', ammo: '🌀', color: '#818cf8', fx: ['🌀', '🫧', '💫'], base: 95, hits: [0.45, 0.45, 0.45], stagger: 300, effect: 'multi', power: 0, blast: 42, trait: 'Vòng quay hỗn loạn: 3 cú xoáy liên tiếp.' },
  { id: 'quat_dien', name: 'Quạt Điện Cuồng Phong', icon: '🌪️', ammo: '🌪️', color: '#67e8f9', fx: ['🌪️', '💨', '🍃'], base: 100, hits: [1], stagger: 0, effect: 'crit', power: 0.4, blast: 60, trait: 'Cuồng phong: 40% cơ hội chí mạng gấp đôi sát thương.' },
  { id: 'o_du', name: 'Cái Ô Che Mưa', icon: '☂️', ammo: '☂️', color: '#c084fc', fx: ['☔', '✨', '💜'], base: 60, hits: [1], stagger: 0, effect: 'shield', power: 0.55, blast: 50, trait: 'Che mưa che nắng: giảm 55% sát thương của đòn kế tiếp.' },
  { id: 'pin', name: 'Cục Pin Vô Tận', icon: '🔋', ammo: '🔋', color: '#a3e635', fx: ['⚡', '🔋', '✨'], base: 75, hits: [1], stagger: 0, effect: 'empower', power: 0.3, blast: 55, trait: 'Sạc đầy: vũ khí kế tiếp của bạn mạnh thêm 30%.' },
  { id: 'gau_bong', name: 'Gấu Bông Ôm Chặt', icon: '🧸', ammo: '🧸', color: '#f9a8d4', fx: ['💖', '💕', '🧸'], base: 95, hits: [1], stagger: 0, effect: 'lifesteal', power: 0.4, blast: 55, trait: 'Cái ôm hút máu: hồi 40% sát thương gây ra.' },
];

export const WEAPON_BY_ID: Record<string, RoyaleWeapon> = Object.fromEntries(
  ROYALE_WEAPONS.map((w) => [w.id, w])
);

export interface OwnedWeapon {
  uid: string;
  weaponId: string;
  tier: Tier;
  element: Element;
}

let uidCounter = 0;
export function makeOwned(weaponId: string, tier: Tier, element?: Element): OwnedWeapon {
  uidCounter += 1;
  return {
    uid: `w${uidCounter}-${Math.random().toString(36).slice(2, 6)}`,
    weaponId,
    tier,
    element: element ?? ELEMENT_LIST[Math.floor(Math.random() * ELEMENT_LIST.length)],
  };
}

export function randomWeaponId(): string {
  return ROYALE_WEAPONS[Math.floor(Math.random() * ROYALE_WEAPONS.length)].id;
}
