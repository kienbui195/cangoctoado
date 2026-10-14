// Headless checks for the multi-seat engine. Run: npx tsx scripts/engine-check.ts
import { RoyaleEngine, QUIZ_LIMIT_MS, sinhBonusAt, sameBonusAt, teamOf, type Snapshot } from '../src/game/royaleEngine';
import { makeOwned } from '../src/data/royaleWeapons';
import { baseProfile } from '../src/game/baseProfile';

const prof = baseProfile;
let failed = 0;
const ok = (c: boolean, msg: string) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!c) failed++;
};
const run = (e: RoyaleEngine, ms: number) => {
  for (let t = 0; t < ms; t += 1000 / 60) e.update(1000 / 60);
};

// 0. combos: chain Thủy→Mộc→Hỏa→Thổ builds 30/35/40; same element twice/thrice = 20/25 (effects only)
{
  const L = (...e: string[]) => e.map((element) => ({ element })) as any;
  const chain = L('thuy', 'moc', 'hoa', 'tho');
  ok([0, 1, 2, 3].map((i) => Math.round(sinhBonusAt(chain, i) * 100)).join() === '0,30,35,40', 'sinh chain is cumulative 0,30,35,40');
  const broken = L('thuy', 'moc', 'kim', 'thuy');
  ok([0, 1, 2, 3].map((i) => Math.round(sinhBonusAt(broken, i) * 100)).join() === '0,30,0,30', 'broken chain restarts at 30');
  const same = L('hoa', 'hoa', 'hoa', 'moc');
  ok([0, 1, 2, 3].map((i) => Math.round(sameBonusAt(same, i) * 100)).join() === '0,20,25,0', 'same-element combo 0,20,25,0');
  let okBoxes = true;
  for (let n = 0; n < 40; n++) {
    const e = new RoyaleEngine([prof('A'), prof('B')]);
    const c = { white: 0, blue: 0, red: 0 } as any;
    e.boxes.forEach((b) => c[b.tier]++);
    if (c.red < 1 || c.red > 2 || c.blue < 1 || c.blue > 2 || c.white + c.blue + c.red < 9) okBoxes = false;
  }
  ok(okBoxes, 'map starts with 1-2 red, 1-2 blue, rest white');
  const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [true, true] });
  run(e, 2500);
  const targets = JSON.stringify((e as any).boxTarget);
  for (let i = 0; i < 20; i++) {
    const b = e.boxes[0];
    if (!b) break;
    (e as any).hitBox(e.players[0], b);
    e.quizzes[0] = null;
    e.players[0].status = 'idle';
    run(e, 3000);
  }
  const c2 = { white: 0, blue: 0, red: 0 } as any;
  e.boxes.forEach((b) => c2[b.tier]++);
  ok(JSON.stringify((e as any).boxTarget) === targets && c2.red <= 2 && c2.blue <= 2, 'respawn keeps red<=2, blue<=2');
}

// 2b. holding the fire key more than 20s: 1st warning (turn lost), 2nd = lost match + kick
{
  const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false] });
  run(e, 2800);
  const a = e.cturn!.seat;
  e.startCharge(a);
  run(e, 20500);
  ok(e.players[a].strikes === 1 && !e.players[a].charging && /Cảnh cáo 1\/2/.test(e.players[a].alert?.text ?? ''), 'hold > 20s: first violation warns the player');
  ok(e.cturn!.seat !== a && e.phase === 'collect', 'the warned player lost the turn, game goes on');
  // wait for the same seat's next turn
  let g = 0;
  while (!(e.cturn!.seat === a && e.cturn!.step === 'aim') && g++ < 100) run(e, 1000);
  e.startCharge(a);
  run(e, 20500);
  ok(e.players[a].strikes === 2 && e.phase === 'result' && e.result?.winner === 1 - a, 'second violation: match lost (1v1: the other wins)');
  ok(e.drainKicks().join() === String(a), 'second violation queues a kick');
}

// 2c. upgrade attempts cost a turn even when the answer is wrong
{
  const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false] });
  const { makeOwned } = await import('../src/data/royaleWeapons');
  e.players[0].lineup = [makeOwned('dep_tong', 'white')];
  (e as any).phase = 'arrange';
  e.startUpgrade(0, e.players[0].lineup[0].uid);
  const q = e.quizzes[0]!;
  e.answerQuiz(0, (q.question.correctIndex + 1) % 4);
  ok(e.players[0].upgradesLeft === 2 && e.players[0].lineup[0].tier === 'white', 'wrong upgrade answer: -1 turn, weapon unchanged');
  run(e, 3000);
  e.startUpgrade(0, e.players[0].lineup[0].uid);
  e.answerQuiz(0, e.quizzes[0]!.question.correctIndex);
  ok(e.players[0].upgradesLeft === 1 && e.players[0].lineup[0].tier !== 'white', 'right upgrade answer: -1 turn and the tier goes up');
}

// 1. two bots play a full match
{
  const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [true, true] });
  let guard = 0;
  while (e.phase !== 'result' && guard++ < 60 * 60 * 20) run(e, 1000);
  ok(e.phase === 'result' && !!e.result, `bot vs bot reaches result (${Math.round(e.time / 1000)}s engine time, reason ${e.result?.reason})`);
  ok(e.stats[0].damageDealt + e.stats[1].damageDealt > 0, 'damage counters filled');
  ok(e.stats[0].damageDealt === e.stats[1].damageTaken && e.stats[1].damageDealt === e.stats[0].damageTaken, 'dealt == taken across seats');
  ok(e.stats[0].collected.white + e.stats[0].collected.blue + e.stats[0].collected.red === e.players[0].collected, 'collected-by-tier adds up');
}

// 2. turn-based collection: only the seat on turn may aim; a question lasts 20s; a wrong answer moves the box
{
  const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false], emitFx: true });
  run(e, 2800); // intro -> collect -> first turn
  ok(e.phase === 'collect' && !!e.cturn && e.cturn.step === 'aim', 'first turn started');
  const on = e.cturn!.seat;
  const off = 1 - on;
  e.startCharge(off);
  ok(!e.players[off].charging, 'the seat that is not on turn cannot charge');
  e.startCharge(on);
  ok(e.players[on].charging, 'the seat on turn can charge');
  e.setInput(off, { left: true });
  const xo = e.players[off].x;
  run(e, 1000);
  ok(e.players[off].x === xo, 'off-turn seat cannot move');
  // holding the power bar swings it 0 -> 100 -> 0 -> 100 and pauses the turn clock
  const until0 = e.cturn!.until;
  const seen: number[] = [];
  for (let t = 0; t < 7000; t += 100) {
    run(e, 100);
    seen.push(Math.round(e.players[on].charge));
  }
  ok(Math.max(...seen) >= 95 && seen.some((v, i) => i > 0 && v < seen[i - 1] - 2) && e.players[on].charging, 'power bar rises to 100, falls back and keeps going while held');
  ok(Math.abs(e.cturn!.until - until0 - 7000) < 150, 'turn clock paused while the key is held');
  // time out the aim window (15s) -> turn passes
  e.players[on].charging = false;
  run(e, 15500);
  ok(e.cturn!.seat === off, 'aim timeout passes the turn');
  // hit a box: question for that seat, 20s limit, wrong -> same tier elsewhere
  const box = e.boxes.find((b) => b.tier === 'blue') ?? e.boxes[0];
  const bx = { x: box.x, y: box.y, tier: box.tier };
  run(e, 800);
  (e as any).hitBox(e.players[e.cturn!.seat], box);
  const q = e.cturn!.seat;
  const tq = e.teamLeft.slice();
  ok(e.cturn!.step === 'quiz' && !!e.quizzes[q], 'hit opens a question for the shooter');
  run(e, 5000);
  ok(Math.abs(e.teamLeft[teamOf(q)] - tq[teamOf(q)]) < 20 && e.teamLeft[1 - teamOf(q)] === tq[1 - teamOf(q)], 'the team clock stands still during the question');
  run(e, QUIZ_LIMIT_MS - 5000 + 500);
  ok(e.quizzes[q] === null || !!e.quizzes[q]!.result, 'unanswered question timed out after 20s');
  run(e, 3000);
  ok(e.stats[q].correct === 0 && e.stats[q].opened === 1, 'timeout counts as wrong');
  ok(e.cturn!.seat !== q || e.cturn!.step === 'gap' || e.cturn!.step === 'aim', 'turn moved on after the question');
  run(e, 4000);
  const same = e.boxes.filter((b) => b.tier === bx.tier && Math.hypot(b.x - bx.x, b.y - bx.y) < 5);
  ok(same.length === 0, 'the wrong-answer box is not back at the same spot');
  ok(e.boxes.filter((b) => b.tier === bx.tier).length >= 1, 'a box of that tier is back on the map');
  ok(e.drainEvents().length > 0, 'fx became events');
  ok(e.particles.length === 0 && e.rings.length === 0, 'no local particles in emit mode');
}

// 3. correct answer, snapshot hides answers, replica follows
{
  const srv = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false], emitFx: true });
  const rep0 = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false] });
  rep0.replica = true;
  run(srv, 2500);
  (srv as any).cturn = { seat: 0, step: 'aim', until: srv.time + 15000, box: null };
  (srv as any).hitBox(srv.players[0], srv.boxes[0]);
  const raw = JSON.stringify(srv.snapshot(0));
  ok(!/"correctIndex":([0-9])/.test(raw), 'snapshot has no correctIndex');
  const correct = srv.quizzes[0]!.question.correctIndex;
  srv.answerQuiz(0, correct);
  ok(srv.stats[0].correct === 1 && srv.players[0].weapons.length === 1, 'correct answer gives a weapon');
  const snap = JSON.parse(JSON.stringify(srv.snapshot(0))) as Snapshot;
  rep0.applySnapshot(snap, 0);
  ok(rep0.quizzes[0]?.result?.correct === true && rep0.quizzes[1] === null, 'replica sees own quiz result');
  ok(rep0.players[0].weapons.length === 1, 'replica sees weapon');
  const foeView = JSON.parse(JSON.stringify(srv.snapshot(1))) as Snapshot;
  ok(foeView.quiz === null && foeView.players[0].status === 'answering', 'opponent only sees "answering"');
  // run to arrange and check the foe lineup is hidden
  run(srv, 5 * 60 * 1000 + 30000);
  let guard = 0;
  while (srv.phase !== 'arrange' && guard++ < 400) run(srv, 1000);
  ok(srv.phase === 'arrange', 'reached arrange');
  const a0 = srv.snapshot(0);
  ok(a0.players[1].lineup.length === 0 && a0.players[1].weapons.length === 0, 'opponent lineup hidden while arranging');
  ok(a0.players[0].lineup.length === srv.players[0].lineup.length, 'own lineup visible');
  console.log('snapshot size (arrange):', JSON.stringify(a0).length, 'bytes');
  srv.setReady(0);
  srv.setReady(1);
  run(srv, 100);
  ok(srv.phase === 'battle', 'both ready -> battle');
  const b = JSON.stringify(srv.snapshot(1));
  console.log('snapshot size (battle):', b.length, 'bytes');
  rep0.applySnapshot(JSON.parse(JSON.stringify(srv.snapshot(0))), 0);
  for (let i = 0; i < 30; i++) {
    run(srv, 16);
    rep0.applySnapshot(JSON.parse(JSON.stringify(srv.snapshot(0))), 0);
    run(rep0, 16);
  }
  ok(rep0.phase === 'battle' && !!rep0.battle, 'replica in battle');
  // forfeit
  srv.forfeit(0);
  ok(srv.phase === 'result' && srv.result?.winner === 1 && srv.result.reason === 'forfeit', 'forfeit gives the win to the other seat');
}


// 4. 2v2: four bots play a full match; turn order alternates teams; targets are the seat opposite
{
  const bots4 = () => new RoyaleEngine([prof('A1'), prof('B1'), prof('A2'), prof('B2')], { bots: [true, true, true, true] });
  const e = bots4();
  ok(e.players.length === 4 && e.players.map((p) => teamOf(p.idx)).join() === '0,1,0,1', 'seats 0,1,2,3 belong to teams A,B,A,B');
  ok(e.players[0].x < e.players[2].x && e.players[2].x < e.players[3].x && e.players[3].x < e.players[1].x, 'team A on the left, team B on the right');
  const seenTurns: { shooter: number; target: number; round: number; foeAlive: boolean }[] = [];
  const collectSeats: number[] = [];
  let lastTurn: unknown = null;
  let lastCt = '';
  let guard = 0;
  while (e.phase !== 'result' && guard++ < 60 * 60 * 20 * 4) {
    run(e, 50);
    const ct = e.cturn;
    if (e.phase === 'collect' && ct && ct.step === 'aim') {
      const key = `${ct.seat}@${Math.round(ct.until)}`;
      if (key !== lastCt) {
        lastCt = key;
        collectSeats.push(ct.seat);
      }
    }
    const t = e.battle?.turn;
    if (t && t !== lastTurn) {
      lastTurn = t;
      const foe = e.players[t.shooter ^ 1];
      seenTurns.push({ shooter: t.shooter, target: t.target, round: e.battle!.round, foeAlive: foe.hp > 0 });
    }
  }
  ok(e.phase === 'result' && !!e.result, `4 bots reach result (${Math.round(e.time / 1000)}s engine time, reason ${e.result?.reason}, winner team ${e.result?.winner})`);
  ok(e.stats.length === 4, 'stats per seat');
  const dealt = e.stats.reduce((a, x) => a + x.damageDealt, 0);
  const taken = e.stats.reduce((a, x) => a + x.damageTaken, 0);
  ok(dealt > 0 && Math.abs(dealt - taken) < 1e-6, 'damage dealt == damage taken across the 4 seats');
  ok(seenTurns.every((t) => teamOf(t.shooter) !== teamOf(t.target)), 'every shot goes to the other team');
  ok(seenTurns.filter((t) => t.foeAlive).every((t) => t.target === (t.shooter ^ 1)), 'while the opposite seat stands, it is the target');
  const firstRound = seenTurns.filter((t) => t.round === 0).map((t) => t.shooter);
  ok(firstRound.length === 4 && firstRound.every((s, i) => i === 0 || teamOf(s) !== teamOf(firstRound[i - 1])), `round 1 alternates the teams (${firstRound.join('>')})`);
  ok(seenTurns.length > 4 && new Set(seenTurns.map((t) => t.shooter)).size === 4, 'all four seats shot');
  const cs = collectSeats.slice(0, 9);
  let consecutive = true;
  for (let i = 1; i < cs.length; i++) if (cs[i] !== (cs[i - 1] + 1) % 4) consecutive = false;
  ok(cs.length >= 4 && consecutive, `collection turns go 0,1,2,3 in a loop (${cs.join('>')})`);
  ok(e.players.every((p) => p.collected === p.weapons.length), 'collected counters filled');
  const best = Math.max(...e.players.map((p) => p.collected));
  ok(e.endReason === 'time' || best >= 7, `collection ended by ${e.endReason} (best ${best} weapons)`);
  console.log(`   turns ${seenTurns.length}, rounds ${e.battle?.rounds}, hp ${e.players.map((p) => Math.round(p.hp)).join('/')}`);
}

// 5. 2v2 rules: elimination by forfeit, arrange secrecy, team win, rounds tie-break
{
  const mk = () => new RoyaleEngine([prof('A1'), prof('B1'), prof('A2'), prof('B2')], { bots: [false, false, false, false], emitFx: true });
  // 5a. a gone seat is skipped, its team plays on, the match does not end
  const e = mk();
  run(e, 2800);
  e.forfeit(1);
  ok(e.phase === 'collect' && e.result === null && e.players[1].out, 'forfeit of one seat does not end a 2v2');
  const seats = new Set<number>();
  for (let i = 0; i < 60; i++) {
    run(e, 1000);
    if (e.cturn) seats.add(e.cturn.seat);
  }
  ok(!seats.has(1) && seats.has(0) && seats.has(2) && seats.has(3), `collection turns skip the seat that left (${[...seats].sort().join()})`);
  e.startCharge(1);
  ok(!e.players[1].charging, 'a gone seat cannot aim');
  e.forfeit(3);
  ok(e.phase === 'result' && e.result?.winner === 0 && e.result.reason === 'forfeit', 'a team with nobody left loses at once (forfeit)');

  // 5b. forfeit while a seat has its question open: the box goes back, the turn moves on
  const q = mk();
  run(q, 2800);
  (q as any).cturn = { seat: 2, step: 'aim', until: q.time + 15000, box: null };
  (q as any).hitBox(q.players[2], q.boxes[0]);
  ok(!!q.quizzes[2], 'seat 2 has a question');
  const nb = q.boxes.length;
  q.forfeit(2);
  ok(q.quizzes[2] === null && q.cturn!.seat !== 2, 'forfeit closes the question and passes the turn');
  run(q, 4000);
  ok(q.boxes.length >= nb + 1, 'the box of the abandoned question is back');

  // 5c. arrange: enemy lineups hidden, teammates visible; everyone ready (or gone) starts the battle
  const a = mk();
  run(a, 2500);
  for (const p of a.players) p.weapons.push(makeOwned('dep_tong', 'white'), makeOwned('bong_da', 'blue'));
  (a as any).beginFinishing('full');
  let g = 0;
  while (a.phase !== 'arrange' && g++ < 600) run(a, 500);
  ok(a.phase === 'arrange', '2v2 reached arrange');
  const s0 = a.snapshot(0);
  ok(s0.players[2].lineup.length > 0 && s0.players[0].lineup.length > 0, 'teammate lineup visible while arranging');
  ok(s0.players[1].lineup.length === 0 && s0.players[3].lineup.length === 0 && s0.players[1].weapons.length === 0, 'enemy lineups hidden while arranging');
  const s1 = a.snapshot(1);
  ok(s1.players[0].lineup.length === 0 && s1.players[3].lineup.length > 0, 'hidden/visible follows the viewer team');
  ok(JSON.stringify(s0).length < 12000, 'snapshot stays small');
  a.setReady(0);
  a.setReady(1);
  a.setReady(2);
  run(a, 100);
  ok(a.phase === 'arrange', 'battle waits for every seat');
  a.forfeit(3); // the last one is gone: counts as ready
  run(a, 100);
  ok(a.phase === 'battle', 'a seat that left no longer blocks the battle');
  ok(a.players[3].hp === 0, 'the seat that left is knocked out at the start of the battle');
  // 5d. battle: a downed member is skipped but the match goes on; a seat that left never shoots
  ok(a.phase === 'battle', 'still in battle');
  const b = mk();
  run(b, 2500);
  for (const p of b.players) p.weapons.push(makeOwned('dep_tong', 'white'), makeOwned('bong_da', 'blue'), makeOwned('may_giat', 'white'));
  (b as any).endCollect('full');
  (b as any).beginArrange();
  b.forfeit(2); // team A keeps seat 0 only; seat 2 left before the battle
  b.players.forEach((p) => p.ready = true);
  run(b, 100);
  ok(b.phase === 'battle', '2v2 with one seat gone starts the battle');
  const after = new Set<number>();
  const before = new Set<number>();
  let downed = false;
  let stillGoing = false;
  let guard2 = 0;
  while (b.phase === 'battle' && guard2++ < 6000) {
    run(b, 50);
    const t = b.battle?.turn;
    if (t) (downed ? after : before).add(t.shooter);
    if (!downed && t && b.battle!.step === 'flight' && t.target === 1) {
      downed = true;
      b.players[1].hp = 0.0001; // the next hit knocks seat 1 down
    }
    if (downed && b.players[1].hp <= 0 && b.phase === 'battle' && b.battle!.step === 'gap') stillGoing = true;
  }
  ok(b.phase === 'result', 'battle with a downed and a gone seat finishes');
  ok(!before.has(2) && !after.has(2), 'a seat that left never shoots');
  ok(downed && (stillGoing || b.result?.reason === 'ko'), 'knocking one member down does not by itself end a 2v2 (or the team was already empty)');
  console.log('   shooters before/after the KO:', [...before].sort().join(), '|', [...after].sort().join(), 'result', JSON.stringify(b.result));
  ok(!after.has(1), 'a downed member stops shooting');

  // 5e. rounds tie-break uses the team share of HP
  const t = mk();
  run(t, 2500);
  (t as any).endCollect('time');
  (t as any).beginArrange();
  (t as any).startBattle();
  t.players[0].hp = t.players[0].maxHp;
  t.players[2].hp = t.players[2].maxHp;
  t.players[1].hp = t.players[1].maxHp * 0.5;
  t.players[3].hp = t.players[3].maxHp * 0.5;
  (t as any).finishBattle(null, 'rounds');
  ok(t.result?.winner === 0 && t.result.reason === 'rounds', 'rounds: the team with more HP share wins');
  t.players.forEach((p) => (p.hp = p.maxHp / 2));
  (t as any).finishBattle(null, 'rounds');
  ok(t.result?.winner === null, 'rounds: equal share = draw');
}

// 6. 1v1 stays intact: seat <-> team, forfeit, odd seat counts refused
{
  const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false] });
  ok(e.players.length === 2 && teamOf(0) === 0 && teamOf(1) === 1, '1v1: two seats, two teams');
  e.forfeit(1);
  ok(e.result?.winner === 0 && e.result.reason === 'forfeit', '1v1: leaving loses the match for the leaver');
  let bad = false;
  try {
    new RoyaleEngine([prof('A')]);
  } catch {
    bad = true;
  }
  ok(bad, 'an odd / single seat count is refused');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
