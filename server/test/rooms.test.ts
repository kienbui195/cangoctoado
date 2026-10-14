import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomService, RoomError, Peer } from '../src/rooms';
import { config } from '../src/config';

class FakePeer implements Peer {
  log: { event: string; payload: any }[] = [];
  closed = false;
  constructor(public id: string) {}
  emit(event: string, payload: unknown) {
    this.log.push({ event, payload });
  }
  disconnect() {
    this.closed = true;
  }
  last(event: string) {
    return [...this.log].reverse().find((l) => l.event === event)?.payload;
  }
  count(event: string) {
    return this.log.filter((l) => l.event === event).length;
  }
}
const user = (id: number, name = `P${id}`) => ({ id, username: `p${id}-0001`, displayName: name });
const CSV = ['do_kho,cau_hoi,dap_an_a,dap_an_b,dap_an_c,dap_an_d,dap_an_dung', '1,Q1?,a,b,c,d,A', '2,Q2?,a,b,c,d,B', '3,Q3?,a,b,c,d,C'].join('\n');

function setup() {
  const svc = new RoomService();
  const a = new FakePeer('sa');
  const b = new FakePeer('sb');
  const room = svc.create(user(1), a);
  svc.join(user(2), b, room.code);
  return { svc, a, b, room };
}

test('AC3: second player joins by code, third is refused, unknown code refused', () => {
  const { svc, room } = setup();
  assert.equal(room.members.length, 2);
  assert.throws(() => svc.join(user(3), new FakePeer('sc'), room.code), /đủ 2 người/);
  assert.throws(() => svc.join(user(3), new FakePeer('sc'), 'ZZZZZ'), RoomError);
  assert.throws(() => svc.create(user(1), new FakePeer('x')), /đang ở trong một phòng/);
});

test('AC4: only the host can start, and only with 2 players', () => {
  const svc = new RoomService();
  const room = svc.create(user(1), new FakePeer('sa'));
  assert.throws(() => svc.start(1), /đủ 2 người/);
  svc.join(user(2), new FakePeer('sb'), room.code);
  assert.throws(() => svc.start(2), /Chỉ chủ phòng/);
  svc.start(1, 0);
  assert.equal(room.status, 'playing');
});

test('AC5: host CSV import: bad file rejected with line errors and old bank kept; good file used; guest refused', () => {
  const { svc, room } = setup();
  assert.throws(() => svc.setCsv(2, CSV), /Chỉ chủ phòng/);
  const bad = svc.setCsv(1, 'do_kho,cau_hoi\n1,thiếu cột');
  assert.equal(bad.ok, false);
  assert.equal(room.bank, null);
  const good = svc.setCsv(1, CSV);
  assert.equal(good.ok, true);
  assert.equal(room.bank?.length, 3);
  svc.start(1, 0);
  const asked = room.engine!.quizzes; // bank is wired into the engine
  assert.ok(asked);
  (room.engine as any).hitBox(room.engine!.players[0], { id: 1, x: 1, y: 1, r: 1, tier: 'white', phase: 0 });
  assert.match(room.engine!.quizzes[0]!.question.text, /^Q\d\?$/);
  assert.throws(() => svc.setCsv(1, CSV), /đang chơi/);
});

test('no correct answer ever leaves the server', () => {
  const { svc, a, b, room } = setup();
  svc.start(1, 0);
  (room.engine as any).hitBox(room.engine!.players[0], { id: 1, x: 1, y: 1, r: 1, tier: 'white', phase: 0 });
  svc.tick(100);
  for (const p of [a, b]) for (const l of p.log) assert.ok(!/"correctIndex":[0-3]/.test(JSON.stringify(l.payload)), `${l.event} leaks correctIndex`);
});

test('AC6: only the answering seat gets a quiz; the other sees "answering"', () => {
  const { svc, a, b, room } = setup();
  svc.start(1, 0);
  (room.engine as any).cturn = { seat: 0, step: 'aim', until: 1e9, box: null };
  (room.engine as any).hitBox(room.engine!.players[0], { id: 1, x: 1, y: 1, r: 1, tier: 'white', phase: 0 });
  svc.tick(50);
  assert.ok(a.last('game:state').s.quiz);
  assert.equal(b.last('game:state').s.quiz, null);
  assert.equal(b.last('game:state').s.players[0].status, 'answering');
  // turn-based: nobody moves while another seat is answering
  svc.input(1, { right: true });
  svc.input(2, { left: true });
  const x0 = [room.engine!.players[0].x, room.engine!.players[1].x];
  for (let t = 100; t < 1100; t += 16) svc.tick(t);
  assert.deepEqual([room.engine!.players[0].x, room.engine!.players[1].x], x0);
});

test('AC9: both vote again -> new match; a "no" leaves the room and the other is told', () => {
  const { svc, a, b, room } = setup();
  svc.start(1, 0);
  room.engine!.forfeit(1);
  svc.tick(10);
  assert.equal(room.status, 'result');
  svc.vote(1, true, 20);
  assert.equal(room.status, 'result');
  svc.vote(2, true, 30);
  assert.equal(room.status, 'playing');
  assert.equal(a.count('game:start'), 2);
  room.engine!.forfeit(0);
  svc.tick(40);
  svc.vote(2, false, 50);
  assert.equal(svc.roomOf(2), null);
  svc.sweep(Date.now() + 1000); // regression: leaving via the vote must not make the sweeper delete the room at once
  assert.ok(svc.rooms.has(room.code), 'room kept for the player who stays');
  assert.equal(a.closed, false);
  assert.equal(b.last('room:left').reason.length > 0, true);
  assert.match(a.last('room:update').notice, /đã thoát phòng/);
  assert.equal(room.hostId, 1);
  // alone in the result screen: "play again" returns to the waiting room
  svc.vote(1, true, 60);
  assert.equal(room.status, 'waiting');
});

test('AC10: room with one connected person is deleted after the TTL; the player is told but stays connected', () => {
  const svc = new RoomService();
  const a = new FakePeer('sa');
  const room = svc.create(user(1), a, 1000);
  svc.sweep(1000 + config.aloneTtlMs - 1);
  assert.ok(svc.rooms.has(room.code));
  svc.sweep(1000 + config.aloneTtlMs);
  assert.equal(svc.rooms.has(room.code), false);
  assert.equal(a.closed, false, 'kicked out of the room, not disconnected');
  assert.ok(a.last('room:closed'));
  assert.equal(svc.roomOf(1), null);
});

test('AC10b: the TTL restarts when a second person leaves, and stops while two are connected', () => {
  const svc = new RoomService();
  const room = svc.create(user(1), new FakePeer('sa'), 0);
  svc.join(user(2), new FakePeer('sb'), room.code, 1000);
  svc.sweep(config.aloneTtlMs + 5000);
  assert.ok(svc.rooms.has(room.code), 'two people: no deletion');
  svc.leave(2, 400_000);
  svc.sweep(400_000 + config.aloneTtlMs - 1);
  assert.ok(svc.rooms.has(room.code));
  svc.sweep(400_000 + config.aloneTtlMs);
  assert.equal(svc.rooms.has(room.code), false);
});

test('AC11: a player disconnected longer than the limit loses; reconnecting in time resumes', async () => {
  const { svc, a, b, room } = setup();
  svc.start(1, 0);
  svc.detach(2, 'sb');
  assert.equal(room.engine!.players[1].away, true);
  const b2 = new FakePeer('sb2');
  svc.attach(user(2), b2);
  assert.equal(room.engine!.players[1].away, false);
  assert.ok(b2.last('game:start') && b2.last('game:state'), 'reconnect gets the current state');
  // stale socket events must not detach the new connection
  svc.detach(2, 'sb');
  assert.equal(room.member(2)!.peer, b2);
  svc.detach(2, 'sb2');
  const saved = config.awayForfeitMs;
  config.awayForfeitMs = 30;
  await new Promise((r) => setTimeout(r, 60));
  svc.tick(100);
  config.awayForfeitMs = saved;
  assert.equal(room.status, 'result');
  assert.equal(room.engine!.result?.winner, 0);
  assert.equal(room.engine!.result?.reason, 'forfeit');
  assert.match(String(a.last('room:update').notice), /xử thua/);
  void b;
});

test('leaving a running match loses it for the leaver', () => {
  const { svc, a, room } = setup();
  svc.start(1, 0);
  svc.leave(2, 10);
  assert.equal(room.engine!.result?.winner, 0);
  assert.equal(a.last('game:state').s.phase, 'result');
  assert.ok(a.last('game:state').s.stats, 'summary stats are included in the result snapshot');
});

test('input validation: garbage keys and unknown actions are ignored', () => {
  const { svc, room } = setup();
  svc.start(1, 0);
  svc.input(1, { left: 'yes' as any, right: true });
  assert.equal(room.engine!.players[0].input.left, false);
  assert.equal(room.engine!.players[0].input.right, true);
  svc.answer(2, 99); // no quiz open: ignored
  svc.move(1, 0, 1); // not arranging: ignored
});

// ---------------------------------------------------------------- 2v2 / team rooms
function setup4(join = 4) {
  const svc = new RoomService();
  const peers = [1, 2, 3, 4].map((i) => new FakePeer(`s${i}`));
  const room = svc.create(user(1), peers[0], Date.now(), '2v2');
  for (let i = 2; i <= join; i++) svc.join(user(i), peers[i - 1], room.code);
  return { svc, peers, room };
}

test('team rooms: only 1v1 and 2v2 can be created; 3v3, 4v4 and garbage are refused', () => {
  const svc = new RoomService();
  assert.throws(() => svc.create(user(1), new FakePeer('a'), Date.now(), '3v3'), /sắp có/);
  assert.throws(() => svc.create(user(1), new FakePeer('a'), Date.now(), '4v4'), /sắp có/);
  assert.throws(() => svc.create(user(1), new FakePeer('a'), Date.now(), '5v5'), /không hợp lệ/);
  assert.throws(() => svc.create(user(1), new FakePeer('a'), Date.now(), { x: 1 }), /không hợp lệ/);
  assert.equal(svc.roomOf(1), null, 'a refused create leaves no room behind');
  const r1 = svc.create(user(1), new FakePeer('a'));
  assert.equal(r1.mode, '1v1', 'default is 1v1');
  assert.equal(r1.view().seats, 2);
  const r2 = svc.create(user(2), new FakePeer('b'), Date.now(), '2v2');
  assert.equal(r2.view().mode, '2v2');
  assert.equal(r2.view().seats, 4);
});

test('2v2: seats are handed out in order, even seats = team A, odd seats = team B; the room fills at 4', () => {
  const { svc, room } = setup4();
  assert.deepEqual(room.view().players.map((p: any) => [p.seat, p.team]), [[0, 0], [1, 1], [2, 0], [3, 1]]);
  assert.throws(() => svc.join(user(5), new FakePeer('s5'), room.code), /đủ 4 người/);
  // a free seat in the middle goes to the next arrival
  svc.leave(2);
  svc.join(user(6), new FakePeer('s6'), room.code);
  assert.equal(room.member(6)!.seat, 1);
});

test('2v2: cannot start without 4 people, nor while one is disconnected; only the host starts', () => {
  const { svc, peers, room } = setup4(3);
  assert.throws(() => svc.start(1, 0), /đủ 4 người/);
  svc.join(user(4), peers[3], room.code);
  assert.throws(() => svc.start(2, 0), /Chỉ chủ phòng/);
  svc.detach(3, 's3');
  assert.throws(() => svc.start(1, 0), /mất kết nối/);
  svc.attach(user(3), new FakePeer('s3b'));
  svc.start(1, 0);
  assert.equal(room.status, 'playing');
  assert.equal(room.engine!.players.length, 4);
  assert.deepEqual(room.engine!.players.map((p) => p.idx), [0, 1, 2, 3]);
  const st = peers[1].last('game:start');
  assert.equal(st.seat, 1);
  assert.equal(st.names.length, 4);
});

test('1v1 still needs exactly 2 and its message names the number', () => {
  const svc = new RoomService();
  const room = svc.create(user(1), new FakePeer('a'));
  assert.throws(() => svc.start(1), /đủ 2 người/);
  svc.join(user(2), new FakePeer('b'), room.code);
  assert.throws(() => svc.join(user(3), new FakePeer('c'), room.code), /đủ 2 người/);
  svc.start(1, 0);
  assert.equal(room.engine!.players.length, 2);
});

test('2v2: arranging shows teammates but hides the enemy lineups in the snapshots', () => {
  const { svc, peers, room } = setup4();
  svc.start(1, 0);
  const e = room.engine!;
  for (const p of e.players) p.weapons.push({ uid: `u${p.idx}`, weaponId: 'dep_tong', tier: 'white', element: 'moc' } as any);
  (e as any).endCollect('full');
  (e as any).beginArrange();
  svc.tick(100);
  const view = (i: number) => peers[i].last('game:state').s.players.map((p: any) => p.lineup.length);
  assert.deepEqual(view(0), [1, 0, 1, 0], 'seat 0 sees itself and its teammate (seat 2)');
  assert.deepEqual(view(3), [0, 1, 0, 1], 'seat 3 sees itself and its teammate (seat 1)');
});

test('2v2: a player disconnected too long is knocked out alone; the others play on; an emptied team loses', async () => {
  const { svc, peers, room } = setup4();
  svc.start(1, 0);
  const saved = config.awayForfeitMs;
  config.awayForfeitMs = 30;
  try {
    svc.detach(2, 's2'); // seat 1, team B
    await new Promise((r) => setTimeout(r, 60));
    svc.tick(100);
    assert.equal(room.status, 'playing', 'the match goes on');
    assert.equal(room.engine!.players[1].out, true);
    assert.equal(room.engine!.players[3].out, false);
    assert.match(String(peers[0].last('room:update').notice), /bị loại khỏi ván/);
    assert.equal(room.engine!.phase === 'result', false);
    // the other member of team B drops too -> team A wins
    svc.detach(4, 's4');
    await new Promise((r) => setTimeout(r, 60));
    svc.tick(200);
    assert.equal(room.status, 'result');
    assert.equal(room.engine!.result?.winner, 0);
    assert.equal(room.engine!.result?.reason, 'forfeit');
  } finally {
    config.awayForfeitMs = saved;
  }
});

test('2v2: leaving a running match only drops that seat; the room keeps playing and only the last of a team ends it', () => {
  const { svc, peers, room } = setup4();
  svc.start(1, 0);
  svc.leave(3, 10); // seat 2, team A
  assert.equal(room.status, 'playing');
  assert.equal(room.engine!.players[2].out, true);
  assert.equal(room.members.length, 3);
  assert.equal(peers[2].last('room:left').reason.length > 0, true);
  assert.equal(svc.roomOf(3), null);
  assert.throws(() => svc.join(user(9), new FakePeer('s9'), room.code), /đang trong ván/);
  svc.leave(1, 20); // seat 0: team A is empty -> B wins
  assert.equal(room.status, 'result');
  assert.equal(room.engine!.result?.winner, 1);
  assert.equal(room.hostId, 2, 'host passes on');
});

test('2v2 rematch: everybody left must agree; one "no" removes only that player; missing people send the room back to waiting', () => {
  const { svc, peers, room } = setup4();
  svc.start(1, 0);
  room.engine!.forfeit(0);
  room.engine!.forfeit(2); // team A gone
  svc.tick(10);
  assert.equal(room.status, 'result');
  svc.vote(1, true, 20);
  svc.vote(2, true, 30);
  svc.vote(3, true, 40);
  assert.equal(room.status, 'result', 'one vote missing: no new match');
  svc.vote(4, false, 50); // seat 3 leaves; the three others had all agreed -> back to the waiting room, nobody else is dragged out
  assert.equal(svc.roomOf(4), null);
  assert.equal(room.members.length, 3);
  assert.equal(room.status, 'waiting');
  assert.ok(svc.rooms.has(room.code));
  assert.match(String(peers[0].last('room:update').notice), /đã thoát phòng/);
  // a newcomer fills the free seat and the host can start a fresh match
  svc.join(user(7), new FakePeer('s7'), room.code);
  svc.start(1, 100);
  assert.equal(room.status, 'playing');
  assert.equal(room.engine!.players.every((p) => !p.out), true);
});

test('2v2 rematch: all four agree -> a new match starts for the same four', () => {
  const { svc, peers, room } = setup4();
  svc.start(1, 0);
  room.engine!.forfeit(1);
  room.engine!.forfeit(3);
  svc.tick(10);
  for (const i of [1, 2, 3, 4]) svc.vote(i, true, 20 + i);
  assert.equal(room.status, 'playing');
  assert.equal(peers[3].count('game:start'), 2);
  assert.equal(room.engine!.players.every((p) => !p.out), true);
});

test('2v2: input of a gone or not-on-turn seat changes nothing; garbage mode payloads never create a room', () => {
  const { svc, room } = setup4();
  svc.start(1, 0);
  room.engine!.forfeit(1);
  const x = room.engine!.players[1].x;
  svc.input(2, { right: true });
  for (let t = 100; t < 600; t += 16) svc.tick(t);
  assert.equal(room.engine!.players[1].x, x);
});

test('2v2 rematch: a player leaves while another has not voted yet -> the votes cast stay, the result screen stays', () => {
  const { svc, room } = setup4();
  svc.start(1, 0);
  room.engine!.forfeit(0);
  room.engine!.forfeit(2);
  svc.tick(10);
  svc.vote(1, true, 20);
  svc.vote(2, true, 30);
  svc.vote(4, false, 40); // seat 3 leaves, user 3 still has to decide
  assert.equal(room.status, 'result');
  assert.equal(room.member(1)!.vote, true, 'earlier votes are kept');
  svc.vote(3, true, 50);
  assert.equal(room.status, 'waiting');
});

test('holding the fire key > 20s twice: warned, then lost and removed from the room', () => {
  const { svc, a, b, room } = setup();
  svc.start(1, 0);
  const e = room.engine!;
  let t = 0;
  const step = (ms: number) => {
    for (let i = 0; i < ms / 16; i++) svc.tick((t += 16));
  };
  step(3000);
  const seat = e.cturn!.seat;
  const uid = seat === 0 ? 1 : 2;
  svc.charge(uid, 'start');
  step(20600);
  assert.equal(e.players[seat].strikes, 1);
  assert.ok((seat === 0 ? a : b).last('game:state').s.players[seat].alert, 'the warned player gets the message');
  assert.equal((seat === 0 ? b : a).last('game:state').s.players[seat].alert, undefined, 'the other player does not');
  let guard = 0;
  while (!(e.cturn!.seat === seat && e.cturn!.step === 'aim') && guard++ < 200) step(1000);
  svc.charge(uid, 'start');
  step(20600);
  assert.equal(room.status, 'result');
  assert.equal(e.result?.winner, 1 - seat);
  assert.equal(svc.roomOf(uid), null, 'removed from the room');
  assert.match((seat === 0 ? a : b).last('room:left').reason, /xử thua/);
  assert.match(String((seat === 0 ? b : a).last('room:update').notice), /xử thua/);
});
