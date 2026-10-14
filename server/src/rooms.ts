// Rooms: pure game-server logic with no Nest / socket dependency (a Peer is anything that can emit), so it is unit-testable.
import { randomInt } from 'node:crypto';
import { RoyaleEngine, SeatInput, Seat, teamOf } from '../../src/game/royaleEngine';
import { isRoomMode, ROOM_MODES, RoomMode } from '../../src/game/roomModes';
import { baseProfile } from '../../src/game/baseProfile';
import { askFromBank, bankStats, DEFAULT_BANK, Difficulty, Question } from '../../src/data/questions';
import { parseQuestionCsv } from '../../src/utils/questionCsv';
import type { AuthUser } from './auth';
import { config } from './config';

export interface Peer {
  id: string;
  emit(event: string, payload: unknown): void;
  disconnect(): void;
}

export class RoomError extends Error {}

export type RoomStatus = 'waiting' | 'playing' | 'result';

interface Member {
  user: AuthUser;
  seat: Seat;
  peer: Peer | null;
  disconnectedAt: number | null;
  vote: boolean | null; // rematch vote
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const SNAPSHOT_MS = 1000 / 30;
const MAX_CSV_CHARS = 400_000;
const MAX_QUESTIONS = 3000;

export class Room {
  status: RoomStatus = 'waiting';
  members: Member[] = [];
  hostId: number;
  bank: Question[] | null = null; // null = default bank
  engine: RoyaleEngine | null = null;
  aloneSince: number;
  lastTick = 0;
  lastSnap = 0;
  notice: string | null = null;
  /** seats = people needed to start (1v1 = 2, 2v2 = 4 ...) */
  readonly seats: number;

  constructor(public code: string, host: AuthUser, peer: Peer, now: number, public mode: RoomMode = '1v1') {
    this.seats = ROOM_MODES[mode].seats;
    this.hostId = host.id;
    this.members.push({ user: host, seat: 0, peer, disconnectedAt: null, vote: null });
    this.aloneSince = now;
  }

  member(userId: number) {
    return this.members.find((m) => m.user.id === userId);
  }

  get connectedCount() {
    return this.members.filter((m) => m.peer).length;
  }

  /** First empty seat (0..seats-1): even seats are team A, odd seats team B; the host starts on seat 0. */
  freeSeat(): Seat | null {
    for (let s = 0; s < this.seats; s++) if (!this.members.some((m) => m.seat === s)) return s;
    return null;
  }

  view() {
    const bank = this.bank ?? DEFAULT_BANK;
    return {
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      notice: this.notice,
      mode: this.mode,
      seats: this.seats,
      players: this.members.map((m) => ({
        id: m.user.id,
        username: m.user.username,
        displayName: m.user.displayName,
        seat: m.seat,
        team: teamOf(m.seat),
        connected: !!m.peer,
        vote: m.vote,
      })),
      bank: { custom: !!this.bank, ...bankStats(bank) },
    };
  }

  broadcast(event: string, payload: unknown) {
    for (const m of this.members) m.peer?.emit(event, payload);
  }

  sendUpdate() {
    this.broadcast('room:update', this.view());
  }
}

export class RoomService {
  rooms = new Map<string, Room>();
  private byUser = new Map<number, Room>();

  roomOf(userId: number) {
    return this.byUser.get(userId) ?? null;
  }

  private newCode(): string {
    for (let i = 0; i < 50; i++) {
      let c = '';
      for (let k = 0; k < 5; k++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new RoomError('Không tạo được mã phòng, thử lại.');
  }

  create(user: AuthUser, peer: Peer, now = Date.now(), mode: unknown = '1v1'): Room {
    if (this.byUser.has(user.id)) throw new RoomError('Bạn đang ở trong một phòng. Hãy thoát phòng đó trước.');
    if (!isRoomMode(mode)) throw new RoomError('Loại phòng không hợp lệ.');
    if (!ROOM_MODES[mode].enabled) throw new RoomError(`Phòng ${mode} sắp có, hiện chưa chơi được.`);
    const room = new Room(this.newCode(), user, peer, now, mode);
    this.rooms.set(room.code, room);
    this.byUser.set(user.id, room);
    room.sendUpdate();
    return room;
  }

  join(user: AuthUser, peer: Peer, codeRaw: string, now = Date.now()): Room {
    if (this.byUser.has(user.id)) throw new RoomError('Bạn đang ở trong một phòng. Hãy thoát phòng đó trước.');
    const room = this.rooms.get(String(codeRaw).trim().toUpperCase());
    if (!room) throw new RoomError('Không tìm thấy phòng với mã này.');
    if (room.status !== 'waiting') throw new RoomError('Phòng này đang trong ván chơi.');
    const seat = room.freeSeat();
    if (seat === null) throw new RoomError(`Phòng đã đủ ${room.seats} người.`);
    room.members.push({ user, seat, peer, disconnectedAt: null, vote: null });
    this.byUser.set(user.id, room);
    if (room.connectedCount >= 2) room.aloneSince = Infinity;
    room.notice = null;
    room.sendUpdate();
    return room;
  }

  /** A (re)connected socket of a user who may already sit in a room. */
  attach(user: AuthUser, peer: Peer, now = Date.now()) {
    const room = this.byUser.get(user.id);
    const m = room?.member(user.id);
    if (!room || !m) return;
    m.peer = peer;
    m.disconnectedAt = null;
    const pl = room.engine?.players[m.seat];
    if (pl) pl.away = false;
    this.refreshAlone(room, now);
    room.sendUpdate();
    if (room.engine && room.status !== 'waiting') {
      peer.emit('game:start', this.startPayload(room, m));
      peer.emit('game:state', { s: room.engine.snapshot(m.seat), fx: [] });
    }
  }

  detach(userId: number, peerId: string, now = Date.now()) {
    const room = this.byUser.get(userId);
    const m = room?.member(userId);
    if (!room || !m || !m.peer || m.peer.id !== peerId) return; // an older socket of the same user
    m.peer = null;
    m.disconnectedAt = now;
    const pl = room.engine?.players[m.seat];
    if (pl) {
      pl.away = true;
      pl.charging = false;
      pl.charge = 0;
      room.engine!.clearInput(m.seat);
    }
    this.refreshAlone(room, now);
    room.sendUpdate();
  }

  private refreshAlone(room: Room, now: number) {
    if (room.connectedCount >= 2) room.aloneSince = Infinity;
    else if (room.aloneSince === Infinity) room.aloneSince = now;
  }

  /** Leave on purpose. Leaving a running match loses it. */
  leave(userId: number, now = Date.now(), why?: { toSelf: string; notice: string }) {
    const room = this.byUser.get(userId);
    const m = room?.member(userId);
    if (!room || !m) return;
    if (room.status === 'playing' && room.engine) {
      // only this seat drops out; the match ends at once when nobody of its team is left (1v1: the other one wins)
      room.engine.forfeit(m.seat);
      this.pushState(room, now);
      if (room.engine.phase === 'result') this.afterResult(room);
    }
    this.byUser.delete(userId);
    room.members = room.members.filter((x) => x !== m);
    m.peer?.emit('room:left', { reason: why?.toSelf ?? 'Bạn đã thoát phòng.' });
    if (room.members.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    room.hostId = room.members[0].user.id;
    room.notice = why?.notice ?? `${m.user.displayName} đã thoát phòng.`;
    if (room.status === 'result') {
      // rematch vote in progress: the votes already cast stay. Somebody is missing now, so a match cannot start;
      // when everybody who is left has agreed, the room goes back to waiting
      const here = room.members.filter((x) => x.peer);
      if (here.length > 0 && here.every((x) => x.vote === true)) {
        room.status = 'waiting';
        room.engine = null;
        room.members.forEach((x) => (x.vote = null));
      }
    } else room.members.forEach((x) => (x.vote = null));
    this.refreshAlone(room, now);
    room.sendUpdate();
  }

  private close(room: Room, reason: string) {
    for (const m of room.members) {
      this.byUser.delete(m.user.id);
      m.peer?.emit('room:closed', { reason });
      // the player stays connected: the client just falls back to the lobby
    }
    this.rooms.delete(room.code);
  }

  // ---------------------------------------------------------------- lobby commands
  private hostRoom(userId: number): Room {
    const room = this.byUser.get(userId);
    if (!room) throw new RoomError('Bạn chưa ở trong phòng nào.');
    if (room.hostId !== userId) throw new RoomError('Chỉ chủ phòng mới làm được việc này.');
    return room;
  }

  setCsv(userId: number, text: unknown): { ok: true; counts: Record<Difficulty, number> } | { ok: false; errors: string[] } {
    const room = this.hostRoom(userId);
    if (room.status === 'playing') throw new RoomError('Không đổi bộ câu hỏi khi đang chơi.');
    if (typeof text !== 'string' || text.length === 0) return { ok: false, errors: ['File trống.'] };
    if (text.length > MAX_CSV_CHARS) return { ok: false, errors: ['File quá lớn (tối đa 400.000 ký tự).'] };
    const { questions, errors } = parseQuestionCsv(text);
    if (questions.length > MAX_QUESTIONS) errors.push(`Tối đa ${MAX_QUESTIONS} câu hỏi.`);
    if (errors.length > 0) return { ok: false, errors: errors.slice(0, 20) };
    room.bank = questions;
    room.sendUpdate();
    return { ok: true, counts: bankStats(questions) };
  }

  resetCsv(userId: number) {
    const room = this.hostRoom(userId);
    if (room.status === 'playing') throw new RoomError('Không đổi bộ câu hỏi khi đang chơi.');
    room.bank = null;
    room.sendUpdate();
  }

  start(userId: number, now = Date.now()) {
    const room = this.hostRoom(userId);
    if (room.status !== 'waiting') throw new RoomError('Ván chơi đã bắt đầu.');
    if (room.members.length < room.seats) throw new RoomError(`Phòng ${room.mode} cần đủ ${room.seats} người mới bắt đầu được (đang có ${room.members.length}).`);
    if (room.connectedCount < room.seats) throw new RoomError('Có người chơi đang mất kết nối.');
    this.startGame(room, now);
  }

  private startGame(room: Room, now: number) {
    const ordered = [...room.members].sort((x, y) => x.seat - y.seat);
    if (ordered.length !== room.seats || ordered.some((m, i) => m.seat !== i)) throw new RoomError('Phòng chưa đủ người.');
    const bank = room.bank ?? DEFAULT_BANK;
    // two people with the same display name would be indistinguishable on screen: show their usernames instead
    const nameOf = (m: Member) => (ordered.filter((o) => o.user.displayName === m.user.displayName).length > 1 ? m.user.username : m.user.displayName);
    room.engine = new RoyaleEngine(
      ordered.map((m) => baseProfile(nameOf(m))),
      { bots: ordered.map(() => false), emitFx: true, ask: (d, used) => askFromBank(bank, d, used) }
    );
    room.status = 'playing';
    room.notice = null;
    room.members.forEach((m) => (m.vote = null));
    room.lastTick = now;
    room.lastSnap = 0;
    for (const m of room.members) m.peer?.emit('game:start', this.startPayload(room, m));
    room.sendUpdate();
    this.pushState(room, now);
  }

  private startPayload(room: Room, m: Member) {
    const e = room.engine!;
    return { seat: m.seat, names: e.players.map((p) => p.name), room: room.view() };
  }

  /** After the match: each player votes to play again or leaves. Everyone in -> new match in the same room. */
  vote(userId: number, again: boolean, now = Date.now()) {
    const room = this.byUser.get(userId);
    const m = room?.member(userId);
    if (!room || !m) throw new RoomError('Bạn chưa ở trong phòng nào.');
    if (room.status !== 'result') throw new RoomError('Chưa đến lúc bỏ phiếu.');
    if (!again) {
      this.leave(userId); // wall clock: `now` here is the game's monotonic clock and must not feed the alone-TTL
      return;
    }
    m.vote = true;
    // everybody still connected must agree. Full and connected -> a new match; somebody missing -> back to the waiting room
    if (room.members.filter((x) => x.peer).every((x) => x.vote === true)) {
      if (room.members.length === room.seats && room.connectedCount === room.seats) this.startGame(room, now);
      else {
        room.status = 'waiting';
        room.engine = null;
        room.members.forEach((x) => (x.vote = null));
        room.sendUpdate();
      }
    } else room.sendUpdate();
  }

  // ---------------------------------------------------------------- in-game commands (ignored unless a match is running)
  private seatOf(userId: number): { room: Room; engine: RoyaleEngine; seat: Seat } | null {
    const room = this.byUser.get(userId);
    const m = room?.member(userId);
    if (!room || !m || room.status !== 'playing' || !room.engine) return null;
    return { room, engine: room.engine, seat: m.seat };
  }

  input(userId: number, keys: Partial<SeatInput>) {
    const s = this.seatOf(userId);
    if (!s) return;
    const clean: Partial<SeatInput> = {};
    for (const k of ['left', 'right', 'up', 'down'] as const) if (typeof keys[k] === 'boolean') clean[k] = keys[k];
    s.engine.setInput(s.seat, clean);
  }

  charge(userId: number, action: 'start' | 'release', claim?: { angle: number; power: number }) {
    const s = this.seatOf(userId);
    if (!s) return;
    if (action === 'start') s.engine.startCharge(s.seat);
    else s.engine.releaseCharge(s.seat, claim);
  }

  select(userId: number, x: number, y: number) {
    const s = this.seatOf(userId);
    if (s) s.engine.selectBoxAt(s.seat, x, y);
  }

  answer(userId: number, choice: number) {
    const s = this.seatOf(userId);
    if (s) s.engine.answerQuiz(s.seat, choice);
  }

  upgrade(userId: number, uid: string) {
    const s = this.seatOf(userId);
    if (s && typeof uid === 'string') s.engine.startUpgrade(s.seat, uid);
  }

  move(userId: number, from: number, to: number) {
    const s = this.seatOf(userId);
    if (s) s.engine.moveLineup(s.seat, from, to);
  }

  suggest(userId: number) {
    const s = this.seatOf(userId);
    if (s) s.engine.suggestLineup(s.seat);
  }

  ready(userId: number, on: boolean) {
    const s = this.seatOf(userId);
    if (!s) return;
    if (on) s.engine.setReady(s.seat);
    else s.engine.cancelReady(s.seat);
  }

  // ---------------------------------------------------------------- loop
  /** Advance every running match and send snapshots (~30 Hz). `now` is a monotonic ms clock. */
  tick(now: number) {
    for (const room of this.rooms.values()) {
      const e = room.engine;
      if (room.status !== 'playing' || !e) continue;
      const dt = now - room.lastTick;
      room.lastTick = now;
      const wall = Date.now();
      for (const m of room.members) {
        if (m.disconnectedAt !== null && wall - m.disconnectedAt >= config.awayForfeitMs && e.phase !== 'result' && !e.players[m.seat]?.out) {
          e.forfeit(m.seat); // only this seat is out; its team plays on while somebody is left
          room.notice = `${m.user.displayName} mất kết nối quá ${Math.round(config.awayForfeitMs / 1000)} giây nên ${room.seats > 2 ? 'bị loại khỏi ván' : 'bị xử thua'}.`;
          room.sendUpdate();
        }
      }
      const steps = Math.max(1, Math.round(config.gameSpeed));

      for (let i = 0; i < steps; i++) e.update(dt);
      // players who broke the fire-key rule twice lose and are removed from the room
      for (const seat of e.drainKicks()) {
        const m = room.members.find((x) => x.seat === seat);
        if (m) {
          this.leave(m.user.id, wall, {
            toSelf: 'Bạn bị xử thua và mời ra khỏi phòng vì giữ phím bắn quá 20 giây (vi phạm 2 lần).',
            notice: `${m.user.displayName} bị xử thua và mời ra khỏi phòng vì giữ phím bắn quá 20 giây (vi phạm 2 lần).`,
          });
        }
      }
      if (!this.rooms.has(room.code)) continue;
      const force = e.phase === 'result';
      if (force || now - room.lastSnap >= SNAPSHOT_MS) this.pushState(room, now);
      if (force) this.afterResult(room);
    }
  }

  private pushState(room: Room, now: number) {
    const e = room.engine;
    if (!e) return;
    room.lastSnap = now;
    const fx = e.drainEvents();
    for (const m of room.members) m.peer?.emit('game:state', { s: e.snapshot(m.seat), fx });
  }

  private afterResult(room: Room) {
    if (room.status === 'result') return;
    room.status = 'result';
    room.members.forEach((m) => (m.vote = null));
    room.sendUpdate();
  }

  /** Rooms with fewer than 2 connected people for too long are deleted; their players are sent back to the lobby (the connection stays open). */
  sweep(now = Date.now()) {
    for (const room of [...this.rooms.values()]) {
      if (room.aloneSince !== Infinity && now - room.aloneSince >= config.aloneTtlMs) {
        this.close(room, `Phòng chỉ còn một người quá ${Math.round(config.aloneTtlMs / 60000)} phút nên đã bị xóa.`);
      }
    }
  }
}
