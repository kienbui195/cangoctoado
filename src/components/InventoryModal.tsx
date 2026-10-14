import React, { useEffect, useState } from 'react';
import {
  CharacterProfile,
  EquipmentSlot,
  Item,
} from '../types/game';
import { calculateTotalStats, ENHANCE_RATES } from '../utils/playerStorage';
import { soundManager } from '../utils/audio';
import { X, Sparkles, Shield, Zap, Heart, Crosshair, ArrowUpCircle } from 'lucide-react';

interface Props {
  profile: CharacterProfile;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProfile: (updated: CharacterProfile) => void;
  owner: 'p1' | 'p2';
  onChangeOwner: (owner: 'p1' | 'p2') => void;
}

const SLOT_CONFIG: { key: EquipmentSlot; label: string; icon: string }[] = [
  { key: 'weapon', label: 'Vũ khí chính', icon: '⚔️' },
  { key: 'subWeapon', label: 'Vũ khí phụ', icon: '🛡️' },
  { key: 'hat', label: 'Mũ thời trang', icon: '🎩' },
  { key: 'armor', label: 'Áo giáp hộ thân', icon: '🥋' },
  { key: 'gloves', label: 'Găng tay xạ thủ', icon: '🥊' },
  { key: 'ring1', label: 'Nhẫn 1', icon: '💍' },
  { key: 'ring2', label: 'Nhẫn 2', icon: '💎' },
  { key: 'bracelet1', label: 'Vòng tay 1', icon: '💫' },
  { key: 'bracelet2', label: 'Vòng tay 2', icon: '✨' },
  { key: 'pet', label: 'Thú cưng hộ mệnh', icon: '🐾' },
];

const ITEM_STAT_ROWS: { key: 'attack' | 'defense' | 'agility' | 'luck' | 'hp' | 'dig'; label: string }[] = [
  { key: 'attack', label: 'Tấn công' },
  { key: 'defense', label: 'Phòng thủ' },
  { key: 'hp', label: 'Máu (HP)' },
  { key: 'luck', label: 'May mắn' },
  { key: 'agility', label: 'Nhanh nhẹn' },
  { key: 'dig', label: 'Lực đào đất' },
];

export const InventoryModal: React.FC<Props> = ({
  profile,
  isOpen,
  onClose,
  onUpdateProfile,
  owner,
  onChangeOwner,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'enhance'>('inventory');
  const [enhanceTarget, setEnhanceTarget] = useState<Item | null>(null);
  const [enhanceResultMsg, setEnhanceResultMsg] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Switching player: forget the previously selected forge item
  useEffect(() => {
    setEnhanceTarget(null);
    setEnhanceResultMsg(null);
  }, [owner]);

  // Auto-dismiss toast for enhancement results
  useEffect(() => {
    if (!enhanceResultMsg) return;
    const t = setTimeout(() => setEnhanceResultMsg(null), 3500);
    return () => clearTimeout(t);
  }, [enhanceResultMsg]);

  if (!isOpen) return null;

  const stats = calculateTotalStats(profile.equipped);

  // Equip item from inventory
  const handleEquip = (item: Item) => {
    soundManager.playClick();
    // Rings / bracelets have two slots: use a free one first, otherwise replace the item's own slot
    const pair: EquipmentSlot[] | null = item.slot.startsWith('ring')
      ? ['ring1', 'ring2']
      : item.slot.startsWith('bracelet')
      ? ['bracelet1', 'bracelet2']
      : null;
    const targetSlot: EquipmentSlot = pair
      ? pair.find((k) => !profile.equipped[k]) ?? (pair.includes(item.slot) ? item.slot : pair[0])
      : item.slot;
    const currentEquipped = profile.equipped[targetSlot];

    // Remove from inventory
    const newInventory = profile.inventory.filter((i) => i.id !== item.id);
    if (currentEquipped) {
      newInventory.push(currentEquipped);
    }

    const updatedProfile: CharacterProfile = {
      ...profile,
      equipped: {
        ...profile.equipped,
        [targetSlot]: item,
      },
      inventory: newInventory,
    };

    onUpdateProfile(updatedProfile);
    if (enhanceTarget?.id === item.id) {
      setEnhanceTarget(item);
    }
  };

  // Edit gold / enhancement stones directly
  const handleEditCurrency = (patch: Partial<Pick<CharacterProfile, 'gold' | 'enhancementStones'>>) => {
    const clean: typeof patch = {};
    if (patch.gold !== undefined) clean.gold = Math.max(0, Math.floor(patch.gold) || 0);
    if (patch.enhancementStones !== undefined)
      clean.enhancementStones = Math.max(0, Math.floor(patch.enhancementStones) || 0);
    const updatedProfile: CharacterProfile = { ...profile, ...clean };
    onUpdateProfile(updatedProfile);
  };

  // Unequip item
  const handleUnequip = (slot: EquipmentSlot) => {
    soundManager.playClick();
    const item = profile.equipped[slot];
    if (!item) return;

    const updatedProfile: CharacterProfile = {
      ...profile,
      equipped: {
        ...profile.equipped,
        [slot]: null,
      },
      inventory: [...profile.inventory, item],
    };

    onUpdateProfile(updatedProfile);
    if (enhanceTarget?.id === item.id) {
      setEnhanceTarget(null);
    }
  };

  // Enhance item
  const handleEnhance = () => {
    if (!enhanceTarget) return;
    if (enhanceTarget.level >= 12) {
      setEnhanceResultMsg('Vũ khí đã đạt cấp tối đa +12!');
      return;
    }
    const costStone = (enhanceTarget.level + 1) * 3;
    const costGold = (enhanceTarget.level + 1) * 2500;

    if (profile.enhancementStones < costStone || profile.gold < costGold) {
      setEnhanceResultMsg('Không đủ Đá Cường Hóa hoặc Vàng!');
      return;
    }

    setIsEnhancing(true);
    setEnhanceResultMsg(null);
    soundManager.playChargeTick(0.5);

    setTimeout(() => {
      const rate = ENHANCE_RATES[enhanceTarget.level] || 10;
      const roll = Math.random() * 100;
      const success = roll <= rate;

      let nextLevel = enhanceTarget.level;
      let msg = '';

      if (success) {
        soundManager.playEnhanceSuccess();
        nextLevel += 1;
        msg = `🎉 Cường Hóa Thành Công! ${enhanceTarget.name} đạt cấp +${nextLevel}!`;
      } else {
        soundManager.playExplode(false);
        msg = `💥 Cường Hóa Thất Bại! Đừng nản chí, hãy thử lại!`;
      }

      const updatedItem: Item = {
        ...enhanceTarget,
        level: nextLevel,
      };

      // Check if equipped or in inventory
      const isEquippedSlot = Object.keys(profile.equipped).find(
        (slotKey) => profile.equipped[slotKey as EquipmentSlot]?.id === enhanceTarget.id
      ) as EquipmentSlot | undefined;

      let updatedEquipped = { ...profile.equipped };
      let updatedInv = [...profile.inventory];

      if (isEquippedSlot) {
        updatedEquipped[isEquippedSlot] = updatedItem;
      } else {
        updatedInv = updatedInv.map((i) => (i.id === updatedItem.id ? updatedItem : i));
      }

      const updatedProfile: CharacterProfile = {
        ...profile,
        gold: profile.gold - costGold,
        enhancementStones: profile.enhancementStones - costStone,
        equipped: updatedEquipped,
        inventory: updatedInv,
      };

      setEnhanceTarget(updatedItem);
      setEnhanceResultMsg(msg);
      setIsEnhancing(false);
      onUpdateProfile(updatedProfile);
      }, 700);
  };

  const isSuccessMsg = enhanceResultMsg?.includes('Thành Công') ?? false;
  const isFailMsg = enhanceResultMsg?.includes('Thất Bại') ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      {enhanceResultMsg && (
        <div
          role="status"
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl border-2 shadow-2xl text-sm font-bold flex items-center gap-3 ${
            isSuccessMsg
              ? 'bg-emerald-950 border-emerald-400 text-emerald-200'
              : isFailMsg
              ? 'bg-rose-950 border-rose-400 text-rose-200'
              : 'bg-slate-900 border-amber-500/60 text-amber-300'
          }`}
        >
          <span>{enhanceResultMsg}</span>
          <button
            onClick={() => setEnhanceResultMsg(null)}
            className="text-slate-300 hover:text-white"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
      )}
      <div className="bg-slate-900 border-2 border-amber-500/70 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl shadow-amber-500/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎒</span>
            <div>
              <h2 className="text-xl font-bold text-amber-400 font-['Fredoka'] tracking-wide">
                TÚI ĐỒ & TRANG BỊ NHÂN VẬT
              </h2>
              <p className="text-xs text-slate-400">
                10 vị trí trang bị chuẩn Gunny: Vũ khí chính, phụ, mũ, giáp, găng tay, 2 nhẫn, 2 vòng tay, thú cưng
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-700">
              {(['p1', 'p2'] as const).map((who) => (
                <button
                  key={who}
                  onClick={() => {
                    soundManager.playClick();
                    onChangeOwner(who);
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    owner === who
                      ? who === 'p1'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {who === 'p1' ? 'Người chơi 1' : 'Người chơi 2'}
                </button>
              ))}
            </div>
            <div className="text-xs text-amber-300 bg-amber-950/60 px-3 py-1.5 rounded-lg border border-amber-600/40 flex items-center gap-2">
              <span>🪙</span>
              <input
                type="number"
                min={0}
                value={profile.gold}
                onChange={(e) => handleEditCurrency({ gold: Number(e.target.value) })}
                className="w-40 bg-slate-950 border border-amber-700/50 rounded px-1.5 py-0.5 text-amber-200 font-bold outline-none focus:border-amber-400"
                title="Sửa số Vàng"
              />
              <span>Vàng ·</span>
              <span>💎</span>
              <input
                type="number"
                min={0}
                value={profile.enhancementStones}
                onChange={(e) => handleEditCurrency({ enhancementStones: Number(e.target.value) })}
                className="w-16 bg-slate-950 border border-amber-700/50 rounded px-1.5 py-0.5 text-amber-200 font-bold outline-none focus:border-amber-400"
                title="Sửa số Đá cường hóa"
              />
              <span>Đá</span>
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
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 bg-slate-950 px-6 gap-2 pt-2">
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveTab('inventory');
            }}
            className={`px-4 py-2 font-bold text-sm rounded-t-lg transition flex items-center gap-2 ${
              activeTab === 'inventory'
                ? 'bg-slate-900 text-amber-400 border-t-2 border-amber-400 shadow-inner'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⚔️ Trang Bị & Chỉ Số</span>
          </button>
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveTab('enhance');
              if (!enhanceTarget) {
                setEnhanceTarget(profile.equipped.weapon);
              }
            }}
            className={`px-4 py-2 font-bold text-sm rounded-t-lg transition flex items-center gap-2 ${
              activeTab === 'enhance'
                ? 'bg-slate-900 text-amber-400 border-t-2 border-amber-400 shadow-inner'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Lò Rèn Cường Hóa (+12)</span>
          </button>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${activeTab === 'enhance' ? 'p-2' : 'p-6'}`}>
          {activeTab === 'inventory' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left & Middle: Gear slots surrounding character */}
              <div className="lg:col-span-7 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">
                  Trang Bị Hiện Tại (10 Vị Trí)
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* Left Column: 5 slots */}
                  <div className="space-y-2.5">
                    {SLOT_CONFIG.slice(0, 5).map((cfg) => {
                      const item = profile.equipped[cfg.key];
                      return (
                        <div
                          key={cfg.key}
                          onClick={() => {
                            if (item) setEnhanceTarget(item);
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                            item
                              ? 'bg-slate-800/80 border-amber-500/40 hover:border-amber-400'
                              : 'bg-slate-900/40 border-dashed border-slate-700/80'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{item?.icon || cfg.icon}</span>
                            <div>
                              <div className="text-xs text-slate-400">{cfg.label}</div>
                              <div className="text-xs font-bold text-slate-200">
                                {item ? (
                                  <span className="text-amber-300">
                                    {item.name} <span className="text-yellow-400 font-extrabold">+{item.level}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500 italic">Trống</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {item && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnequip(cfg.key);
                              }}
                              className="text-[10px] text-red-400 hover:text-red-300 bg-red-950/50 hover:bg-red-900/60 px-2 py-1 rounded border border-red-800/40"
                            >
                              Tháo
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Column: 5 slots */}
                  <div className="space-y-2.5">
                    {SLOT_CONFIG.slice(5).map((cfg) => {
                      const item = profile.equipped[cfg.key];
                      return (
                        <div
                          key={cfg.key}
                          onClick={() => {
                            if (item) setEnhanceTarget(item);
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                            item
                              ? 'bg-slate-800/80 border-amber-500/40 hover:border-amber-400'
                              : 'bg-slate-900/40 border-dashed border-slate-700/80'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{item?.icon || cfg.icon}</span>
                            <div>
                              <div className="text-xs text-slate-400">{cfg.label}</div>
                              <div className="text-xs font-bold text-slate-200">
                                {item ? (
                                  <span className="text-amber-300">
                                    {item.name} <span className="text-yellow-400 font-extrabold">+{item.level}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500 italic">Trống</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {item && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnequip(cfg.key);
                              }}
                              className="text-[10px] text-red-400 hover:text-red-300 bg-red-950/50 hover:bg-red-900/60 px-2 py-1 rounded border border-red-800/40"
                            >
                              Tháo
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Aggregated Stats Card */}
                <div className="bg-gradient-to-br from-slate-900 to-amber-950/30 p-3.5 rounded-xl border border-amber-500/30">
                  <div className="text-xs font-bold text-amber-400 mb-2 flex items-center justify-between">
                    <span>TỔNG CHỈ SỐ NHÂN VẬT</span>
                    <span className="text-[11px] text-slate-400">Cấp {profile.level} Gunner</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 text-xs">
                    <div className="flex items-center gap-1.5 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <div>
                        <div className="text-slate-400 text-[10px]">Tấn Công</div>
                        <div className="font-bold text-amber-300">{stats.attack}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <div>
                        <div className="text-slate-400 text-[10px]">Phòng Thủ</div>
                        <div className="font-bold text-blue-300">{stats.defense}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <Heart className="w-3.5 h-3.5 text-rose-400" />
                      <div>
                        <div className="text-slate-400 text-[10px]">Máu (HP)</div>
                        <div className="font-bold text-rose-300">{stats.hp}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <div>
                        <div className="text-slate-400 text-[10px]">Nhanh Nhẹn</div>
                        <div className="font-bold text-emerald-300">{stats.agility}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <div>
                        <div className="text-slate-400 text-[10px]">May Mắn</div>
                        <div className="font-bold text-purple-300">{stats.luck}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <Crosshair className="w-3.5 h-3.5 text-orange-400" />
                      <div>
                        <div className="text-slate-400 text-[10px]">Lực Đào Đất</div>
                        <div className="font-bold text-orange-300">{stats.dig} px</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Backpack Inventory List */}
              <div className="lg:col-span-5 flex flex-col bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Kho Túi Đồ ({profile.inventory.length} món)
                  </div>
                  <span className="text-[11px] text-amber-400">Bấm trang bị</span>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto max-h-[380px] pr-1">
                  {profile.inventory.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs italic">
                      Túi đồ hiện đang trống!
                    </div>
                  ) : (
                    profile.inventory.map((item) => (
                      <div
                        key={item.id}
                        className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/60 p-3 rounded-xl flex items-center justify-between transition group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-3xl p-1 bg-slate-950 rounded-lg border border-slate-800">
                            {item.icon}
                          </span>
                          <div>
                            <div className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition">
                              {item.name}{' '}
                              <span className="text-yellow-400 text-xs">+{item.level}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {item.slot === 'weapon'
                                ? 'Vũ khí chính'
                                : item.slot === 'subWeapon'
                                ? 'Vũ khí phụ'
                                : item.slot === 'pet'
                                ? 'Thú cưng'
                                : item.slot.startsWith('ring')
                                ? 'Nhẫn'
                                : item.slot.startsWith('bracelet')
                                ? 'Vòng tay'
                                : item.slot}
                              {' · '}
                              Công: {item.stats.attack} · Giáp: {item.stats.defense} · HP: {item.stats.hp}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEquip(item)}
                            className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg shadow transition active:scale-95"
                          >
                            Trang Bị
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Forge / Enhancement Screen */
            <div className="w-full bg-slate-950 p-4 rounded-2xl border border-amber-500/40 text-center">
              <div className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-1">
                LÒ RÈN CƯỜNG HÓA GUNNY
              </div>
              <p className="text-xs text-slate-400 mb-6">
                Cường hóa tăng sức mạnh toàn diện cho trang bị. Tối đa cấp +12 thần thánh!
              </p>

              {/* Forge item slot */}
              <div className="flex flex-col items-center justify-center mb-6">
                {enhanceTarget ? (
                  <div className="relative p-6 bg-slate-900 border-2 border-amber-400 rounded-2xl shadow-xl shadow-amber-500/20 animate-pulse">
                    <span className="text-6xl">{enhanceTarget.icon}</span>
                    <div className="mt-3 font-bold text-amber-300 text-base">
                      {enhanceTarget.name}{' '}
                      <span className="text-yellow-300 font-extrabold text-lg">
                        +{enhanceTarget.level}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {enhanceTarget.description}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-slate-700 rounded-2xl text-slate-500 text-sm">
                    Chọn một món đồ từ túi hoặc trang bị để cường hóa
                  </div>
                )}
              </div>

              {enhanceTarget && (
              <div className="grid grid-cols-3 gap-3 mb-4 items-stretch">
              {/* Item stats: current vs after upgrade */}
                <div className="col-span-2 bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-left">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="font-bold text-amber-400 uppercase tracking-wider">
                      Chỉ số món đồ
                    </span>
                    <span className="text-slate-500">+8% chỉ số gốc mỗi cấp</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 text-xs items-center">
                    <span className="text-slate-500">Chỉ số</span>
                    <span className="text-slate-500 text-right">Gốc</span>
                    <span className="text-slate-500 text-right">Hiện tại (+{enhanceTarget.level})</span>
                    <span className="text-slate-500 text-right">
                      {enhanceTarget.level >= 12 ? 'Tối đa' : `Sau (+${enhanceTarget.level + 1})`}
                    </span>
                    {ITEM_STAT_ROWS.map((row) => {
                      const base = enhanceTarget.stats[row.key] || 0;
                      if (!base) return null;
                      const scales = row.key !== 'dig';
                      const cur = scales
                        ? Math.round(base * (1 + enhanceTarget.level * 0.08))
                        : base;
                      const next =
                        scales && enhanceTarget.level < 12
                          ? Math.round(base * (1 + (enhanceTarget.level + 1) * 0.08))
                          : cur;
                      return (
                        <React.Fragment key={row.key}>
                          <span className="text-slate-300">{row.label}</span>
                          <span className="text-slate-400 text-right">{base}</span>
                          <span className="text-amber-300 font-bold text-right">{cur}</span>
                          <span
                            className={`font-bold text-right ${
                              next > cur ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          >
                            {next}
                            {next > cur && ` (+${next - cur})`}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  {!ITEM_STAT_ROWS.some((r) => enhanceTarget.stats[r.key]) && (
                    <div className="text-xs text-slate-500 italic mt-2">
                      Món đồ này không có chỉ số cộng thêm.
                    </div>
                  )}
                  {enhanceTarget.stats.dig ? (
                    <div className="text-[10px] text-slate-500 mt-2">
                      * Lực đào đất không tăng theo cường hóa.
                    </div>
                  ) : null}
                </div>

              {/* Enhancement stats & cost */}
                <div className="col-span-1 bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-left space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Cấp cường hóa kế tiếp:</span>
                    <span className="text-amber-400 font-bold">
                      +{enhanceTarget.level} ➔ +{enhanceTarget.level + 1}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Tỉ lệ thành công:</span>
                    <span className="text-emerald-400 font-bold">
                      {ENHANCE_RATES[enhanceTarget.level] || 10}%
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Đá cường hóa:</span>
                    <span
                      className={`font-bold ${
                        profile.enhancementStones >= (enhanceTarget.level + 1) * 3
                          ? 'text-amber-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {(enhanceTarget.level + 1) * 3}/{profile.enhancementStones}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Vàng tiêu hao:</span>
                    <span className="text-yellow-300 font-bold">
                      {((enhanceTarget.level + 1) * 2500).toLocaleString()} Vàng
                    </span>
                  </div>
                </div>
              </div>
              )}

              <button
                disabled={!enhanceTarget || isEnhancing || enhanceTarget.level >= 12}
                onClick={handleEnhance}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isEnhancing ? (
                  <span className="animate-spin">⚙️</span>
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
                <span>
                  {isEnhancing
                    ? 'Đang Cường Hóa...'
                    : (enhanceTarget?.level ?? 0) >= 12
                    ? 'Đã Đạt Cấp Tối Đa (+12)'
                    : 'CƯỜNG HÓA NGAY'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
