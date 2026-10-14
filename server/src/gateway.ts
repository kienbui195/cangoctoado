import { Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { AuthError, AuthService, AuthUser } from './auth';
import { config } from './config';
import { Peer, RoomError, RoomService } from './rooms';
import { TokenBucket } from './rateLimit';

export const originAllowed = (origin: string | undefined) => !origin || config.corsOrigins.includes(origin);

const bool = z.boolean();
const keysSchema = z.object({ left: bool.optional(), right: bool.optional(), up: bool.optional(), down: bool.optional() }).strict();
const releaseSchema = z.object({ angle: z.number().finite(), power: z.number().finite() }).optional();
const num = z.number().finite();

interface SocketData {
  user: AuthUser;
  bucket: TokenBucket;
  peer: Peer;
}

@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  cors: { origin: (o: string | undefined, cb: (e: Error | null, ok: boolean) => void) => cb(null, originAllowed(o)) },
  maxHttpBufferSize: 600_000, // a CSV bank (<= 400k chars) must fit
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private sockets = new Map<number, Socket>();
  private timers: NodeJS.Timeout[] = [];

  constructor(@Inject(AuthService) private auth: AuthService, @Inject(RoomService) public rooms: RoomService) {}

  onModuleInit() {
    this.timers.push(setInterval(() => this.rooms.tick(performance.now()), 16));
    this.timers.push(setInterval(() => this.rooms.sweep(), 1000));
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }

  handleConnection(client: Socket) {
    const user = this.auth.verify(client.handshake.auth?.token);
    if (!user) {
      client.emit('auth:error', { error: 'Cần đăng nhập.' });
      client.disconnect(true);
      return;
    }
    const peer: Peer = {
      id: client.id,
      emit: (event, payload) => client.emit(event, payload),
      disconnect: () => client.disconnect(true),
    };
    (client.data as SocketData) = { user, bucket: new TokenBucket(60, 120), peer };
    // one live connection per user: a newer tab replaces the older one
    const old = this.sockets.get(user.id);
    this.sockets.set(user.id, client);
    this.rooms.attach(user, peer);
    client.emit('hello', { user, online: this.sockets.size });
    this.broadcastOnline();
    if (old && old.id !== client.id) {
      old.emit('session:replaced', { reason: 'Tài khoản này vừa đăng nhập ở nơi khác.' });
      old.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const d = client.data as Partial<SocketData>;
    if (!d.user) return;
    if (this.sockets.get(d.user.id) === client) {
      this.sockets.delete(d.user.id);
      this.broadcastOnline();
    }
    this.rooms.detach(d.user.id, client.id);
  }

  /** Players online right now (one live connection per logged-in user). */
  private broadcastOnline() {
    this.server?.emit('online', { count: this.sockets.size });
  }

  /** Common wrapper: rate limit, payload validation, error -> ack payload. */
  private run<T>(client: Socket, schema: z.ZodType<T> | null, body: unknown, fn: (user: AuthUser, data: T) => unknown) {
    const reply = (r: unknown) => r; // Nest hands the returned value to the client's ack callback
    const d = client.data as Partial<SocketData>;
    if (!d.user || !d.bucket) return reply({ ok: false, error: 'Cần đăng nhập.' });
    if (!d.bucket.take()) return reply({ ok: false, error: 'Thao tác quá nhanh.' });
    let data = undefined as T;
    if (schema) {
      const p = schema.safeParse(body);
      if (!p.success) return reply({ ok: false, error: 'Dữ liệu không hợp lệ.' });
      data = p.data;
    }
    try {
      const out = fn(d.user, data);
      return reply(out && typeof out === 'object' && 'ok' in (out as object) ? out : { ok: true, ...(out as object | undefined) });
    } catch (e) {
      if (e instanceof RoomError || e instanceof AuthError) return reply({ ok: false, error: e.message });
      else {
        console.error('socket handler error', e);
        return reply({ ok: false, error: 'Lỗi máy chủ.' });
      }
    }
  }

  @SubscribeMessage('room:create')
  create(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ mode: z.string().max(8).optional() }).optional(), b, (u, d) => ({ code: this.rooms.create(u, (c.data as SocketData).peer, Date.now(), d?.mode ?? '1v1').code }));
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ code: z.string().min(1).max(12) }), b, (u, d) => ({ code: this.rooms.join(u, (c.data as SocketData).peer, d.code).code }));
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, null, b, (u) => this.rooms.leave(u.id));
  }

  @SubscribeMessage('room:csv')
  csv(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ text: z.string().max(400_000) }), b, (u, d) => this.rooms.setCsv(u.id, d.text));
  }

  @SubscribeMessage('room:csv-reset')
  csvReset(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, null, b, (u) => this.rooms.resetCsv(u.id));
  }

  @SubscribeMessage('room:start')
  start(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, null, b, (u) => this.rooms.start(u.id, performance.now()));
  }

  @SubscribeMessage('game:vote')
  vote(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ again: bool }), b, (u, d) => this.rooms.vote(u.id, d.again, performance.now()));
  }

  @SubscribeMessage('in:keys')
  keys(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, keysSchema, b, (u, d) => this.rooms.input(u.id, d));
  }

  @SubscribeMessage('in:charge')
  charge(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ action: z.enum(['start', 'release']), claim: releaseSchema }), b, (u, d) => this.rooms.charge(u.id, d.action, d.claim));
  }

  @SubscribeMessage('in:select')
  select(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ x: num, y: num }), b, (u, d) => this.rooms.select(u.id, d.x, d.y));
  }

  @SubscribeMessage('quiz:answer')
  answer(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ choice: z.number().int().min(0).max(3) }), b, (u, d) => this.rooms.answer(u.id, d.choice));
  }

  @SubscribeMessage('arr:upgrade')
  upgrade(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ uid: z.string().max(64) }), b, (u, d) => this.rooms.upgrade(u.id, d.uid));
  }

  @SubscribeMessage('arr:move')
  move(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ from: z.number().int(), to: z.number().int() }), b, (u, d) => this.rooms.move(u.id, d.from, d.to));
  }

  @SubscribeMessage('arr:suggest')
  suggest(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, null, b, (u) => this.rooms.suggest(u.id));
  }

  @SubscribeMessage('arr:ready')
  ready(@ConnectedSocket() c: Socket, @MessageBody() b: unknown) {
    return this.run(c, z.object({ on: bool }), b, (u, d) => this.rooms.ready(u.id, d.on));
  }
}
