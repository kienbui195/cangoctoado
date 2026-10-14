// Everybody plays with the same base stats in this version (no personal gear yet), on the client and on the server.
import type { EquipmentSlot, Item } from '../types/game';
import { calculateTotalStats } from '../utils/playerStorage';
import type { EngineProfile } from './royaleEngine';

const NO_GEAR = Object.fromEntries(
  ['weapon', 'subWeapon', 'hat', 'armor', 'gloves', 'ring1', 'ring2', 'bracelet1', 'bracelet2', 'pet'].map((k) => [k, null])
) as Record<EquipmentSlot, Item | null>;

export const baseProfile = (name: string): EngineProfile => ({ name, stats: calculateTotalStats(NO_GEAR) });
