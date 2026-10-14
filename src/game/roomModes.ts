// Room types shared by the server (rooms.ts) and the client (create-room screen, waiting room).
// A room has `perTeam` seats per team; seat i belongs to team i % 2 (A = even seats, B = odd seats).
export type RoomMode = '1v1' | '2v2' | '3v3' | '4v4';

export interface RoomModeInfo {
  perTeam: number;
  /** total seats = people needed to start */
  seats: number;
  /** false = shown on the create screen as "sắp có" and refused by the server */
  enabled: boolean;
}

export const ROOM_MODES: Record<RoomMode, RoomModeInfo> = {
  '1v1': { perTeam: 1, seats: 2, enabled: true },
  '2v2': { perTeam: 2, seats: 4, enabled: true },
  '3v3': { perTeam: 3, seats: 6, enabled: false },
  '4v4': { perTeam: 4, seats: 8, enabled: false },
};

export const ROOM_MODE_LIST = Object.keys(ROOM_MODES) as RoomMode[];

export const isRoomMode = (v: unknown): v is RoomMode => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ROOM_MODES, v);
