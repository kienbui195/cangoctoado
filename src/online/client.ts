// Online client: auth (REST), one Socket.IO connection, the room view and the replica engine of the running match.
import { io, Socket } from 'socket.io-client';
import { RoyaleEngine, Seat, SeatInput, Snapshot, FxEvent, Team } from '../game/royaleEngine';
import type { RoomMode } from '../game/roomModes';
import { baseProfile } from '../game/baseProfile';
import type { GameIO } from '../game/gameIO';

export interface OnlineUser {
  id: number;
  username: string;
  displayName: string;
}

export interface RoomPlayer {
  id: number;
  username: string;
  displayName: string;
  seat: Seat;
  team: Team;
  connected: boolean;
  vote: boolean | null;
}

export interface RoomView {
  code: string;
  status: 'waiting' | 'playing' | 'result';
  hostId: number;
  notice: string | null;
  mode: RoomMode;
  /** people needed to start */
  seats: number;
  players: RoomPlayer[];
  bank: { custom: boolean; easy: number; medium: number; hard: number };
}

export type Conn = 'off' | 'connecting' | 'online' | 'lost';

const TOKEN_KEY = 'cangoctoado_token_v1';
const USER_KEY = 'cangoctoado_user_v1';

export const savedSession = (): { token: string; user: OnlineUser } | null => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    return token && user ? { token, user } : null;
  } catch {
    return null;
  }
};

const saveSession = (token: string, user: OnlineUser) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* private mode: stays logged in for this tab only */
  }
};

export const clearSession = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
};

async function post(path: string, body: unknown): Promise<{ user: OnlineUser; token: string }> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.message === 'string' ? data.message : 'Có lỗi xảy ra, thử lại nhé.');
  return data;
}

export const registerAccount = async (displayName: string, password: string) => {
  const r = await post('/api/auth/register', { displayName, password });
  saveSession(r.token, r.user);
  return r;
};

export const loginAccount = async (username: string, password: string) => {
  const r = await post('/api/auth/login', { username, password });
  saveSession(r.token, r.user);
  return r;
};

type Ack = { ok: boolean; error?: string; [k: string]: unknown };

/** Everything the online screens need; React reads it through subscribe() (same pattern as the engine). */
export class OnlineClient {
  conn: Conn = 'off';
  /** players online across the whole server */
  online = 0;
  room: RoomView | null = null;
  engine: RoyaleEngine | null = null;
  engineKey = 0;
  mySeat: Seat = 0;
  /** set when the server ended our room / session; shown once on the lobby */
  message: string | null = null;
  private socket: Socket | null = null;
  private listeners = new Set<() => void>();
  private keys: SeatInput = { left: false, right: false, up: false, down: false };

  constructor(public user: OnlineUser, private token: string) {}

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  connect() {
    if (this.socket) return;
    this.conn = 'connecting';
    const s = io({ auth: { token: this.token }, transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 4000 });
    this.socket = s;
    s.on('hello', (p: { online?: number }) => {
      if (typeof p.online === 'number') this.online = p.online;
    });
    s.on('connect', () => {
      this.conn = 'online';
      this.emit();
    });
    s.on('disconnect', (reason) => {
      // a kick from the server (not a replaced session) is not final: reconnect and fall back to the lobby
      if (reason === 'io server disconnect' && this.socket === s && !this.ended) s.connect();
      this.conn = reason === 'io client disconnect' ? 'off' : 'lost';
      this.emit();
    });
    s.on('connect_error', () => {
      this.conn = 'lost';
      this.emit();
    });
    s.on('auth:error', () => this.endSession('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.'));
    s.on('session:replaced', (p: { reason: string }) => this.endSession(p.reason));
    s.on('online', (p: { count: number }) => {
      this.online = p.count;
      this.emit();
    });
    s.on('room:update', (v: RoomView) => {
      this.room = v;
      this.emit();
    });
    s.on('room:left', (p: { reason?: string }) => this.leftRoom(p?.reason && !/đã thoát phòng/.test(p.reason) ? p.reason : null));
    s.on('room:closed', (p: { reason: string }) => this.leftRoom(p.reason));
    s.on('game:start', (p: { seat: Seat; names: string[] }) => {
      const e = new RoyaleEngine(p.names.map(baseProfile), { bots: p.names.map(() => false) });
      e.replica = true;
      e.mySeat = p.seat;
      this.mySeat = p.seat;
      this.engine = e;
      this.engineKey++;
      this.keys = { left: false, right: false, up: false, down: false };
      this.emit();
    });
    s.on('game:state', (p: { s: Snapshot; fx: FxEvent[] }) => {
      const e = this.engine;
      if (!e) return;
      e.applySnapshot(p.s, this.mySeat);
      for (const ev of p.fx) e.applyFx(ev);
    });
  }

  private leftRoom(reason: string | null) {
    this.room = null;
    this.engine = null;
    if (reason) this.message = reason;
    this.emit();
  }

  private ended = false;

  private endSession(reason: string) {
    this.ended = true;
    this.message = reason;
    clearSession();
    this.close();
    this.conn = 'off';
    this.emit();
  }

  close() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  dismissMessage() {
    this.message = null;
    this.emit();
  }

  private call(event: string, payload?: unknown): Promise<Ack> {
    return new Promise((resolve) => {
      const s = this.socket;
      if (!s || !s.connected) return resolve({ ok: false, error: 'Đang mất kết nối với máy chủ...' });
      s.timeout(8000).emit(event, payload ?? {}, (err: Error | null, res: Ack) => resolve(err ? { ok: false, error: 'Máy chủ không phản hồi.' } : res));
    });
  }

  private fire(event: string, payload?: unknown) {
    if (this.socket?.connected) this.socket.emit(event, payload ?? {});
  }

  createRoom(mode: RoomMode = '1v1') {
    return this.call('room:create', { mode });
  }
  joinRoom(code: string) {
    return this.call('room:join', { code });
  }
  leaveRoom() {
    return this.call('room:leave');
  }
  startGame() {
    return this.call('room:start');
  }
  importCsv(text: string) {
    return this.call('room:csv', { text });
  }
  resetCsv() {
    return this.call('room:csv-reset');
  }
  vote(again: boolean) {
    return this.call('game:vote', { again });
  }

  /** In-game intents (fire-and-forget; the server ignores whatever does not apply right now). */
  gameIO(): GameIO {
    const me = () => this.engine?.players[this.mySeat];
    return {
      setInput: (inp) => {
        const next = { ...this.keys, ...inp };
        if ((Object.keys(next) as (keyof SeatInput)[]).every((k) => next[k] === this.keys[k])) return;
        this.keys = next;
        this.engine?.setInput(this.mySeat, inp); // predicted locally too
        this.fire('in:keys', inp);
      },
      releaseAll: () => {
        this.keys = { left: false, right: false, up: false, down: false };
        this.engine?.clearInput(this.mySeat);
        this.fire('in:keys', this.keys);
        this.release();
      },
      startCharge: () => {
        const e = this.engine;
        const p = me();
        if (e && p && !p.charging && e.canAim(this.mySeat)) {
          p.charging = true; // optimistic: the bar starts at once, the server confirms
          p.charge = 0;
          p.chargeDir = 1;
          e.localChargeSince = e.time;
          e.localReleaseUntil = 0;
        }
        this.fire('in:charge', { action: 'start' });
      },
      releaseCharge: () => this.release(),
      selectBoxAt: (x, y) => this.fire('in:select', { x, y }),
      answerQuiz: (choice) => this.fire('quiz:answer', { choice }),
      startUpgrade: (uid) => this.fire('arr:upgrade', { uid }),
      moveLineup: (from, to) => this.fire('arr:move', { from, to }),
      suggestLineup: () => this.fire('arr:suggest'),
      setReady: () => this.fire('arr:ready', { on: true }),
      cancelReady: () => this.fire('arr:ready', { on: false }),
    };
  }

  private release() {
    const p = this.engine?.players[this.mySeat];
    if (!p || !p.charging) return;
    // the client sends what it saw on its own ruler; latency would otherwise shift both values
    this.fire('in:charge', { action: 'release', claim: { angle: p.angle, power: Math.max(8, Math.min(100, p.charge)) } });
    p.charging = false;
    p.charge = 0;
    if (this.engine) {
      this.engine.localChargeSince = null;
      this.engine.localReleaseUntil = this.engine.time + 1200; // the server still reports "charging" until it gets the release
    }
  }
}
