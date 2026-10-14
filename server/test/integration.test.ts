// Two real Socket.IO clients play through a whole match against the real Nest app (no database needed: tokens are signed directly).
// The match runs at GAME_SPEED so the 5-minute collection phase takes seconds.
import './env';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import * as jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main';
import { GameGateway } from '../src/gateway';
import { config } from '../src/config';

let app: INestApplication;
let url = '';
let gateway: GameGateway;
const sockets: Socket[] = [];

const tokenOf = (id: number, name: string) => jwt.sign({ sub: String(id), un: `${name.toLowerCase()}-0001`, dn: name }, process.env.JWT_SECRET!, { expiresIn: '1h' });

before(async () => {
  const made = await createApp({ pool: { query: async () => [[]] } as any, migrate: false });
  app = made.app;
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  url = url.replace('[::1]', '127.0.0.1');
  gateway = app.get(GameGateway);
});

after(async () => {
  sockets.forEach((s) => s.close());
  await app.close();
});

interface Client {
  s: Socket;
  state: any;
  starts: any[];
  rooms: any[];
  events: string[];
  fx: any[];
}

function connect(id: number, name: string, token = tokenOf(id, name)): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    const c: Client = { s, state: null, starts: [], rooms: [], events: [], fx: [] };
    s.on('game:state', (p) => {
      c.state = p.s;
      for (const f of p.fx ?? []) c.fx.push(f);
    });
    s.on('game:start', (p) => c.starts.push(p));
    s.on('room:update', (v) => c.rooms.push(v));
    for (const ev of ['room:left', 'room:closed', 'auth:error', 'session:replaced']) s.on(ev, () => c.events.push(ev));
    s.on('hello', () => resolve(c));
    s.on('auth:error', () => resolve(c));
    s.on('connect_error', reject);
  });
}

const call = (c: Client, ev: string, data?: unknown): Promise<any> => new Promise((res) => c.s.emit(ev, data ?? {}, res));
const until = async (fn: () => boolean, ms = 30_000, what = 'condition') => {
  if (process.env.TRACE) require('node:fs').appendFileSync('/tmp/claude-1000/-home-kensnows-Learning-gunny-web-gunny-web-classic/5c251ebb-c701-4016-9751-0ba9102de78e/scratchpad/trace.log', 'waiting for ' + what + '\n');
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

test('AC2: no / bad token cannot do anything', async () => {
  const bad = await connect(9, 'Bad', 'not-a-token');
  assert.ok(bad.events.includes('auth:error'));
  await until(() => !bad.s.connected, 3000, 'disconnect');
  const none = await connect(9, 'Bad', '');
  assert.ok(none.events.includes('auth:error'));
});

test('two players: create/join/start, play to the end, compare stats, vote, leave', async () => {
  const a = await connect(1, 'An');
  const b = await connect(2, 'Binh');
  const c = await connect(3, 'Cuong');

  const created = await call(a, 'room:create');
  assert.equal(created.ok, true);
  const code = created.code as string;
  assert.match(code, /^[A-Z2-9]{5}$/);
  assert.equal((await call(a, 'room:create')).ok, false, 'already in a room');
  assert.equal((await call(b, 'room:join', { code: 'NOPE1' })).ok, false);
  assert.equal((await call(b, 'room:join', { code: code.toLowerCase() })).ok, true);
  assert.equal((await call(c, 'room:join', { code })).ok, false, 'third player refused (AC3)');
  assert.equal((await call(b, 'room:start')).ok, false, 'guest cannot start (AC4)');

  // host imports a CSV (AC5)
  const csv = 'do_kho,cau_hoi,dap_an_a,dap_an_b,dap_an_c,dap_an_d,dap_an_dung\n1,Một cộng một?,2,3,4,5,A\n2,Hai cộng hai?,3,4,5,6,B\n3,Ba cộng ba?,6,7,8,9,A';
  assert.equal((await call(b, 'room:csv', { text: csv })).ok, false, 'guest cannot import');
  const bad = await call(a, 'room:csv', { text: 'do_kho,cau_hoi\n1,thiếu' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length > 0);
  assert.equal((await call(a, 'room:csv', { text: csv })).ok, true);

  assert.equal((await call(a, 'room:start')).ok, true);
  await until(() => a.starts.length === 1 && b.starts.length === 1 && !!a.state && !!b.state, 5000, 'game start');
  assert.deepEqual([a.starts[0].seat, b.starts[0].seat], [0, 1]);

  // AC6: A opens a question; only A is frozen, B keeps moving, B only sees "answering"
  const room = gateway.rooms.roomOf(1)!;
  const eng = room.engine!;
  await until(() => a.state.phase === 'collect', 10_000, 'collect phase');
  const t0 = a.state.time;
  (eng as any).cturn = { seat: 0, step: 'aim', until: eng.time + 15000, box: null };
  (eng as any).hitBox(eng.players[0], eng.boxes[0]);
  await until(() => !!a.state.quiz, 3000, 'quiz for A');
  assert.equal(b.state.quiz, null);
  await until(() => b.state.players[0].status === 'answering', 3000, 'B sees answering');
  assert.ok(!JSON.stringify(a.state.quiz).match(/"correctIndex":[0-3]/), 'no answer in the quiz sent to A');
  assert.match(a.state.quiz.question.text, /cộng/);
  const xb = eng.players[1].x;
  b.s.emit('in:keys', { left: true });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(eng.players[1].x, xb, 'turn-based: B cannot move during A\'s turn');
  b.s.emit('in:keys', { left: false });
  assert.ok(eng.time > t0, 'the clock kept running');
  const right = eng.quizzes[0]!.question.correctIndex;
  assert.equal((await call(a, 'quiz:answer', { choice: right })).ok, true);
  await until(() => a.state.quiz?.result?.correct === true, 3000, 'correct result');
  // AC-09.3: the opponent also sees the cheer emoji above the answering player
  await until(() => ['🎉', '🥳'].includes(b.state.players[0].reaction?.emoji), 3000, 'B sees the cheer emoji');
  assert.equal(b.state.teamLeft.length, 2, 'the team clocks are part of the snapshot (AC-01.13)');
  await until(() => !a.state.quiz, 8000, 'quiz auto-closed');

  // run on: nobody collects more, collection times out, both get ready, battle, result
  await until(() => a.state.phase === 'arrange' && b.state.phase === 'arrange', 60_000, 'arrange');
  assert.equal(b.state.players[0].lineup.length, 0, 'opponent lineup hidden while arranging');
  assert.ok(a.state.players[0].lineup.length >= 1);
  assert.equal((await call(a, 'arr:ready', { on: true })).ok, true);
  assert.equal((await call(b, 'arr:ready', { on: true })).ok, true);
  await until(() => a.state.phase === 'result' && b.state.phase === 'result' && !!a.state.stats, 90_000, 'result');
  assert.deepEqual(a.state.stats, b.state.stats, 'both see the same summary (AC8)');
  assert.equal(a.state.stats[0].opened, 1);
  assert.equal(a.state.stats[0].correct, 1);
  assert.deepEqual(a.state.result, b.state.result);
  // BR11 / AC-06.4 / AC-07.5 / AC-08.5: the whole room hears the same sounds
  const names = (c: Client) => c.fx.filter((f) => f[0] === 's').map((f) => f[1]);
  for (const c of [a, b]) {
    const n = names(c);
    assert.ok(n.includes('boxhit') && n.includes('correct'), 'both players hear the box collision and the cheer');
    assert.ok(n.includes('chargeup') && n.includes('power'), 'both teams hear the charge-up');
  }
  assert.deepEqual(names(a), names(b), 'both clients receive the same sound events');
  await until(() => a.rooms.at(-1)?.status === 'result', 3000, 'room status result');

  // AC9: both vote again -> new match
  assert.equal((await call(a, 'game:vote', { again: true })).ok, true);
  await until(() => a.rooms.at(-1)?.players.find((p: any) => p.id === 1)?.vote === true, 3000, 'vote visible');
  assert.equal((await call(b, 'game:vote', { again: true })).ok, true);
  await until(() => a.starts.length === 2 && b.starts.length === 2, 5000, 'rematch start');
  await until(() => a.state.phase !== 'result' && a.state.phase !== undefined && a.state.time < 5000, 5000, 'fresh match state');

  // B leaves mid-match -> loses, A is told and wins
  assert.equal((await call(b, 'room:leave')).ok, true);
  await until(() => a.state.phase === 'result', 5000, 'A sees result');
  assert.equal(a.state.result.winner, 0);
  assert.equal(a.state.result.reason, 'forfeit');
  assert.match(String(a.rooms.at(-1).notice), /đã thoát phòng/);
  assert.equal(a.rooms.at(-1).players.length, 1);
  assert.equal((await call(a, 'game:vote', { again: true })).ok, true);
  await until(() => a.rooms.at(-1)?.status === 'waiting', 3000, 'back to waiting');
  assert.equal((await call(c, 'room:join', { code })).ok, true, 'a new player can join the freed seat');
  c.s.close();
});

test('a newer connection replaces the older one of the same user; reconnect restores the match', async () => {
  const a1 = await connect(11, 'Dao');
  const b = await connect(12, 'Em');
  const code = (await call(a1, 'room:create')).code;
  await call(b, 'room:join', { code });
  await call(a1, 'room:start');
  await until(() => !!a1.state && !!b.state, 5000, 'state');
  const a2 = await connect(11, 'Dao');
  await until(() => a1.events.includes('session:replaced'), 3000, 'old session replaced');
  await until(() => a2.starts.length === 1 && !!a2.state, 5000, 'new socket resumes the match');
  assert.equal(a2.starts[0].seat, 0);
  assert.equal(gateway.rooms.roomOf(11)!.engine!.players[0].away, false);
  await call(a2, 'room:leave');
});

test('2v2: four sockets play a whole match; 3v3/4v4 refused; a dropped player is knocked out alone; an emptied team loses', async () => {
  const [a, b, c, d, f] = await Promise.all([connect(21, 'Hoa'), connect(22, 'Lan'), connect(23, 'Mai'), connect(24, 'Cuc'), connect(25, 'Dao2')]);
  const all = [a, b, c, d];

  // room types
  assert.equal((await call(f, 'room:create', { mode: '3v3' })).ok, false, '3v3 is not open yet');
  assert.equal((await call(f, 'room:create', { mode: '4v4' })).ok, false, '4v4 is not open yet');
  assert.equal((await call(f, 'room:create', { mode: 'xyz' })).ok, false, 'unknown type refused');
  assert.equal((await call(f, 'room:create', { mode: 7 })).ok, false, 'bad payload refused');
  const created = await call(a, 'room:create', { mode: '2v2' });
  assert.equal(created.ok, true);
  const code = created.code as string;
  assert.equal((await call(b, 'room:join', { code })).ok, true);
  assert.equal((await call(c, 'room:join', { code })).ok, true);
  const early = await call(a, 'room:start');
  assert.equal(early.ok, false, 'start needs 4 people');
  assert.match(early.error, /đủ 4 người/);
  assert.equal((await call(d, 'room:join', { code })).ok, true);
  assert.equal((await call(f, 'room:join', { code })).ok, false, 'a fifth player is refused');
  const lobby = a.rooms.at(-1);
  assert.equal(lobby.mode, '2v2');
  assert.deepEqual(lobby.players.map((p: any) => [p.seat, p.team]), [[0, 0], [1, 1], [2, 0], [3, 1]]);
  assert.equal((await call(b, 'room:start')).ok, false, 'only the host starts');

  assert.equal((await call(a, 'room:start')).ok, true);
  await until(() => all.every((x) => x.starts.length === 1 && !!x.state), 5000, '2v2 start');
  assert.deepEqual(all.map((x) => x.starts[0].seat), [0, 1, 2, 3]);
  assert.equal(a.starts[0].names.length, 4);
  await until(() => a.state.phase === 'collect', 10_000, 'collect');
  const eng = gateway.rooms.roomOf(21)!.engine!;

  // seat 1 (team B) opens a box and answers right: only seat 1 gets the question
  (eng as any).cturn = { seat: 1, step: 'aim', until: eng.time + 15000, box: null };
  (eng as any).hitBox(eng.players[1], eng.boxes[0]);
  await until(() => !!b.state.quiz, 3000, 'quiz for seat 1');
  assert.ok(!a.state.quiz && !c.state.quiz && !d.state.quiz, 'the others get no question');
  assert.ok(!JSON.stringify(b.state.quiz).match(/"correctIndex":[0-3]/));
  assert.equal((await call(b, 'quiz:answer', { choice: eng.quizzes[1]!.question.correctIndex })).ok, true);
  await until(() => b.state.players[1].weapons.length === 1, 3000, 'weapon for seat 1');
  assert.equal(a.state.players[1].weapons.length, 1, 'collected weapons are public');

  // arrange: enemies hidden, teammates visible
  await until(() => all.every((x) => x.state.phase === 'arrange'), 60_000, 'arrange');
  assert.ok(b.state.players[1].lineup.length >= 1);
  assert.equal(a.state.players[1].lineup.length, 0, 'enemy lineup hidden');
  assert.equal(d.state.players[1].lineup.length, b.state.players[1].lineup.length, 'teammate lineup visible');
  assert.equal(c.state.players[3].lineup.length, 0, 'enemy lineup hidden (seat 2 -> seat 3)');
  for (const x of all) assert.equal((await call(x, 'arr:ready', { on: true })).ok, true);
  await until(() => all.every((x) => x.state.phase === 'result' && !!x.state.stats), 120_000, '2v2 result');
  assert.equal(a.state.stats.length, 4);
  for (const x of all) assert.deepEqual(x.state.stats, a.state.stats, 'same summary for everyone');
  assert.deepEqual(a.state.result, d.state.result);
  assert.ok(['ko', 'rounds'].includes(a.state.result.reason));
  assert.equal(a.state.stats[1].opened, 1);
  await until(() => a.rooms.at(-1)?.status === 'result', 3000, 'room result');

  // rematch needs all four
  for (const x of [a, b, c]) assert.equal((await call(x, 'game:vote', { again: true })).ok, true);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(a.starts.length, 1, 'three votes are not enough');
  assert.equal((await call(d, 'game:vote', { again: true })).ok, true);
  await until(() => all.every((x) => x.starts.length === 2), 5000, 'rematch');
  await until(() => a.state.phase !== 'result' && a.state.time < 5000, 5000, 'fresh state');

  // seat 1 loses its connection for good: only it is out
  const saved = config.awayForfeitMs;
  config.awayForfeitMs = 400;
  try {
    const eng2 = gateway.rooms.roomOf(21)!.engine!;
    b.s.close();
    await until(() => eng2.players[1].out, 5000, 'seat 1 knocked out');
    await until(() => a.state.players[1].out === true, 3000, 'others see it');
    assert.notEqual(a.state.phase, 'result', 'the match goes on');
    assert.match(String(a.rooms.at(-1).notice), /bị loại khỏi ván/);
    // seat 3 leaves: team B is empty, team A wins
    assert.equal((await call(d, 'room:leave')).ok, true);
    await until(() => a.state.phase === 'result' && c.state.phase === 'result', 5000, 'result after the team emptied');
    assert.equal(a.state.result.winner, 0);
    assert.equal(a.state.result.reason, 'forfeit');
    // the two left (both team A) agree -> back to the waiting room (not full); the dropped one is still a member
    assert.equal((await call(a, 'game:vote', { again: true })).ok, true);
    assert.equal((await call(c, 'game:vote', { again: true })).ok, true);
    await until(() => a.rooms.at(-1)?.status === 'waiting', 3000, 'waiting room again');
    assert.equal((await call(a, 'room:start')).ok, false, 'not enough people for 2v2');
  } finally {
    config.awayForfeitMs = saved;
  }
  await call(a, 'room:leave');
  await call(c, 'room:leave');
});
