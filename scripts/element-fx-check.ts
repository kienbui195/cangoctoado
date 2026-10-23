// Headless checks for the elemental effects (AC of docs CanGocToaDo/hieu-ung-nguyen-to).
// Run: npx tsx scripts/element-fx-check.ts   (SKIP_SLOW=1 skips the full-match runs)
import { RoyaleEngine, type Snapshot } from '../src/game/royaleEngine';
import { baseProfile } from '../src/game/baseProfile';
import { makeOwned, WEAPON_BY_ID } from '../src/data/royaleWeapons';
import { createQualityMeter, drawElementFx, fxRng, fxTurnSeed, tierScale } from '../src/components/elementFx';

const STEP = 1000 / 60;
let failed = 0;
const ok = (c: boolean, msg: string) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!c) failed++;
};
const block = (name: string, fn: () => void) => {
  try {
    fn();
  } catch (err) {
    ok(false, `${name}: threw ${(err as Error).message}`);
  }
};
const bots = () => new RoyaleEngine([baseProfile('A'), baseProfile('B')], { bots: [true, true] });

/** A drawing context that records every call, so two draws can be compared. */
const recorder = () => {
  const log: string[] = [];
  const r = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));
  const grad = () => ({ addColorStop: (...a: unknown[]) => log.push('stop' + a.map(r).join(',')) });
  const ctx = new Proxy({} as any, {
    get: (_t, prop: string) => {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad();
      if (prop === 'measureText') return () => ({ width: 10 });
      return (...a: unknown[]) => void log.push(prop + '(' + a.map(r).join(',') + ')');
    },
    set: (_t, prop: string, v) => {
      log.push(prop + '=' + r(v));
      return true;
    },
  });
  return { ctx: ctx as CanvasRenderingContext2D, log };
};

/** Run a bot match, calling `each` after every step of a battle turn. */
const playBattle = (e: RoyaleEngine, each: (e: RoyaleEngine) => void, maxMs = 20 * 60 * 1000) => {
  let guard = 0;
  while (e.phase !== 'result' && guard++ < maxMs / STEP) {
    e.update(STEP);
    if (e.phase === 'battle') each(e);
  }
};

block('step lengths (AC-04.1, 04.2, 04.3, 04.6, 03.9)', () => {
  const e = bots();
  const charge: number[] = [];
  const impactHit: { ms: number; dots: boolean }[] = [];
  const impactMiss: number[] = [];
  let prev: string | null = null;
  let frames = 0;
  let cur: { hit: boolean; dots: boolean } | null = null;
  playBattle(e, (en) => {
    const bt = en.battle!;
    if (bt.step !== prev) {
      if (prev === 'charge') charge.push(frames * STEP);
      if (prev === 'impact' && cur) (cur.hit ? impactHit.push({ ms: frames * STEP, dots: cur.dots }) : impactMiss.push(frames * STEP));
      prev = bt.step;
      frames = 0;
      cur = null;
    }
    frames++;
    if (bt.step === 'impact' && bt.turn) cur = { hit: (bt.turn as any).hit === true, dots: (bt.turn as any).dotsEndAt > 0 };
  });
  ok(charge.length > 5, `played ${charge.length} charge steps`);
  ok(charge.every((ms) => ms >= 2000 && ms < 2000 + STEP + 1), 'AC-04.1/04.6: every charge step is 2000 ms (never 1999)');
  const clean = impactHit.filter((x) => !x.dots);
  ok(impactHit.length > 3 && impactHit.every((x) => x.ms >= 2200), 'AC-04.2: impact with a hit lasts at least 2200 ms');
  ok(clean.length > 0 && clean.every((x) => x.ms < 2200 + STEP + 1), 'AC-04.2: impact with a hit lasts 2200 ms (no burn extending it)');
  ok(impactMiss.every((ms) => ms < 900 + STEP + 1), 'AC-04.3/03.9: impact without a hit stays 900 ms');
});

block('hit flag in the snapshot (AC-03.1, 06.5)', () => {
  const e = bots();
  let seenHit = false;
  let wrongBeforeResolve = false;
  playBattle(e, (en) => {
    const s = en.snapshot(0);
    const turn = s.battle?.turn as any;
    if (!turn) return;
    if (s.battle!.step === 'impact') seenHit ||= turn.hit === true;
    if (s.battle!.step === 'flight' && turn.hit === true) wrongBeforeResolve = true;
  });
  ok(seenHit, 'snapshot carries hit=true during an impact that landed');
  ok(!wrongBeforeResolve, 'hit stays false until the last shell has ended');
});

block('quality meter (AC-05.1, 05.2, 05.4, 05.5)', () => {
  const m = createQualityMeter();
  const feed = (ms: number, frame: number) => {
    for (let t = 0; t < ms; t += frame) m.feed(frame);
  };
  ok(m.level === 0, 'starts at full quality');
  feed(1100, 28);
  ok(m.level === 0, 'AC-05.5: 28 ms average keeps the level');
  const m2 = createQualityMeter();
  for (let t = 0; t < 1100; t += 29) m2.feed(29);
  ok(m2.level === 1, 'AC-05.5/05.1: 29 ms average drops one level');
  for (let t = 0; t < 1100; t += 40) m2.feed(40);
  ok(m2.level === 2, 'AC-05.1: still slow, drops to minimum');
  for (let t = 0; t < 1100; t += 40) m2.feed(40);
  ok(m2.level === 2, 'never below minimum');
  for (let t = 0; t < 2400; t += 10) m2.feed(10);
  ok(m2.level === 2, 'AC-05.4: 2.4 s of fast frames is not enough to rise');
  for (let t = 0; t < 1000; t += 10) m2.feed(10);
  ok(m2.level === 1, 'AC-05.2: after 3 s of frames under 20 ms it rises one level');
  // flapping: one slow second then fast seconds must not bounce every second
  const m3 = createQualityMeter();
  const levels: number[] = [];
  for (let s = 0; s < 12; s++) {
    for (let t = 0; t < 1000; t += 16) m3.feed(s % 2 ? 16 : 30);
    levels.push(m3.level);
  }
  const changes = levels.filter((l, i) => i > 0 && l !== levels[i - 1]).length;
  ok(changes <= 6, `AC-05.4: alternating slow/fast seconds changes level ${changes} times in 12 s (hysteresis)`);
  const m4 = createQualityMeter();
  m4.feed(5000); // a hidden tab gives one giant frame
  ok(m4.level <= 1, 'one giant frame (hidden tab) does not jump straight to minimum');
});

block('scale by tier (AC-01.9, 03.8)', () => {
  ok(tierScale('white').size === 1 && tierScale('blue').size === 1.2 && tierScale('red').size === 1.4, 'size 1, 1.2, 1.4');
  ok(tierScale('white').count === 1 && tierScale('blue').count === 1.3 && tierScale('red').count === 1.6, 'particles 1, 1.3, 1.6');
});

block('seeded randomness (AC-06.4)', () => {
  const a = fxRng(fxTurnSeed(2, 3, 1));
  const b = fxRng(fxTurnSeed(2, 3, 1));
  const c = fxRng(fxTurnSeed(2, 4, 1));
  const sa = [a(), a(), a(), a()];
  const sb = [b(), b(), b(), b()];
  const sc = [c(), c(), c(), c()];
  ok(sa.join() === sb.join(), 'same turn gives the same sequence');
  ok(sa.join() !== sc.join(), 'another turn gives another sequence');
  ok(sa.every((x) => x >= 0 && x < 1), 'values in [0, 1)');
});

/** a replica engine frozen in a given battle state, drawn the way a browser would */
const frozen = (element: string, step: string, stepT: number, extra: Record<string, unknown> = {}, tier: 'white' | 'blue' | 'red' = 'white') => {
  const e = bots();
  let guard = 0;
  while (e.phase !== 'battle' && guard++ < 60 * 60 * 10) e.update(STEP);
  const s: Snapshot = JSON.parse(JSON.stringify(e.snapshot(0)));
  const ow = { ...makeOwned(Object.keys(WEAPON_BY_ID)[0], tier), element } as any;
  s.battle!.step = step as any;
  s.battle!.stepT = stepT;
  s.battle!.turn = { shooter: 0, target: 1, ow, sinh: false, khac: false, boost: 1, sinhBonus: 0, sameBonus: 0, ...extra } as any;
  const r = new RoyaleEngine([baseProfile('A'), baseProfile('B')]);
  r.replica = true;
  r.applySnapshot(s, 0);
  return r;
};
const draw = (r: RoyaleEngine, now = 1000) => {
  const { ctx, log } = recorder();
  drawElementFx(ctx, r, now, 0);
  return log.filter((l) => l !== 'save()' && l !== 'restore()').join('|');
};
const ELEMS = ['kim', 'thuy', 'moc', 'hoa', 'tho'];

block('drawing (AC-01.5, 01.6, 01.7, 01.8, 06.4, 06.5)', () => {
  const charge = ELEMS.map((el) => draw(frozen(el, 'charge', 1500)));
  ok(charge.every((l) => l.length > 50), 'AC-01.4: every element draws something while charging');
  ok(new Set(charge).size === 5, 'AC-01.5: the five elements draw five different charge-ups');
  const impact = ELEMS.map((el) => draw(frozen(el, 'impact', 900, { hit: true })));
  ok(new Set(impact).size === 5 && impact.every((l) => l.length > 50), 'AC-03.2..03.6: five different impact effects');
  ok(draw(frozen('kim', 'charge', 1500), 5) === draw(frozen('kim', 'charge', 1500), 99999), 'AC-06.4: drawing does not depend on the wall clock');
  ok(draw(frozen('hoa', 'impact', 900, { hit: true })) === draw(frozen('hoa', 'impact', 900, { hit: true })), 'AC-06.4: the same turn draws twice identically');
  ok(draw(frozen('kim', 'announce', 0)) === '', 'nothing drawn outside the charge/flight/impact steps');
  ok(draw(frozen('moc', 'impact', 500, { hit: false })) === '', 'AC-03.9: no big effect when nothing hit');
  ok(draw(frozen('moc', 'impact', 500, {})) !== '', 'AC-06.5: no hit flag from an old server counts as a hit');
  ok(draw(frozen('kim', 'impact', 2300, { hit: true })) === '', 'nothing drawn after the impact step is over');
  ok(draw(frozen('kim', 'flight', 700)) === '', 'AC-01.2: the giant sword is gone 600 ms after launch');
  ok(draw(frozen('kim', 'flight', 300)) !== '', 'AC-01.2: the giant sword is still rising at 300 ms');
  ok(draw(frozen('thuy', 'flight', 700)) === '', 'AC-01.3: the dragon is gone after 600 ms');
  ok(draw(frozen('moc', 'flight', 400)) === '' && draw(frozen('moc', 'flight', 200)) !== '', 'AC-01.4: leaves/fire/rocks fade in 300 ms');
  ok(draw(frozen('zzz', 'charge', 1000)) === '', 'AC-01.8: an unknown element draws no effect and does not throw');
  const sizes = (['white', 'blue', 'red'] as const).map((t) => draw(frozen('kim', 'charge', 1500, {}, t)));
  ok(new Set(sizes).size === 3, 'AC-01.9: the three tiers draw at different sizes');
  const noWeapon = frozen('kim', 'charge', 1000);
  (noWeapon.battle!.turn as any) = null;
  ok(draw(noWeapon) === '', 'no turn: nothing drawn');
});

block('visual only (AC-03.12, BR4)', () => {
  const run = (draws: boolean) => {
    let seed = 7;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const e = new RoyaleEngine([baseProfile('A'), baseProfile('B')], { bots: [true, true] });
    const { ctx } = recorder();
    playBattle(e, (en) => {
      if (draws) drawElementFx(ctx, en, en.time, 0);
    });
    return JSON.stringify([e.players.map((p) => [p.hp, p.shield]), e.result]);
  };
  const orig = Math.random;
  const a = run(false);
  const b = run(true);
  Math.random = orig;
  ok(a === b, 'drawing every frame changes neither damage, hp, shields nor the result');
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
