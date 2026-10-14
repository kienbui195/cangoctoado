// Headless checks for the team clocks, the reaction feedback, the new sounds and the bot levels
// (AC of docs CanGocToaDo/royale-doi-dong-ho-am-thanh). Run: npx tsx scripts/team-clock-check.ts
import { RoyaleEngine, teamOf, type Snapshot } from '../src/game/royaleEngine';
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
const block = (name: string, fn: () => void) => {
  try {
    fn();
  } catch (err) {
    ok(false, `${name}: threw ${(err as Error).message}`);
  }
};
const humans = (n: number) => new RoyaleEngine(Array.from({ length: n }, (_, i) => prof(`P${i}`)), { bots: Array(n).fill(false) });
const clocks = (e: RoyaleEngine): number[] => ((e as any).teamLeft as number[]) ?? [NaN, NaN];
const tap = (e: RoyaleEngine) => {
  const log: string[] = [];
  const orig = (e as any).sfx.bind(e);
  (e as any).sfx = (n: string) => {
    log.push(n);
    orig(n);
  };
  return log;
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const firstTurn = (e: RoyaleEngine) => {
  run(e, 2200);
  return e.cturn!.seat;
};

block('quota', () => {
  ok(clocks(humans(2)).join() === '180000,180000', 'AC-01.1/01.12: 1v1 teams get 180000 ms each');
  ok(clocks(humans(4)).join() === '180000,180000', 'AC-01.12: 2v2 teams get 180000 ms each');
  ok(clocks(humans(6)).join() === '300000,300000', 'AC-01.12: 3v3 teams get 300000 ms each');
  ok(clocks(humans(8)).join() === '300000,300000', 'AC-01.12: 4v4 teams get 300000 ms each');
});

block('clock runs only for the team on turn', () => {
  const e = humans(4);
  const on = firstTurn(e);
  const t = teamOf(on);
  const before = clocks(e).slice();
  run(e, 5000);
  const after = clocks(e);
  ok(near(before[t] - after[t], 5000, 60) && after[1 - t] === before[1 - t], 'AC-01.2: only the team on turn loses time');
  // holding Space pauses
  e.startCharge(on);
  const b2 = clocks(e).slice();
  run(e, 4000);
  ok(near(clocks(e)[t], b2[t], 20) && e.players[on].charging, 'AC-01.3: holding Space freezes the team clock');
  // flight pauses
  run(e, 1000);
  const b3 = clocks(e).slice();
  e.releaseCharge(on);
  let g = 0;
  while (e.shells.some((s) => s.kind === 'collect') && g++ < 400) run(e, 50);
  ok(near(clocks(e)[t], b3[t], 20), 'AC-01.4: a flying shell freezes the team clock');
});

block('question pauses; next turn switches clock', () => {
  const e = humans(4);
  const on = firstTurn(e);
  const t = teamOf(on);
  run(e, 500);
  (e as any).hitBox(e.players[on], e.boxes[0]);
  const b = clocks(e).slice();
  run(e, 6000);
  ok(near(clocks(e)[t], b[t], 20) && !!e.quizzes[on], 'AC-01.5: an open question freezes the team clock');
  e.answerQuiz(on, e.quizzes[on]!.question.correctIndex);
  run(e, 4500);
  const next = e.cturn!.seat;
  ok(teamOf(next) !== t, 'turn moved to the other team');
  const b2 = clocks(e).slice();
  run(e, 5000);
  const a2 = clocks(e);
  ok(near(b2[1 - t] - a2[1 - t], 5000, 120) && near(a2[t], b2[t], 20), 'AC-01.6: the other team clock runs, the first one stays frozen');
});

block('15 s turn limit', () => {
  const e = humans(4);
  const on = firstTurn(e);
  const t = teamOf(on);
  run(e, 15500);
  ok(e.cturn!.seat !== on && near(180000 - clocks(e)[t], 15000, 150), 'AC-01.7: idle turn ends after 15 s and costs the team those 15 s');
});

block('bot answering does not cost team time', () => {
  const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [true, true] });
  run(e, 2200);
  const on = e.cturn!.seat;
  e.players[on].botNextShotAt = Infinity;
  const t = teamOf(on);
  (e as any).hitBox(e.players[on], e.boxes[0]);
  e.players[on].botAnswerAt = e.time + 8000;
  const b = clocks(e)[t];
  run(e, 3000);
  ok(near(clocks(e)[t], b, 20), 'AC-01.9: bot thinking about a question freezes its team clock');
});

block('team out of time', () => {
  const e = humans(4);
  const on = firstTurn(e);
  const t = teamOf(on);
  (e as any).teamLeft[t] = 500;
  run(e, 1000);
  ok(clocks(e)[t] === 0 && e.cturn!.seat !== on, 'AC-02.1: team clock hits 0 and the turn ends at once');
  // the next turn of that team passes straight away
  (e as any).teamLeft[1 - t] = 100000;
  let guard = 0;
  let longest = 0;
  let cur = e.cturn!;
  let since = e.time;
  while (guard++ < 60 * 8 && e.phase === 'collect') {
    run(e, 16);
    if (e.cturn !== cur || e.cturn!.startedAt !== (cur as any).startedAt) {
      if (teamOf(cur.seat) === t && cur.step === 'aim') longest = Math.max(longest, e.time - since);
      cur = e.cturn!;
      since = e.time;
    }
  }
  ok(longest < 200, 'AC-02.2: a turn of the exhausted team passes at once (not 15 s)');
  ok(e.players.some((p) => teamOf(p.idx) !== t) && e.phase === 'collect', 'AC-02.3: the other team keeps playing');
  (e as any).teamLeft[1 - t] = 0;
  run(e, 1500);
  ok(e.phase === 'timeup' || e.phase === 'arrange', 'AC-02.4: both teams at 0 end the collection');
  ok(e.result === null, 'AC-02.8: running out of time does not lose the match');
  run(e, 3500);
  ok(e.phase === 'arrange' && e.arrangeLeft <= 180000 && e.arrangeLeft > 170000, 'AC-03.1: arrange starts with 180000 ms');
});

block('exhausted team is announced once (Q11 = A)', () => {
  const e = humans(4);
  const on = firstTurn(e);
  const t = teamOf(on);
  let shown = 0;
  const orig = (e as any).addFloater.bind(e);
  (e as any).addFloater = (x: number, y: number, text: string, ...rest: unknown[]) => {
    if (/Hết giờ đội/.test(text)) shown++;
    orig(x, y, text, ...rest);
  };
  (e as any).teamLeft[t] = 500;
  (e as any).teamLeft[1 - t] = 400000;
  run(e, 60000);
  ok(shown === 1 && e.phase === 'collect', 'AC-02.1/Q11: "Hết giờ đội" is shown once, the skipped turns after it are silent');
});

block('stale reaction is cleared on the replica', () => {
  const srv = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false], emitFx: true });
  const rep = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false] });
  rep.replica = true;
  run(srv, 2500);
  (srv as any).react(srv.players[0], true);
  rep.applySnapshot(JSON.parse(JSON.stringify(srv.snapshot(1))), 1);
  ok(!!(rep.players[0] as any).reaction, 'replica receives the reaction');
  run(srv, 2500);
  rep.applySnapshot(JSON.parse(JSON.stringify(srv.snapshot(1))), 1);
  ok(!(rep.players[0] as any).reaction, 'AC-09.1: the reaction disappears on the replica once the server dropped it');
});

block('seven weapons end it', () => {
  const e = humans(4);
  firstTurn(e);
  for (let i = 0; i < 7; i++) e.players[0].weapons.push(makeOwned('dep_tong', 'white'));
  (e as any).checkCollectEnd();
  run(e, 1500);
  ok(e.phase === 'timeup' && e.endReason === 'full', 'AC-02.5: 7 weapons of one player end collection although both teams have time');
});

block('shot fired before time ran out still counts', () => {
  const e = humans(4);
  const on = firstTurn(e);
  const t = teamOf(on);
  (e as any).teamLeft[t] = 200;
  e.startCharge(on);
  run(e, 1000);
  ok(near(clocks(e)[t], 200, 20), 'clock stays at 200 ms while charging');
  e.releaseCharge(on);
  (e as any).hitBox(e.players[on], e.boxes[0]);
  run(e, 300);
  e.answerQuiz(on, e.quizzes[on]!.question.correctIndex);
  ok(e.players[on].weapons.length === 1, 'AC-02.7: weapon from a shot fired in time is awarded');
});

block('snapshot carries the team clocks', () => {
  const srv = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false], emitFx: true });
  const rep = new RoyaleEngine([prof('A'), prof('B')], { bots: [false, false] });
  rep.replica = true;
  run(srv, 5000);
  const snap = JSON.parse(JSON.stringify(srv.snapshot(0))) as Snapshot;
  rep.applySnapshot(snap, 0);
  ok(clocks(rep).join() === clocks(srv).join() && !Number.isNaN(clocks(rep)[0]), 'AC-01.13: replica shows the clocks the server sent');
});

block('reaction + answer sounds', () => {
  const e = humans(4);
  const log = tap(e);
  const on = firstTurn(e);
  run(e, 300);
  (e as any).hitBox(e.players[on], e.boxes[0]);
  ok(log.includes('boxhit') && !log.includes('correct') && !log.includes('wrong'), 'AC-06.1: box collision gives boxhit and no cheer yet');
  e.answerQuiz(on, e.quizzes[on]!.question.correctIndex);
  const r = (e.players[on] as any).reaction;
  ok(log.includes('correct') && !log.includes('wrong') && ['🎉', '🥳'].includes(r?.emoji) && near(r.until - e.time, 2000, 100), 'AC-09.1/09.8: right answer -> cheer + happy emoji (~2 s), never the sad sound');
  run(e, 2600);
  ok(!(e.players[on] as any).reaction || (e.players[on] as any).reaction.until <= e.time, 'reaction expires');
  const e2 = humans(4);
  const log2 = tap(e2);
  const on2 = firstTurn(e2);
  run(e2, 300);
  (e2 as any).hitBox(e2.players[on2], e2.boxes[0]);
  const q = e2.quizzes[on2]!.question;
  e2.answerQuiz(on2, (q.correctIndex + 1) % 4);
  const r2 = (e2.players[on2] as any).reaction;
  ok(log2.includes('wrong') && !log2.includes('correct') && ['😭', '😤'].includes(r2?.emoji), 'AC-09.2: wrong answer -> sad sound + crying/grumpy emoji');
  const e3 = humans(4);
  const log3 = tap(e3);
  const on3 = firstTurn(e3);
  run(e3, 300);
  (e3 as any).hitBox(e3.players[on3], e3.boxes[0]);
  run(e3, 20500);
  ok(log3.includes('wrong') && !log3.includes('correct'), 'AC-09.4: no answer in 20 s counts as wrong');
});

block('battle sounds', () => {
  const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [true, true] });
  const log = tap(e);
  let guard = 0;
  while (e.phase !== 'result' && guard++ < 60 * 60 * 20) run(e, 50);
  const count = (n: string) => log.filter((x) => x === n).length;
  ok(count('chargeup') > 0 && count('chargeup') === count('power'), 'AC-07.1/07.6: one chargeup per battle turn (matches the burst)');
  ok(e.stats.some((s) => s.damageDealt > 0) && count('hitplayer') > 0, 'AC-08.1: hits on a player give hitplayer');
});

block('bot levels', () => {
  if (process.env.SKIP_BOTS) return; // fast mode for mutation runs
  const LEVELS: [string, number, number][] = [['easy', 0.5, 0.4], ['medium', 0.7, 0.7], ['super', 0.85, 0.85]];
  for (const [lv, acc, ans] of LEVELS) {
    let shots = 0;
    let hits = 0;
    let opened = 0;
    let correct = 0;
    for (let n = 0; n < 60; n++) {
      const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [true, true], botLevel: lv } as any);
      const fc = (e as any).fireCollect.bind(e);
      (e as any).fireCollect = (...a: unknown[]) => {
        shots++;
        fc(...a);
      };
      const hb = (e as any).hitBox.bind(e);
      (e as any).hitBox = (...a: unknown[]) => {
        hits++;
        hb(...a);
      };
      run(e, 3 * 60 * 1000);
      e.stats.forEach((s) => {
        opened += s.opened;
        correct += s.correct;
      });
    }
    ok(shots > 500 && near(hits / shots, acc, 0.05), `AC-10.x: ${lv} bot hits ${(100 * hits / Math.max(1, shots)).toFixed(0)}% of ${shots} shots (want ${acc * 100}%)`);
    ok(opened > 350 && near(correct / opened, ans, 0.06), `AC-10.5: ${lv} bot answers ${(100 * correct / Math.max(1, opened)).toFixed(0)}% right of ${opened} (want ${ans * 100}%)`);
  }
  // boundary with a stubbed random number
  const realRandom = Math.random;
  const answer = (lv: string, r: number) => {
    const e = new RoyaleEngine([prof('A'), prof('B')], { bots: [true, true], botLevel: lv } as any);
    const p = e.players[1];
    p.botAnswerTier = 'red';
    Math.random = () => r;
    try {
      (e as any).botFinishAnswer(p);
    } finally {
      Math.random = realRandom;
    }
    return e.stats[1].correct === 1;
  };
  ok(answer('easy', 0.399) && !answer('easy', 0.401), 'AC-10.11: easy boundary 0.399 right / 0.401 wrong');
  ok(answer('super', 0.849) && !answer('super', 0.851), 'AC-10.11: super boundary 0.849 right / 0.851 wrong');
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
