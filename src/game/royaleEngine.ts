// Weapon Royale engine: "Thu thập vũ khí" -> "Sắp xếp" -> "Đối kháng tự động".
// Pure TypeScript (no React). The canvas steps it at a fixed 60Hz and draws from its public state;
// the HUD reads the same state. Every action takes a seat (0..N-1, team = seat % 2: A = even seats, B = odd seats); each seat is a human or a bot (EngineOptions.bots).
// The same class runs three ways: local (browser, every seat but 0 is a bot), authoritative on the server (emitFx: effects become
// events) and as a client replica (applySnapshot, no game logic).

import type { PlayerStats } from '../types/game';
import { getInitialVelocity, stepPhysics } from '../utils/gunnyPhysics';
import { isSolid, terrainHeight, WORLD_H, WORLD_W } from '../utils/terrain';
import {
  makeOwned,
  ELEMENTS,
  isKhac,
  isSinh,
  KHAC_PENALTY,
  nextTier,
  OwnedWeapon,
  randomWeaponId,
  RoyaleWeapon,
  Tier,
  TIERS,
  WEAPON_BY_ID,
} from '../data/royaleWeapons';
import { askQuestion, AskedQuestion, Difficulty } from '../data/questions';

// ---------------------------------------------------------------- tunables
// Collection clock: every team has its own, it only runs while a seat of that team is thinking / aiming (like a chess clock).
export const COLLECT_TEAM_MS = 3 * 60 * 1000; // 1v1 and 2v2
export const COLLECT_TEAM_MS_BIG = 5 * 60 * 1000; // 3 or more seats per team
export const INTRO_MS = 2000;
export const ARRANGE_MS = 3 * 60 * 1000;
export const WEAPONS_TO_WIN = 7;
export const MAX_LINEUP = 6;
export const UPGRADES_PER_PLAYER = 3;
// Chains build up: the 1st "tương sinh" link gives +30%, every further link in an unbroken chain +5% more (35%, 40%...).
export const SINH_BASE = 0.3;
export const SINH_STEP = 0.05;
// Same element fired twice in a row boosts the weapon's *effects* (heal, shield, burn, element perk...): +20%, then +5% per extra link.
export const SAME_BASE = 0.2;
export const SAME_STEP = 0.05;
const STEP_MS = 1000 / 60;
// Collection is turn-based: seats shoot one after another.
export const TURN_AIM_MS = 15 * 1000; // aim + fire
const TURN_GAP_MS = 700; // pause between two turns
export const HOLD_LIMIT_MS = 20 * 1000; // longest the fire key may be held in one go
const BOX_RADIUS = 22;
const SHELL_RADIUS = 8;
const BOX_HIT_R = BOX_RADIUS + SHELL_RADIUS;
const TARGET_HIT_R = 28;
const BOX_TOP_MARGIN = 175; // gift boxes never spawn above this (the HUD covers the top of the screen)
const BOX_EDGE_MARGIN = 260; // gift boxes stay this far from the left/right edge of the map
const BOXES_ON_MAP = 10; // red 1-2, blue 1-2, the rest white (rolled per match)
const BOX_RESPAWN_MS = 2500;
export const QUIZ_LIMIT_MS = 20 * 1000; // an unanswered question counts as wrong
const QUIZ_CLOSE_OK_MS = 2600;
const QUIZ_CLOSE_BAD_MS = 1700;
export const SNAPSHOT_HZ = 30;

// bot behaviour: the level fixes how often a shot is aimed true and how often a question is answered right; it thinks 5-12s per question
export type BotLevel = 'easy' | 'medium' | 'super';
export const BOT_LEVELS: Record<BotLevel, { label: string; hit: number; correct: number }> = {
  easy: { label: 'Dễ', hit: 0.5, correct: 0.4 },
  medium: { label: 'Trung bình', hit: 0.7, correct: 0.7 },
  super: { label: 'Siêu cấp', hit: 0.85, correct: 0.85 },
};
export const DEFAULT_BOT_LEVEL: BotLevel = 'medium';
export const isBotLevel = (v: unknown): v is BotLevel => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BOT_LEVELS, v);
const BOT_AIM_SIGMA_ANGLE = 0.25; // a shot aimed true still wobbles a little
const BOT_AIM_SIGMA_POWER = 0.5;
export const REACTION_MS = 2000; // how long the cheer / sad emoji stays above a player after a question
const BOT_SHOT_GAP_MS: [number, number] = [1500, 4000]; // thinking time before the bot fires on its turn
const BOT_THINK_MS: [number, number] = [5000, 12000];

// battle damage scale: base(~100) * tier * attack/1000 * K
const DAMAGE_K = 8;

/** Seats are 0..N-1 (N = 2, 4, 6, 8). Team = seat % 2, so the turn order 0,1,2,3... alternates the teams. */
export type Seat = number;
export type Team = 0 | 1;
export const teamOf = (seat: number): Team => (seat % 2) as Team;
export const TEAM_LABEL = ['A', 'B'] as const;
export const MAX_SEATS = 8;
/** The seat facing this one: same index inside the other team (0<->1, 2<->3...). */
export const oppositeSeat = (seat: number): Seat => seat ^ 1;
export type Phase = 'intro' | 'collect' | 'timeup' | 'arrange' | 'battle' | 'result';

export interface Box {
  id: number;
  x: number;
  y: number;
  r: number;
  tier: Tier;
  phase: number; // bobbing offset
}

export interface Shell {
  id: number;
  owner: Seat;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ammo: string;
  color: string;
  trail: { x: number; y: number }[];
  kind: 'collect' | 'battle';
  share: number; // damage share (battle)
  blast: number;
  weaponId?: string;
  element?: string; // element color id
  legend?: boolean;
  age: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  emoji?: string;
  gravity: number;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  color: string;
  life: number;
  max: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

export interface RPlayer {
  idx: Seat;
  name: string;
  isBot: boolean;
  x: number;
  y: number;
  facing: 1 | -1;
  angle: number;
  avatarColor: string;
  stats: PlayerStats;
  hp: number;
  maxHp: number;
  weapons: OwnedWeapon[]; // collected, in pickup order
  collected: number; // how many were collected (decides who shoots first)
  lineup: OwnedWeapon[]; // arrangement (first MAX_LINEUP go to battle)
  ready: boolean;
  status: 'idle' | 'answering' | 'frozen';
  frozenUntil: number;
  charging: boolean;
  charge: number;
  /** the power bar swings 0 -> 100 -> 0 -> 100... while the key is held (+1 rising, -1 falling) */
  chargeDir: 1 | -1;
  /** ms the fire key has been held without a break (more than HOLD_LIMIT_MS is a violation) */
  holdMs: number;
  /** violations so far: the 2nd one loses the match and the player is removed from the room */
  strikes: number;
  /** message for this player only (warning / removal) */
  alert?: { text: string; until: number };
  cooldownUntil: number;
  botNextShotAt: number;
  botAnswerAt: number;
  botAnswerTier: Tier;
  botReadyAt: number;
  // battle buffs
  shield: number;
  weaken: number;
  empower: number;
  reviveUsed: boolean;
  lastWeaponIdx: number; // lineup index already fired
  upgradesLeft: number;
  botAttempts: number;
  botUpgradeNext: number;
  botAskedAt: number;
  lastAction?: string; // small caption under the avatar
  speech?: { text: string; until: number }; // taunt bubble above the head
  /** cheer / sad emoji after a box question, seen by the whole room */
  reaction?: { emoji: string; until: number };
  input: SeatInput;
  /** gift box this seat clicked (the ruler suggests the power for it) */
  selectedBoxId: number | null;
  /** disconnected seat (server): the engine does not wait for it */
  away: boolean;
  /** gave up / lost the connection for good: skipped everywhere, counts as knocked out */
  out: boolean;
}

export interface SeatInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Counters shown on the end-of-match comparison table. */
export interface MatchStats {
  opened: number; // gift boxes opened + upgrade attempts (every question shown)
  correct: number;
  answerMsTotal: number;
  upgradeTries: number;
  upgradeOk: number;
  damageDealt: number;
  damageTaken: number;
  crits: number;
  collected: Record<Tier, number>; // weapons held when collection ended
}

export const TEAM_COLOR = ['#f59e0b', '#06b6d4'];

const emptyStats = (): MatchStats => ({
  opened: 0,
  correct: 0,
  answerMsTotal: 0,
  upgradeTries: 0,
  upgradeOk: 0,
  damageDealt: 0,
  damageTaken: 0,
  crits: 0,
  collected: { white: 0, blue: 0, red: 0 },
});

export interface QuizState {
  playerIdx: Seat;
  kind: 'collect' | 'upgrade';
  /** collect: tier of the gift box; upgrade: the tier the weapon would become */
  tier: Tier;
  uid?: string; // weapon being upgraded
  question: AskedQuestion;
  chosen: number | null;
  /** reward = new weapon (collect) or the upgraded weapon (upgrade) */
  result: null | { correct: boolean; reward: OwnedWeapon | null };
  shownAt: number; // engine time the question appeared
  expireAt: number; // engine time after which it counts as wrong
  closeAt: number; // engine time the result closes by itself (Infinity until answered)
}

export interface CollectTurn {
  seat: Seat;
  step: 'aim' | 'flight' | 'quiz' | 'gap';
  /** engine time the aim window / the gap ends (moves later while the power bar is held) */
  until: number;
  /** engine time this turn began: stable for the whole turn, use it as an identity key */
  startedAt: number;
  /** the gift box this turn hit (it is off the map until the question is settled) */
  box: Box | null;
}

export interface Banner {
  text: string;
  sub?: string;
  color: string;
  until: number; // engine time
}

type BattleStep = 'announce' | 'gap' | 'charge' | 'flight' | 'impact' | 'ko';

interface Turn {
  shooter: Seat;
  target: Seat;
  ow: OwnedWeapon;
  w: RoyaleWeapon;
  queue: { at: number; angle: number; power: number; share: number }[];
  spawned: number;
  ended: number;
  dealt: number;
  hitCount: number;
  empower: number;
  weaken: number;
  shieldOnTarget: number;
  raw: number; // raw (unmitigated) full-power damage, for burn
  sinh: boolean; // previous weapon of the shooter "sinh" this one (+30%)
  khac: boolean; // the opponent's weapon of the same round khắc this one (-20%)
  boost: number; // (1 + sinh bonus) x khắc: multiplies damage and effect strengths
  sinhBonus: number; // 0 when no chain
  sameBonus: number; // same-element combo: extra effect strength only
  impactMs: number;
  dotsEndAt: number;
}

export interface BattleState {
  rounds: number;
  round: number;
  /** index into `order` */
  turnInRound: number;
  /** every seat, the teams alternating; the first shooter opens the round */
  order: Seat[];
  step: BattleStep;
  stepT: number;
  turn: Turn | null;
  wind: number;
}

export interface BattleResult {
  /** winning TEAM (0 = A, 1 = B), null = draw. In 1v1 the team index equals the seat. */
  winner: Team | null;
  reason: 'ko' | 'rounds' | 'forfeit';
}

export type FxEvent = (string | number | string[] | undefined)[];

export interface EngineOptions {
  /** which seats are controlled by the built-in bot (default: every seat but 0) */
  bots?: boolean[];
  /** server mode: particles / rings / floaters / shake / sfx become events (drainEvents) instead of local state */
  emitFx?: boolean;
  /** question source (the server uses the room's CSV bank) */
  ask?: (difficulty: Difficulty, used: Set<string>) => AskedQuestion;
  /** how good the built-in bots are (practice mode); anything else falls back to the default */
  botLevel?: BotLevel;
}

export type PublicPlayer = Omit<
  RPlayer,
  'botNextShotAt' | 'botAnswerAt' | 'botAnswerTier' | 'botReadyAt' | 'botAttempts' | 'botUpgradeNext' | 'botAskedAt' | 'reviveUsed' | 'input' | 'holdMs'
>;

export interface SnapshotTurn {
  sinhBonus: number;
  sameBonus: number;
  shooter: Seat;
  target: Seat;
  ow: OwnedWeapon;
  sinh: boolean;
  khac: boolean;
  boost: number;
}

export interface Snapshot {
  time: number;
  phase: Phase;
  phaseT: number;
  /** collection clock of each team (A, B) */
  teamLeft: [number, number];
  /** older clients only know this one: the larger team clock */
  collectLeft: number;
  arrangeLeft: number;
  wind: number;
  players: PublicPlayer[];
  boxes: Box[];
  shells: Omit<Shell, 'trail'>[];
  banner: Banner | null;
  cturn: CollectTurn | null;
  endReason: 'time' | 'full' | null;
  result: BattleResult | null;
  notice: string | null;
  battle: (Omit<BattleState, 'turn'> & { turn: SnapshotTurn | null }) | null;
  quiz: QuizState | null;
  stats: MatchStats[] | null;
}

// ---------------------------------------------------------------- helpers
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
const gauss = () => {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** One 60 Hz step of the power bar: up to 100, then back down to 0, then up again for as long as the key is held. */
export function advanceCharge(p: { charge: number; chargeDir: 1 | -1 }) {
  p.charge += (p.chargeDir * STEP_MS) / 28;
  if (p.charge >= 100) {
    p.charge = 100;
    p.chargeDir = -1;
  } else if (p.charge <= 0) {
    p.charge = 0;
    p.chargeDir = 1;
  }
}

/** Standing Y for a character at world x (feet 1px above the ground, like the classic mode). */
export const groundY = (x: number) => Math.floor(terrainHeight(x)) - 1;

interface SimResult {
  hit: boolean;
  err: number;
}

/** Same stepping as the real shells: stops on terrain / bounds / contact with (tx,ty). */
export function simShot(
  sx: number,
  sy: number,
  facing: 1 | -1,
  angle: number,
  power: number,
  wind: number,
  tx: number,
  ty: number,
  hitR: number
): SimResult {
  const v = getInitialVelocity(angle, power, facing);
  let vx = v.vx;
  let vy = v.vy;
  let x = sx + facing * 16;
  let y = sy - 18;
  for (let i = 0; i < 700; i++) {
    const n = stepPhysics(x, y, vx, vy, wind);
    x = n.x;
    y = n.y;
    vx = n.vx;
    vy = n.vy;
    const d = Math.hypot(x - tx, y - ty);
    if (d < hitR) return { hit: true, err: d };
    if (isSolid(x, y) || y > WORLD_H + 40 || x < -300 || x > WORLD_W + 300) return { hit: false, err: d };
  }
  return { hit: false, err: Infinity };
}

export interface AimSolution {
  angle: number;
  power: number;
  err: number;
  hit: boolean;
}

/** Best power for every integer angle (12..88) that lands on the target. Only hitting solutions are returned. */
export function solveAims(
  sx: number,
  sy: number,
  facing: 1 | -1,
  wind: number,
  tx: number,
  ty: number,
  hitR: number
): AimSolution[] {
  const out: AimSolution[] = [];
  for (let angle = 12; angle <= 88; angle++) {
    let bestP = -1;
    let bestE = Infinity;
    for (let p = 8; p <= 100; p += 2) {
      const r = simShot(sx, sy, facing, angle, p, wind, tx, ty, hitR);
      if (r.err < bestE) {
        bestE = r.err;
        bestP = p;
      }
    }
    if (bestP < 0) continue;
    let finalP = bestP;
    let finalR = simShot(sx, sy, facing, angle, bestP, wind, tx, ty, hitR);
    for (const dp of [-1, 1]) {
      const p = bestP + dp;
      if (p < 8 || p > 100) continue;
      const r = simShot(sx, sy, facing, angle, p, wind, tx, ty, hitR);
      if ((r.hit && !finalR.hit) || (r.hit === finalR.hit && r.err < finalR.err)) {
        finalR = r;
        finalP = p;
      }
    }
    if (finalR.hit) out.push({ angle, power: finalP, err: finalR.err, hit: true });
  }
  return out;
}

/** Highest-quality shot for a target: the hit with the smallest error. */
export function bestAim(
  sx: number,
  sy: number,
  facing: 1 | -1,
  wind: number,
  tx: number,
  ty: number,
  hitR: number
): AimSolution | null {
  const all = solveAims(sx, sy, facing, wind, tx, ty, hitR);
  if (all.length === 0) return null;
  return all.reduce((a, b) => (b.err < a.err ? b : a));
}

/** Tương sinh bonus of weapon i given the weapons before it: 0 when the previous one does not "sinh" it. */
export function sinhBonusAt(list: { element: OwnedWeapon['element'] }[], i: number): number {
  let links = 0;
  for (let j = i; j > 0 && isSinh(list[j - 1].element, list[j].element); j--) links++;
  return links ? SINH_BASE + SINH_STEP * (links - 1) : 0;
}

/** Same-element combo bonus (effect strength only) of weapon i. */
export function sameBonusAt(list: { element: OwnedWeapon['element'] }[], i: number): number {
  let links = 0;
  for (let j = i; j > 0 && list[j - 1].element === list[j].element; j--) links++;
  return links ? SAME_BASE + SAME_STEP * (links - 1) : 0;
}

export function weaponScore(ow: OwnedWeapon): number {
  const w = WEAPON_BY_ID[ow.weaponId];
  const total = w.hits.reduce((a, b) => a + b, 0);
  return w.base * TIERS[ow.tier].damageMult * total;
}

export interface EngineProfile {
  name: string;
  stats: PlayerStats;
}

// ---------------------------------------------------------------- engine
export class RoyaleEngine {
  time = 0;
  phase: Phase = 'intro';
  phaseT = 0;
  teamLeft: [number, number] = [COLLECT_TEAM_MS, COLLECT_TEAM_MS];
  readonly botLevel: BotLevel;
  arrangeLeft = ARRANGE_MS;
  wind = 1.2;

  players: RPlayer[];
  boxes: Box[] = [];
  shells: Shell[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];
  floaters: Floater[] = [];
  shake = 0;
  banner: Banner | null = null;

  /** one question window per seat: answering freezes only that seat, the world and the clock keep running */
  quizzes: (QuizState | null)[];
  /** whose turn it is during collection */
  cturn: CollectTurn | null = null;
  endReason: 'time' | 'full' | null = null;
  battle: BattleState | null = null;
  result: BattleResult | null = null;
  notice: string | null = null;
  stats: MatchStats[];

  /** seat this view belongs to (UI perspective; always 0 in local mode) */
  mySeat: Seat = 0;
  /** client replica: no game logic, state arrives through applySnapshot() */
  replica = false;
  readonly emitFx: boolean;
  sfxSeq = 0;
  sfxLog: { seq: number; name: string }[] = [];

  private finishing: 'time' | 'full' | null = null;
  private acc = 0;
  private boxId = 0;
  private shellId = 0;
  private respawn: { at: number; tier: Tier; avoid?: { x: number; y: number } }[] = [];
  private boxTarget: Record<Tier, number> = (() => {
    const red = randInt(1, 2);
    const blue = randInt(1, 2);
    return { red, blue, white: BOXES_ON_MAP - red - blue };
  })();
  private dots: { at: number; target: Seat; amount: number; src: Seat }[] = [];
  private usedQuestions = new Set<string>();
  private listeners = new Set<() => void>();
  private events: FxEvent[] = [];
  private kicks: Seat[] = [];
  /** client replica: engine time my power bar started locally (the bar is predicted here, snapshots must not overwrite it) */
  localChargeSince: number | null = null;
  /** client replica: until this engine time a server snapshot may not turn my power bar back on (I already released) */
  localReleaseUntil = 0;
  private ask: NonNullable<EngineOptions['ask']>;
  private smooth: { x: number; y: number }[];

  /** One profile per seat (2, 4, 6 or 8): seat i belongs to team i % 2. */
  constructor(profiles: EngineProfile[], opts: EngineOptions = {}) {
    if (profiles.length < 2 || profiles.length > MAX_SEATS || profiles.length % 2 !== 0) throw new Error('RoyaleEngine needs 2, 4, 6 or 8 seats');
    const bots = opts.bots ?? profiles.map((_, i) => i !== 0);
    this.emitFx = !!opts.emitFx;
    this.botLevel = isBotLevel(opts.botLevel) ? opts.botLevel : DEFAULT_BOT_LEVEL;
    const quota = profiles.length / 2 >= 3 ? COLLECT_TEAM_MS_BIG : COLLECT_TEAM_MS;
    this.teamLeft = [quota, quota];
    this.ask = opts.ask ?? askQuestion;
    const mk = (idx: Seat, prof: EngineProfile, x: number, facing: 1 | -1, color: string): RPlayer => ({
      idx,
      name: prof.name,
      isBot: !!bots[idx],
      x,
      y: groundY(x),
      facing,
      angle: 65,
      avatarColor: color,
      stats: prof.stats,
      hp: prof.stats.maxHp,
      maxHp: prof.stats.maxHp,
      weapons: [],
      collected: 0,
      lineup: [],
      ready: false,
      status: 'idle',
      frozenUntil: 0,
      charging: false,
      charge: 0,
      chargeDir: 1,
      holdMs: 0,
      strikes: 0,
      cooldownUntil: 0,
      botNextShotAt: INTRO_MS + rand(...BOT_SHOT_GAP_MS),
      botAnswerAt: 0,
      botAnswerTier: 'white',
      botReadyAt: 0,
      shield: 0,
      weaken: 0,
      empower: 0,
      reviveUsed: false,
      lastWeaponIdx: -1,
      upgradesLeft: UPGRADES_PER_PLAYER,
      botAttempts: 0,
      botUpgradeNext: 0,
      botAskedAt: 0,
      input: { left: false, right: false, up: false, down: false },
      selectedBoxId: null,
      away: false,
      out: false,
    });
    this.players = profiles.map((prof, i) => {
      const team = teamOf(i);
      const k = Math.floor(i / 2); // place inside the team
      return mk(i, prof, team === 0 ? 240 + k * 200 : 1680 - k * 200, team === 0 ? 1 : -1, TEAM_COLOR[team]);
    });
    this.quizzes = profiles.map(() => null);
    this.stats = profiles.map(() => emptyStats());
    this.smooth = profiles.map(() => ({ x: 0, y: 0 }));
    this.wind = Number((rand(-2.5, 2.5)).toFixed(1));
    this.fillBoxes(true);
  }

  /** The question window of the seat this view belongs to. */
  get quiz(): QuizState | null {
    return this.quizzes[this.mySeat];
  }

  private sfx(name: string) {
    if (this.emitFx) {
      this.fxOut(['s', name]);
      return;
    }
    this.sfxSeq++;
    this.sfxLog.push({ seq: this.sfxSeq, name });
    if (this.sfxLog.length > 40) this.sfxLog.shift();
  }

  // ---- subscription (HUD)
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  // ---- public control API (every call names its seat)
  setInput(seat: Seat, inp: Partial<SeatInput>) {
    Object.assign(this.players[seat].input, inp);
  }

  clearInput(seat: Seat) {
    this.players[seat].input = { left: false, right: false, up: false, down: false };
  }

  /** It is this seat's turn and it may still aim / fire. */
  canAim(seat: Seat): boolean {
    const ct = this.cturn;
    return this.phase === 'collect' && !this.finishing && !!ct && ct.seat === seat && ct.step === 'aim' && !this.quizzes[seat];
  }

  startCharge(seat: Seat) {
    const p = this.players[seat];
    if (p.isBot || !this.canAim(seat) || p.charging) return;
    p.charging = true;
    p.charge = 0;
    p.chargeDir = 1;
    p.holdMs = 0;
  }

  /**
   * Release the shot. Online, the client sends the angle/power it saw on its own ruler: network latency would otherwise
   * shift both values; the server keeps them within what the seat could really have reached.
   */
  releaseCharge(seat: Seat, claim?: { angle: number; power: number }) {
    const p = this.players[seat];
    if (!p.charging) return;
    p.charging = false;
    if (!this.canAim(seat)) {
      p.charge = 0;
      return;
    }
    let power = clamp(Math.round(p.charge), 8, 100);
    if (claim && Number.isFinite(claim.power) && Number.isFinite(claim.angle)) {
      // The client runs its own power bar and angle (smooth, and exactly what the player saw): trust them within what
      // the server knows is possible. During the first rise the bar cannot be higher than the hold time allows.
      const reachable = p.holdMs >= 2800 ? 100 : p.holdMs / 28 + 18; // 18 = ~500 ms of network delay
      power = clamp(Math.round(Math.min(claim.power, reachable)), 8, 100);
      p.angle = clamp(claim.angle, Math.max(0, p.angle - 14), Math.min(90, p.angle + 14));
    }
    p.charge = 0;
    this.fireCollect(p, p.angle, power);
  }

  /** Click on the battlefield: pick the gift box under the cursor and turn to face it. */
  selectBoxAt(seat: Seat, x: number, y: number) {
    if (this.phase !== 'collect' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    let best: Box | null = null;
    let bestD = Infinity;
    for (const b of this.boxes) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < b.r + 26 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) return;
    const p = this.players[seat];
    p.selectedBoxId = best.id;
    if (this.canAim(seat) && best.x !== p.x) p.facing = best.x >= p.x ? 1 : -1;
    this.emit();
  }

  /** Box the ruler should help with: the one the seat clicked, else the nearest in the facing direction. */
  rulerTarget(seat: Seat = this.mySeat): Box | null {
    const p = this.players[seat];
    const chosen = p.selectedBoxId !== null ? this.boxes.find((b) => b.id === p.selectedBoxId) : undefined;
    if (chosen) return chosen;
    let best: Box | null = null;
    let bestD = Infinity;
    for (const b of this.boxes) {
      const ahead = (b.x - p.x) * p.facing > 0;
      const d = Math.abs(b.x - p.x) + (ahead ? 0 : 1e5);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  private openQuiz(seat: Seat, kind: QuizState['kind'], tier: Tier, level: Difficulty, uid?: string) {
    this.quizzes[seat] = {
      playerIdx: seat,
      kind,
      tier,
      uid,
      question: this.ask(level, this.usedQuestions),
      chosen: null,
      result: null,
      shownAt: this.time,
      expireAt: this.time + QUIZ_LIMIT_MS,
      closeAt: Infinity,
    };
    this.stats[seat].opened++;
  }

  answerQuiz(seat: Seat, choice: number) {
    const qz = this.quizzes[seat];
    if (!qz || qz.result || !Number.isInteger(choice) || choice < 0 || choice > 3) return;
    this.resolveQuiz(seat, choice);
  }

  /** choice === null: time ran out, counts as wrong */
  private resolveQuiz(seat: Seat, choice: number | null) {
    const qz = this.quizzes[seat];
    if (!qz || qz.result) return;
    const me = this.players[seat];
    qz.chosen = choice;
    const correct = choice !== null && choice === qz.question.correctIndex;
    let reward: OwnedWeapon | null = null;
    if (qz.kind === 'collect') {
      if (correct) {
        reward = makeOwned(randomWeaponId(), qz.tier);
        me.weapons.push(reward);
      }
    } else {
      // every attempt spends one of the 3 upgrade turns, right or wrong (an unanswered question counts as wrong)
      me.upgradesLeft = Math.max(0, me.upgradesLeft - 1);
      const w = correct ? me.lineup.find((o) => o.uid === qz.uid) : undefined;
      if (w) {
        w.tier = qz.tier;
        reward = w;
        this.stats[seat].upgradeOk++;
      }
    }
    if (correct) this.stats[seat].correct++;
    if (qz.kind === 'collect') this.react(me, correct);
    this.stats[seat].answerMsTotal += Math.min(QUIZ_LIMIT_MS, this.time - qz.shownAt);
    qz.result = { correct, reward };
    qz.closeAt = this.time + (correct ? QUIZ_CLOSE_OK_MS : QUIZ_CLOSE_BAD_MS);
    this.emit();
  }

  /** Cheer or sad feedback above the player after a box question: the whole room sees and hears what is going on. */
  private react(p: RPlayer, correct: boolean) {
    const pool = correct ? ['🎉', '🥳'] : ['😭', '😤'];
    p.reaction = { emoji: pool[randInt(0, pool.length - 1)], until: this.time + REACTION_MS };
    this.sfx(correct ? 'correct' : 'wrong');
  }

  closeQuiz(seat: Seat) {
    const qz = this.quizzes[seat];
    if (!qz || !qz.result) return;
    const p = this.players[seat];
    this.quizzes[seat] = null;
    if (qz.kind === 'collect') {
      p.status = 'idle';
      p.charging = false;
      p.charge = 0;
      this.settleBox(p, !!qz.result?.correct);
      this.checkCollectEnd();
    }
    this.emit();
  }

  private stepQuizzes() {
    for (let seat = 0; seat < this.quizzes.length; seat++) {
      const qz = this.quizzes[seat];
      if (!qz) continue;
      if (!qz.result && this.time >= qz.expireAt) this.resolveQuiz(seat, null);
      else if (qz.result && this.time >= qz.closeAt) this.closeQuiz(seat);
    }
  }

  /** Arrange phase: try to raise the tier of one weapon by answering a medium / hard question. */
  startUpgrade(seat: Seat, uid: string) {
    const me = this.players[seat];
    if (this.phase !== 'arrange' || me.ready || this.quizzes[seat] || me.upgradesLeft <= 0) return;
    const w = me.lineup.find((o) => o.uid === uid);
    const to = w ? nextTier(w.tier) : null;
    if (!w || !to) return;
    this.stats[seat].upgradeTries++;
    this.openQuiz(seat, 'upgrade', to, Math.random() < 0.5 ? 'medium' : 'hard', uid);
    this.emit();
  }

  moveLineup(idx: Seat, from: number, to: number) {
    if (this.phase !== 'arrange' || this.players[idx].ready) return;
    const p = this.players[idx];
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from === to || from < 0 || to < 0 || from >= p.lineup.length || to >= p.lineup.length) return;
    const [it] = p.lineup.splice(from, 1);
    p.lineup.splice(to, 0, it);
    this.emit();
  }

  /** Take back "Sẵn sàng" (only while the opponent has not made the battle start yet). */
  cancelReady(idx: Seat) {
    if (this.phase !== 'arrange') return;
    this.players[idx].ready = false;
    this.emit();
  }

  /** Lazy-player helper: best order for the first MAX_LINEUP slots, Ngũ hành tương sinh first, then raw power. */
  suggestLineup(idx: Seat) {
    if (this.phase !== 'arrange') return;
    const p = this.players[idx];
    if (p.ready || p.lineup.length < 2) return;
    p.lineup = bestSinhOrder(p.lineup);
    this.emit();
  }

  setReady(idx: Seat) {
    if (this.phase !== 'arrange' || this.quizzes[idx]) return;
    if (this.players[idx].out) return;
    this.players[idx].ready = true;
    this.emit();
    if (this.players.every((p) => p.ready || p.out)) this.startBattle();
  }

  /**
   * A seat gave up or lost its connection for good: only that seat drops out (it is skipped from now on and counts as
   * knocked out). The match ends at once when nobody of its team is left: the other team wins ('forfeit').
   */
  forfeit(seat: Seat) {
    if (this.phase === 'result') return;
    const p = this.players[seat];
    if (!p || p.out) return;
    p.out = true;
    p.charging = false;
    p.charge = 0;
    this.clearInput(seat);
    this.quizzes[seat] = null;
    const team = teamOf(seat);
    if (!this.players.some((q) => teamOf(q.idx) === team && !q.out)) {
      this.quizzes = this.players.map(() => null);
      this.shells = [];
      this.dots = [];
      this.battle = null;
      this.banner = null;
      this.cturn = null;
      this.players.forEach((q) => {
        q.charging = false;
        q.charge = 0;
        this.clearInput(q.idx);
      });
      this.result = { winner: (1 - team) as Team, reason: 'forfeit' };
      this.sfx('win');
      this.setPhase('result');
      return;
    }
    // the rest of the team plays on
    p.speech = undefined;
    this.addFloater(p.x, p.y - 90, '📴 Rời trận', '#f87171', 16, 80);
    if (this.phase === 'collect' || this.phase === 'timeup') {
      this.shells = this.shells.filter((s) => s.owner !== seat);
      p.status = 'idle';
      const ct = this.cturn;
      if (this.phase === 'collect' && ct && ct.seat === seat) this.settleBox(p, false); // its box goes back; the turn moves on
    } else if (this.phase === 'battle' && this.battle) {
      p.hp = 0;
      const bt = this.battle;
      const t = bt.turn;
      if (t && (t.shooter === seat || t.target === seat) && bt.step !== 'ko') {
        // the turn in progress involved this seat: drop it and go on with the next shooter
        this.shells = this.shells.filter((s) => s.kind !== 'battle');
        this.dots = [];
        if (bt.step === 'charge') this.sfx('chargestop');
        bt.turn = null;
        this.banner = null;
        this.advanceTurnCounter();
        bt.step = 'gap';
        bt.stepT = 0;
      }
    }
    this.emit();
  }

  // ---- main loop
  update(dtMs: number) {
    this.acc += Math.min(dtMs, 100);
    let stepped = false;
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      if (this.replica) this.stepReplica();
      else this.step();
      stepped = true;
    }
    if (stepped) this.shake *= 0.9;
  }

  private step() {
    this.time += STEP_MS;
    this.phaseT += STEP_MS;
    this.stepFx();
    this.stepQuizzes();
    for (const q of this.players) if (q.reaction && this.time >= q.reaction.until) q.reaction = undefined;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= INTRO_MS) this.setPhase('collect');
        break;
      case 'collect':
        this.stepCollect();
        break;
      case 'timeup':
        this.stepShells();
        if (this.phaseT >= 2800) this.beginArrange();
        break;
      case 'arrange':
        this.stepArrange();
        break;
      case 'battle':
        this.stepBattle();
        break;
      default:
        break;
    }
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    this.emit();
  }

  // ================================================================= COLLECT
  private stepCollect() {
    this.stepShells();
    this.stepCollectTurn();
    this.stepRespawn();

    // collection stops once the turn in progress is settled (no shell in the air, nobody answering)
    if (this.finishing && this.players.every((p) => p.status !== 'answering') && !this.shells.some((s) => s.kind === 'collect')) {
      this.endCollect(this.finishing);
    }
  }

  private beginFinishing(reason: 'time' | 'full') {
    if (this.finishing) return;
    this.finishing = reason;
    const waiting = this.players.some((p) => p.status === 'answering');
    this.banner = {
      text: reason === 'time' ? 'HẾT GIỜ!' : 'ĐÃ ĐỦ 7 VŨ KHÍ!',
      sub: waiting ? 'Chờ người chơi còn lại trả lời xong câu hỏi...' : undefined,
      color: '#fbbf24',
      until: this.time + 600000,
    };
    this.players.forEach((p) => {
      p.charging = false;
      p.charge = 0;
    });
  }

  // ---- turns: seat after seat; 15s to aim and fire, then (on a hit) 20s to answer
  /** First seat that is still in the match, starting at `seat` (inclusive), going 0,1,2,3... */
  private liveSeat(seat: Seat): Seat {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const s = (seat + i) % n;
      if (!this.players[s].out) return s;
    }
    return seat;
  }

  /** Both teams have used up their collection clock. */
  private teamsOut(): boolean {
    return this.teamLeft[0] <= 0 && this.teamLeft[1] <= 0;
  }

  private startTurn(first: Seat) {
    const seat = this.liveSeat(first);
    const p = this.players[seat];
    if (this.teamLeft[teamOf(seat)] <= 0) {
      // this team has no time left: its turn passes at once, the rhythm of the other seats stays the same
      if (this.teamsOut()) this.beginFinishing('time');
      this.cturn = { seat: this.liveSeat((seat + 1) % this.players.length), step: 'gap', until: this.time, startedAt: this.time, box: null };
      this.emit();
      return;
    }
    this.cturn = { seat, step: 'aim', until: this.time + TURN_AIM_MS, startedAt: this.time, box: null };
    p.status = 'idle';
    p.charging = false;
    p.charge = 0;
    p.botNextShotAt = this.time + rand(...BOT_SHOT_GAP_MS);
    p.lastAction = undefined;
    this.wind = Number(rand(-3, 3).toFixed(1)); // new wind for every turn: everybody aims in the same conditions
    // the "your turn" beep is played by the client of the seat on turn
    this.emit();
  }

  private endTurn_collect() {
    const ct = this.cturn;
    if (!ct) return;
    const p = this.players[ct.seat];
    p.charging = false;
    p.charge = 0;
    p.status = 'idle';
    this.cturn = { seat: this.liveSeat((ct.seat + 1) % this.players.length), step: 'gap', until: this.time + TURN_GAP_MS, startedAt: this.time, box: null };
    this.emit();
  }

  private stepCollectTurn() {
    // finishing: let the turn already running end (a bot may still be answering), never start another
    if (this.finishing && this.cturn?.step !== 'quiz') return;
    let ct = this.cturn;
    if (!ct) {
      this.startTurn(randInt(0, this.players.length - 1)); // a random seat opens, then 0,1,2,3... (teams alternate)
      return;
    }
    const p = this.players[ct.seat];
    switch (ct.step) {
      case 'gap':
        if (this.time >= ct.until) this.startTurn(ct.seat);
        break;
      case 'aim':
        if (p.isBot) this.stepBot(p);
        else this.stepHuman(p);
        ct = this.cturn; // a violation may have ended the turn or the whole match
        if (!ct || this.phase !== 'collect') return;
        if (ct.step === 'aim' && p.charging) ct.until += STEP_MS; // holding the power bar pauses the turn clock (and the team clock)
        else if (ct.step === 'aim') {
          // only the team of the seat that is thinking / aiming pays; flight, questions and the gap between turns are free
          const team = teamOf(p.idx);
          this.teamLeft[team] = Math.max(0, this.teamLeft[team] - STEP_MS);
          if (this.teamLeft[team] <= 0) {
            this.addFloater(p.x, p.y - 90, `⏱ Hết giờ đội ${TEAM_LABEL[team]}`, '#fbbf24', 16, 80);
            this.endTurn_collect();
            if (this.teamsOut()) this.beginFinishing('time');
            break;
          }
        }
        if (ct.step === 'aim' && this.time >= ct.until) {
          this.addFloater(p.x, p.y - 90, '⏱ Hết giờ ngắm', '#fbbf24', 15, 70);
          this.endTurn_collect();
        }
        break;
      case 'flight':
        // the shell is gone and no box was hit (a hit switches the turn to 'quiz' straight away)
        if (!this.shells.some((s) => s.kind === 'collect' && s.owner === ct!.seat)) this.endTurn_collect();
        break;
      case 'quiz':
        if (p.isBot && p.status === 'answering' && this.time >= p.botAnswerAt) this.botFinishAnswer(p);
        break;
    }
  }

  /** The question of a hit box is settled: right -> a new box by quota, wrong -> the same tier somewhere else. */
  private settleBox(p: RPlayer, correct: boolean) {
    const ct = this.cturn;
    const box = ct?.box;
    if (box) {
      const tier = correct ? this.nextBoxTier() : box.tier;
      this.respawn.push({ at: this.time + BOX_RESPAWN_MS, tier, avoid: correct ? undefined : { x: box.x, y: box.y } });
    }
    if (ct && ct.seat === p.idx) this.endTurn_collect();
  }

  /** Held the fire key for more than HOLD_LIMIT_MS: 1st time a warning and the turn is lost, 2nd time the match is lost. */
  private holdViolation(p: RPlayer) {
    p.strikes++;
    p.charging = false;
    p.charge = 0;
    p.holdMs = 0;
    const secs = HOLD_LIMIT_MS / 1000;
    if (p.strikes >= 2) {
      p.alert = { text: `⛔ Bạn giữ phím bắn quá ${secs} giây lần thứ 2: bị xử thua và mời ra khỏi phòng.`, until: this.time + 60000 };
      this.addFloater(p.x, p.y - 100, '⛔ Vi phạm lần 2', '#f87171', 18, 90);
      this.kicks.push(p.idx);
      this.forfeit(p.idx);
    } else {
      p.alert = { text: `⚠ Cảnh cáo 1/2: giữ phím bắn quá ${secs} giây là vi phạm, lượt này bị mất. Vi phạm lần nữa sẽ bị xử thua và mời ra khỏi phòng.`, until: this.time + 9000 };
      this.addFloater(p.x, p.y - 100, '⚠ Cảnh cáo 1/2', '#fbbf24', 18, 90);
      this.endTurn_collect();
    }
    this.emit();
  }

  /** Seats to remove from the room (server): they broke the hold rule twice. */
  drainKicks(): Seat[] {
    const k = this.kicks;
    this.kicks = [];
    return k;
  }

  private stepHuman(p: RPlayer) {
    if (p.status !== 'idle') return;
    const dt = STEP_MS / 1000;
    if (p.input.up) p.angle = clamp(p.angle + 40 * dt, 0, 90);
    if (p.input.down) p.angle = clamp(p.angle - 40 * dt, 0, 90);
    if (p.input.left !== p.input.right) {
      const dir = p.input.right ? 1 : -1;
      p.facing = dir;
      p.x = clamp(p.x + dir * 70 * dt, 60, WORLD_W - 60);
      p.y = groundY(p.x);
    }
    if (p.charging && !this.finishing) {
      advanceCharge(p);
      p.holdMs += STEP_MS;
      if (p.holdMs > HOLD_LIMIT_MS) this.holdViolation(p);
    }
  }

  private stepBot(p: RPlayer) {
    if (this.finishing || p.status !== 'idle' || this.time < p.botNextShotAt || this.boxes.length === 0) return;

    // pick a box: easy and near ones are more attractive
    const scored = this.boxes.map((b) => ({
      b,
      s: (b.tier === 'white' ? 3 : b.tier === 'blue' ? 2 : 1) * 600 / (200 + Math.abs(b.x - p.x)) * Math.random(),
    }));
    scored.sort((a, b) => b.s - a.s);
    for (const { b } of scored.slice(0, 3)) {
      const facing: 1 | -1 = b.x >= p.x ? 1 : -1;
      const sol = bestAim(p.x, p.y, facing, this.wind, b.x, b.y, BOX_HIT_R);
      if (!sol) continue;
      p.facing = facing;
      let angle: number;
      let power: number;
      if (Math.random() < BOT_LEVELS[this.botLevel].hit) {
        // aimed true: only a tiny wobble
        angle = clamp(sol.angle + gauss() * BOT_AIM_SIGMA_ANGLE, 5, 88);
        power = clamp(Math.round(sol.power + gauss() * BOT_AIM_SIGMA_POWER), 8, 100);
      } else {
        // aimed badly on purpose: off in power (towards the side that has room) and in angle, and checked against EVERY box
        // so the shot really misses (a wild shot often clips another box, which would hide the level)
        const dir = sol.power > 60 ? -1 : 1;
        angle = sol.angle;
        power = sol.power;
        for (let attempt = 0; attempt < 8; attempt++) {
          angle = clamp(sol.angle + rand(-9, 9), 5, 88);
          power = clamp(Math.round(sol.power + dir * rand(10, 26)), 8, 100);
          if (this.boxes.every((bx) => !simShot(p.x, p.y, facing, angle, power, this.wind, bx.x, bx.y, BOX_HIT_R).hit)) break;
        }
      }
      p.angle = angle;
      this.fireCollect(p, p.angle, power);
      return;
    }
    p.botNextShotAt = this.time + 500; // no reachable box from here: look again shortly (the turn timer still runs)
  }

  private botFinishAnswer(p: RPlayer) {
    const st = this.stats[p.idx];
    const correct = Math.random() < BOT_LEVELS[this.botLevel].correct;
    st.opened++;
    st.answerMsTotal += Math.max(0, p.botAnswerAt - p.botAskedAt);
    if (correct) {
      st.correct++;
      const ow = makeOwned(randomWeaponId(), p.botAnswerTier);
      p.weapons.push(ow);
      const w = WEAPON_BY_ID[ow.weaponId];
      this.addFloater(p.x, p.y - 90, `${w.icon} ${w.name}`, TIERS[ow.tier].color, 15, 90);
      p.lastAction = '✔ Đúng!';
    } else {
      this.addFloater(p.x, p.y - 90, '✘ Trả lời sai', '#f87171', 15, 70);
      p.lastAction = '✘ Sai';
    }
    this.react(p, correct);
    p.status = 'idle';
    this.settleBox(p, correct);
    this.checkCollectEnd();
    this.emit();
  }

  private fireCollect(p: RPlayer, angle: number, power: number) {
    const v = getInitialVelocity(angle, power, p.facing);
    this.sfx('shoot');
    if (this.cturn && this.cturn.seat === p.idx) this.cturn.step = 'flight';
    this.shells.push({
      id: ++this.shellId,
      owner: p.idx,
      x: p.x + p.facing * 16,
      y: p.y - 18,
      vx: v.vx,
      vy: v.vy,
      ammo: '🧱',
      color: teamOf(p.idx) === 0 ? '#fbbf24' : '#22d3ee',
      trail: [],
      kind: 'collect',
      share: 1,
      blast: 26,
      age: 0,
    });
    for (let i = 0; i < 6; i++) this.particle(p.x + p.facing * 18, p.y - 18, rand(-1, 1) + p.facing * 1.5, rand(-1.5, 0.5), teamOf(p.idx) === 0 ? '#fde68a' : '#a5f3fc', rand(2, 4), 18);
  }

  private stepShells() {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      const n = stepPhysics(s.x, s.y, s.vx, s.vy, this.wind);
      s.x = n.x;
      s.y = n.y;
      s.vx = n.vx;
      s.vy = n.vy;
      s.age++;
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 16) s.trail.shift();

      if (s.kind === 'collect') {
        const owner = this.players[s.owner];
        if (owner.status === 'idle' && this.phase === 'collect' && !this.finishing) {
          const hit = this.boxes.find((b) => Math.hypot(s.x - b.x, s.y - b.y) < b.r + SHELL_RADIUS);
          if (hit) {
            this.shells.splice(i, 1);
            this.puff(s.x, s.y, s.color, 14);
            this.hitBox(owner, hit);
            continue;
          }
        }
        if (isSolid(s.x, s.y) || s.y > WORLD_H + 40 || s.x < -300 || s.x > WORLD_W + 300) {
          this.shells.splice(i, 1);
          if (s.y < WORLD_H) this.puff(s.x, Math.min(s.y, terrainHeight(s.x)), '#a8a29e', 8);
        }
      } else {
        this.stepBattleShell(i, s);
      }
    }
  }

  private hitBox(p: RPlayer, box: Box) {
    this.boxes = this.boxes.filter((b) => b.id !== box.id);
    for (const q of this.players) if (q.selectedBoxId === box.id) q.selectedBoxId = null;
    const t = TIERS[box.tier];
    this.burst(box.x, box.y, t.color, ['🎁', '✨', '⭐'], 22, 7);
    this.ring(box.x, box.y, 6, 70, t.color, 28);
    this.kick(5);
    this.sfx('boxhit');
    p.charging = false;
    p.charge = 0;
    p.status = 'answering';
    if (this.cturn) {
      this.cturn.step = 'quiz';
      this.cturn.box = box;
    }

    if (!p.isBot) {
      this.openQuiz(p.idx, 'collect', box.tier, t.question);
    } else {
      p.botAskedAt = this.time;
      p.botAnswerAt = this.time + rand(...BOT_THINK_MS);
      p.botAnswerTier = box.tier;
      p.lastAction = undefined;
    }
    this.emit();
  }

  private checkCollectEnd() {
    if (this.phase !== 'collect') return;
    if (this.players.some((p) => p.weapons.length >= WEAPONS_TO_WIN)) this.beginFinishing('full');
  }

  private endCollect(reason: 'time' | 'full') {
    this.endReason = reason;
    this.cturn = null;
    this.shells = this.shells.filter((s) => s.kind !== 'collect');
    this.players.forEach((p) => {
      p.charging = false;
      p.charge = 0;
      p.collected = p.weapons.length;
      if (p.status === 'answering') p.status = 'idle';
      const byTier = { white: 0, blue: 0, red: 0 };
      p.weapons.forEach((o) => byTier[o.tier]++);
      this.stats[p.idx].collected = byTier;
    });
    this.banner = {
      text: reason === 'time' ? 'HẾT GIỜ!' : 'ĐÃ ĐỦ 7 VŨ KHÍ!',
      sub: 'Chuẩn bị sắp xếp vũ khí ra trận...',
      color: '#fbbf24',
      until: this.time + 2800,
    };
    this.setPhase('timeup');
  }

  // ---- boxes
  private fillBoxes(initial = false) {
    (Object.keys(this.boxTarget) as Tier[]).forEach((tier) => {
      for (let i = 0; i < this.boxTarget[tier]; i++) this.spawnBox(tier);
    });
    if (initial) this.respawn = [];
  }

  /** The tier most below its quota (boxes on the map + already queued), so the 1-2 / 1-2 / rest mix is kept. */
  private nextBoxTier(): Tier {
    const have: Record<Tier, number> = { white: 0, blue: 0, red: 0 };
    this.boxes.forEach((b) => have[b.tier]++);
    this.respawn.forEach((r) => have[r.tier]++);
    const missing = (['red', 'blue', 'white'] as Tier[]).filter((t) => have[t] < this.boxTarget[t]);
    return missing.length ? missing[0] : 'white';
  }

  private stepRespawn() {
    for (let i = this.respawn.length - 1; i >= 0; i--) {
      if (this.time >= this.respawn[i].at) {
        this.spawnBox(this.respawn[i].tier, this.respawn[i].avoid);
        this.respawn.splice(i, 1);
      }
    }
  }

  private spawnBox(tier: Tier, avoid?: { x: number; y: number }) {
    for (let attempt = 0; attempt < 80; attempt++) {
      let x: number;
      let y: number;
      if (tier === 'white') {
        // on the ground (sitting on the surface, never buried)
        x = rand(BOX_EDGE_MARGIN, WORLD_W - BOX_EDGE_MARGIN);
        y = terrainHeight(x) - BOX_RADIUS - 4;
      } else if (tier === 'blue') {
        // floating mid-air
        x = rand(BOX_EDGE_MARGIN, WORLD_W - BOX_EDGE_MARGIN);
        y = terrainHeight(x) - rand(150, 270);
      } else {
        // very high (never hugging the map edge: the corners of the screen hold the HUD)
        x = rand(BOX_EDGE_MARGIN, WORLD_W - BOX_EDGE_MARGIN);
        y = rand(BOX_TOP_MARGIN, BOX_TOP_MARGIN + 150);
      }
      if (y < BOX_TOP_MARGIN || terrainHeight(x) - y < (tier === 'white' ? 20 : 110)) continue;
      if (this.players.some((p) => !p.out && Math.abs(p.x - x) < 130 && Math.abs(p.y - y) < 220)) continue;
      if (this.boxes.some((b) => Math.hypot(b.x - x, b.y - y) < 120)) continue;
      if (avoid && Math.hypot(avoid.x - x, avoid.y - y) < 260) continue; // a wrong answer moves the box somewhere else
      // must be reachable by both shooters from where they stand now
      const reachable = this.players.filter((p) => !p.out).every((p) => {
        const facing: 1 | -1 = x >= p.x ? 1 : -1;
        return solveAimsExists(p.x, p.y, facing, this.wind, x, y);
      });
      if (!reachable) continue;
      this.boxes.push({ id: ++this.boxId, x, y, r: BOX_RADIUS, tier, phase: Math.random() * 6 });
      return;
    }
  }

  // ================================================================= ARRANGE
  private beginArrange() {
    this.banner = null;
    this.arrangeLeft = ARRANGE_MS;
    this.players.forEach((p) => {
      p.lineup = p.out ? [] : [...p.weapons];
      p.ready = false;
      p.upgradesLeft = UPGRADES_PER_PLAYER;
    });
    // bot: upgrades first (each attempt takes thinking time), then orders its weapons and gets ready
    this.players.filter((p) => p.isBot && !p.out).forEach((bot) => {
      bot.botAttempts = 0;
      bot.botUpgradeNext = this.time + rand(3000, 6000);
      bot.botReadyAt = Infinity;
      this.optimizeLineup(bot);
    });
    // keep the world tidy for the next screen
    this.boxes = [];
    this.respawn = [];
    this.shells = [];
    this.setPhase('arrange');
  }

  /** Total expected power of the first MAX_LINEUP weapons, counting the cumulative tương sinh chains. */
  lineupValue(list: OwnedWeapon[]): number {
    let total = 0;
    list.slice(0, MAX_LINEUP).forEach((ow, i) => {
      total += weaponScore(ow) * (1 + sinhBonusAt(list, i));
    });
    return total;
  }

  private optimizeLineup(p: RPlayer) {
    p.lineup.sort((a, b) => weaponScore(b) - weaponScore(a));
    let best = this.lineupValue(p.lineup);
    for (let i = 0; i < 300; i++) {
      const a = randInt(0, p.lineup.length - 1);
      const b = randInt(0, p.lineup.length - 1);
      if (a === b) continue;
      [p.lineup[a], p.lineup[b]] = [p.lineup[b], p.lineup[a]];
      const v = this.lineupValue(p.lineup);
      if (v > best) best = v;
      else [p.lineup[a], p.lineup[b]] = [p.lineup[b], p.lineup[a]];
    }
  }

  private botUpgrade(bot: RPlayer) {
    bot.botAttempts++;
    this.stats[bot.idx].opened++;
    this.stats[bot.idx].upgradeTries++;
    const cands = bot.lineup.filter((o) => nextTier(o.tier));
    if (cands.length === 0) {
      bot.upgradesLeft = 0;
      return;
    }
    const w = cands[randInt(0, cands.length - 1)];
    const correct = Math.random() < BOT_LEVELS[this.botLevel].correct;
    const info = WEAPON_BY_ID[w.weaponId];
    if (correct) {
      this.stats[bot.idx].correct++;
      this.stats[bot.idx].upgradeOk++;
      w.tier = nextTier(w.tier)!;
      this.addFloater(bot.x, bot.y - 90, `⬆ ${info.icon} ${TIERS[w.tier].label}`, TIERS[w.tier].color, 18, 100);
      this.burst(bot.x, bot.y - 40, TIERS[w.tier].color, ['✨', '⭐'], 14, 5);
      this.optimizeLineup(bot);
    } else {
      this.addFloater(bot.x, bot.y - 90, '✘ Nâng cấp thất bại', '#f87171', 15, 80);
    }
    bot.upgradesLeft = Math.max(0, bot.upgradesLeft - 1); // a failed attempt costs the turn too
    bot.botUpgradeNext = this.time + rand(5000, 10000);
    this.emit();
  }

  private stepArrange() {
    this.arrangeLeft -= STEP_MS;
    for (const bot of this.players.filter((q) => q.isBot && !q.out)) {
      if (bot.ready) continue;
      if (bot.upgradesLeft > 0 && bot.botAttempts < 6) {
        if (this.time >= bot.botUpgradeNext) this.botUpgrade(bot);
      } else if (bot.botReadyAt === Infinity) {
        bot.botReadyAt = this.time + rand(1500, 3500);
      }
      if (this.time >= bot.botReadyAt) {
        bot.ready = true;
        this.emit();
      }
    }
    if (this.arrangeLeft <= 0) {
      this.arrangeLeft = 0;
      this.startBattle();
      return;
    }
    if (this.players.every((p) => p.ready || p.out)) this.startBattle();
  }

  // ================================================================= BATTLE
  private startBattle() {
    if (this.phase === 'battle') return;
    this.quizzes = this.players.map(() => null); // an upgrade question still open when the battle begins is dropped
    const n = this.players.length;
    const perTeam = n / 2;
    // the teams stand a bit apart; with more fighters per team they squeeze together (1v1: 330 / 1080 as always)
    const spacing = perTeam > 1 ? Math.min(170, 300 / (perTeam - 1)) : 0;
    this.players.forEach((p) => {
      this.clearInput(p.idx);
      const team = teamOf(p.idx);
      const k = Math.floor(p.idx / 2);
      p.x = team === 0 ? 330 + k * spacing : 1080 - k * spacing;
      p.facing = team === 0 ? 1 : -1;
      p.y = groundY(p.x);
      p.status = 'idle';
      p.charging = false;
      p.lastAction = undefined;
      p.lastWeaponIdx = -1;
      p.angle = 65;
      p.shield = 0;
      p.weaken = 0;
      p.empower = 0;
      p.reviveUsed = false;
      if (p.out) {
        // gone before the battle: counts as knocked out from the start
        p.lineup = [];
        p.hp = 0;
        return;
      }
      // nobody leaves with empty hands
      if (p.lineup.length === 0) {
        p.lineup = [makeOwned('dep_tong', 'white')];
        this.notice = `${p.name} không thu thập được vũ khí nào nên nhận 1 Dép Tông cứu trợ.`;
      }
      p.lineup = p.lineup.slice(0, MAX_LINEUP);
      p.hp = p.maxHp;
    });
    // the seat that collected the fewest weapons shoots first (ties: random); everybody follows in seat order, so the teams alternate
    const live = this.players.filter((p) => !p.out);
    const fewest = Math.min(...live.map((p) => p.collected));
    const cands = live.filter((p) => p.collected === fewest);
    const first: Seat = cands[randInt(0, cands.length - 1)].idx;
    this.battle = {
      rounds: Math.max(...live.map((p) => p.lineup.length)),
      round: 0,
      turnInRound: 0,
      order: this.players.map((_, i) => (first + i) % n),
      step: 'announce',
      stepT: 0,
      turn: null,
      wind: this.wind,
    };
    this.banner = {
      text: 'HIỆP 1',
      sub: `${this.players[first].name} ra đòn trước`,
      color: '#fbbf24',
      until: this.time + 1500,
    };
    this.setPhase('battle');
  }

  private isAlive(p: RPlayer) {
    return !p.out && p.hp > 0;
  }

  private teamAlive(team: Team) {
    return this.players.some((p) => teamOf(p.idx) === team && this.isAlive(p));
  }

  /** The foe this shooter aims at: the seat facing it; if that one is down, the living enemy with the least HP. */
  private pickTarget(shooter: RPlayer): RPlayer | null {
    const facing = this.players[oppositeSeat(shooter.idx)];
    if (facing && this.isAlive(facing)) return facing;
    const foes = this.players.filter((p) => teamOf(p.idx) !== teamOf(shooter.idx) && this.isAlive(p));
    return foes.length ? foes.reduce((a, b) => (b.hp < a.hp ? b : a)) : null;
  }

  private stepBattle() {
    const bt = this.battle!;
    bt.stepT += STEP_MS;
    this.stepDots();
    this.stepShells();

    switch (bt.step) {
      case 'announce':
        if (bt.stepT >= 1500) this.beginTurn();
        break;
      case 'gap':
        if (bt.stepT >= 450) this.beginTurn();
        break;
      case 'charge':
        this.stepCharge();
        break;
      case 'flight':
        this.stepFlight();
        break;
      case 'impact':
        if (bt.stepT >= bt.turn!.impactMs && this.time >= bt.turn!.dotsEndAt) this.endTurn();
        break;
      case 'ko': {
        const over = !this.teamAlive(0) || !this.teamAlive(1);
        if (bt.stepT >= (over ? 2200 : 1500)) this.afterKo();
        break;
      }
    }
  }

  private beginTurn() {
    const bt = this.battle!;
    // the next seat that still stands and still has a weapon for this round (downed / gone seats are skipped)
    for (;;) {
      const down0 = !this.teamAlive(0);
      const down1 = !this.teamAlive(1);
      if (down0 || down1) {
        this.finishBattle(down0 && down1 ? null : down0 ? 1 : 0, 'ko');
        return;
      }
      if (bt.round >= bt.rounds) {
        this.finishBattle(null, 'rounds');
        return;
      }
      const s = this.players[bt.order[bt.turnInRound]];
      if (this.isAlive(s) && s.lineup[bt.round]) break;
      this.advanceTurnCounter();
    }
    const shooterIdx = bt.order[bt.turnInRound];
    const shooter = this.players[shooterIdx];
    const target = this.pickTarget(shooter)!;
    const ow = shooter.lineup[bt.round];
    const w = WEAPON_BY_ID[ow.weaponId];
    const tier = TIERS[ow.tier];
    shooter.lastWeaponIdx = bt.round;
    this.sfx('turn');
    bt.wind = Number(rand(-3, 3).toFixed(1));
    this.wind = bt.wind;

    // buffs captured for this turn, then consumed
    const turn: Turn = {
      shooter: shooterIdx,
      target: target.idx,
      ow,
      w,
      queue: [],
      spawned: 0,
      ended: 0,
      dealt: 0,
      hitCount: 0,
      empower: shooter.empower,
      weaken: shooter.weaken,
      shieldOnTarget: target.shield,
      raw: 0,
      sinh: false,
      khac: false,
      boost: 1,
      sinhBonus: 0,
      sameBonus: 0,
      impactMs: 900,
      dotsEndAt: 0,
    };
    shooter.empower = 0;
    shooter.weaken = 0;
    target.shield = 0;
    const prev = bt.round > 0 ? shooter.lineup[bt.round - 1] : undefined;
    turn.sinhBonus = sinhBonusAt(shooter.lineup, bt.round);
    turn.sameBonus = sameBonusAt(shooter.lineup, bt.round);
    turn.sinh = turn.sinhBonus > 0;
    const foeWeapon = target.lineup[bt.round]; // the weapon of the same round of the foe we face (normally the seat opposite)
    turn.khac = !!foeWeapon && isKhac(foeWeapon.element, ow.element);
    turn.boost = (1 + turn.sinhBonus) * (turn.khac ? 1 - KHAC_PENALTY : 1);
    turn.raw =
      w.base * tier.damageMult * (shooter.stats.attack / 1000) * DAMAGE_K * (1 + turn.empower) * (1 - turn.weaken) * turn.boost;

    shooter.facing = target.x >= shooter.x ? 1 : -1;
    shooter.angle = 65;
    bt.turn = turn;
    bt.step = 'charge';
    bt.stepT = 0;
    this.sfx('chargeup');
    const el = ELEMENTS[ow.element];
    const notes: string[] = [];
    if (turn.sinh) notes.push(`${ELEMENTS[prev!.element].name} sinh ${el.name}: +${Math.round(turn.sinhBonus * 100)}%`);
    if (turn.sameBonus > 0) notes.push(`Cùng hệ ${el.name}: hiệu ứng +${Math.round(turn.sameBonus * 100)}%`);
    if (turn.khac) notes.push(`${ELEMENTS[foeWeapon!.element].name} khắc ${el.name}: -20%`);
    this.banner = {
      text: `${w.icon} ${w.name}`,
      sub: `${tier.label} · Hệ ${el.name}${notes.length ? ` · ${notes.join(' · ')}` : ''} · ${w.trait}`,
      color: tier.color,
      until: this.time + 1800,
    };
    if (turn.sinh) this.addFloater(shooter.x, shooter.y - 100, `${ELEMENTS[prev!.element].name} sinh ${el.name}  +${Math.round(turn.sinhBonus * 100)}%`, ELEMENTS[prev!.element].color, 20, 110);
    if (turn.sameBonus > 0) this.addFloater(shooter.x, shooter.y - 100 - (turn.sinh ? 28 : 0) - (turn.khac ? 28 : 0) - 28, `🔁 Cùng hệ ${el.name}  hiệu ứng +${Math.round(turn.sameBonus * 100)}%`, el.color, 18, 110);
    if (turn.khac) this.addFloater(shooter.x, shooter.y - (turn.sinh ? 128 : 100), `${ELEMENTS[foeWeapon!.element].name} khắc ${el.name}  -20%`, ELEMENTS[foeWeapon!.element].color, 20, 110);
    this.emit();
  }

  /** Weapon "power burst" before every launch: growing aura, shock-waves and flying sparks. */
  private stepCharge() {
    const bt = this.battle!;
    const t = bt.turn!;
    const sh = this.players[t.shooter];
    const k = clamp(bt.stepT / 1300, 0, 1);
    const tierColor = TIERS[t.ow.tier].color;

    if (Math.floor(bt.stepT / STEP_MS) % 4 === 0) {
      const a = Math.random() * Math.PI * 2;
      const d = 80 + Math.random() * 40;
      // particles spiral IN to the shooter while charging
      this.particle(
        sh.x + Math.cos(a) * d,
        sh.y - 20 + Math.sin(a) * d,
        -Math.cos(a) * (2 + k * 3),
        -Math.sin(a) * (2 + k * 3),
        Math.random() < 0.5 ? t.w.color : tierColor,
        rand(2, 5),
        22,
        Math.random() < 0.35 ? t.w.fx[randInt(0, t.w.fx.length - 1)] : undefined,
        0
      );
    }
    if (Math.floor(bt.stepT / STEP_MS) % 22 === 0) {
      this.ring(sh.x, sh.y - 20, 90, 8, t.w.color, 24);
    }
    this.kick(k * 3);

    if (bt.stepT >= 1300) {
      // BURST
      this.burst(sh.x, sh.y - 24, t.w.color, t.w.fx, 36, 9);
      this.ring(sh.x, sh.y - 24, 10, 150, tierColor, 30);
      this.ring(sh.x, sh.y - 24, 10, 100, t.w.color, 22);
      this.kick(9);
      this.sfx('power');
      this.launch(t);
      bt.step = 'flight';
      bt.stepT = 0;
    }
  }

  /** The system auto-aims: every shell lands on the opponent, each on its own arc. */
  private launch(t: Turn) {
    const bt = this.battle!;
    const sh = this.players[t.shooter];
    const tg = this.players[t.target];
    const tx = tg.x;
    const ty = tg.y - 12;
    const sols = solveAims(sh.x, sh.y, sh.facing, bt.wind, tx, ty, TARGET_HIT_R - 4);
    const n = t.w.hits.length;
    let picks: AimSolution[] = [];
    if (sols.length > 0) {
      if (n === 1) {
        // nicest arc: closest to 65deg, tie-broken by accuracy
        picks = [sols.reduce((a, b) => (Math.abs(b.angle - 65) + b.err * 0.2 < Math.abs(a.angle - 65) + a.err * 0.2 ? b : a))];
      } else {
        // spread different arcs across the available angles
        const sorted = [...sols].sort((a, b) => a.angle - b.angle);
        for (let i = 0; i < n; i++) {
          const idx = n === 1 ? 0 : Math.round((i * (sorted.length - 1)) / (n - 1));
          picks.push(sorted[Math.min(sorted.length - 1, idx)]);
        }
        // order by angle so the "fan" opens naturally
      }
    } else {
      picks = [{ angle: 65, power: 60, err: 999, hit: false }];
    }
    picks.forEach((sol, i) => {
      t.queue.push({
        at: i * t.w.stagger,
        angle: sol.angle,
        power: sol.power,
        share: t.w.hits[i % t.w.hits.length],
      });
    });
    sh.angle = picks[0].angle;
    sh.lastAction = t.w.name;
  }

  private stepFlight() {
    const bt = this.battle!;
    const t = bt.turn!;
    const sh = this.players[t.shooter];
    while (t.spawned < t.queue.length && bt.stepT >= t.queue[t.spawned].at) {
      const q = t.queue[t.spawned];
      const v = getInitialVelocity(q.angle, q.power, sh.facing);
      this.shells.push({
        id: ++this.shellId,
        owner: t.shooter,
        x: sh.x + sh.facing * 16,
        y: sh.y - 18,
        vx: v.vx,
        vy: v.vy,
        ammo: t.w.ammo,
        color: t.w.color,
        trail: [],
        kind: 'battle',
        share: q.share,
        blast: t.w.blast,
        weaponId: t.w.id,
        element: t.ow.element,
        legend: t.ow.tier === 'red',
        age: 0,
      });
      t.spawned++;
      this.sfx('shoot');
      this.burst(sh.x + sh.facing * 18, sh.y - 18, t.w.color, t.w.fx, 8, 4);
    }
    if (t.spawned >= t.queue.length && t.ended >= t.queue.length) this.resolveTurn(t);
  }

  private stepBattleShell(i: number, s: Shell) {
    const t = this.battle?.turn;
    if (!t) {
      this.shells.splice(i, 1);
      return;
    }
    const tg = this.players[t.target];
    const d = Math.hypot(s.x - tg.x, s.y - (tg.y - 12));
    const hitTarget = d < TARGET_HIT_R;
    if (hitTarget || isSolid(s.x, s.y) || s.y > WORLD_H + 40 || s.x < -300 || s.x > WORLD_W + 300) {
      this.shells.splice(i, 1);
      this.explodeBattleShell(t, s, hitTarget);
    }
  }

  private explodeBattleShell(t: Turn, s: Shell, hit: boolean) {
    const w = t.w;
    const sh = this.players[t.shooter];
    const tg = this.players[t.target];
    t.ended++;
    this.sfx(hit ? 'hitplayer' : w.blast >= 85 ? 'bigexplode' : 'explode');
    const ex = s.x;
    const ey = Math.min(s.y, terrainHeight(s.x));
    this.burst(ex, ey, w.color, w.fx, 20 + Math.round(w.blast / 6), 7);
    this.ring(ex, ey, 8, w.blast + 20, w.color, 24);
    this.kick(4 + w.blast / 14);
    if (!hit) {
      this.addFloater(ex, ey - 30, 'Trượt', '#94a3b8', 14, 50);
      return;
    }

    const tier = TIERS[t.ow.tier];
    let dmg = t.raw * s.share;
    if (w.effect === 'splash') dmg *= 1 + w.power * 0.3;
    let critChance = sh.stats.luck / (sh.stats.luck + 3000);
    let critMult = 1.5;
    if (w.effect === 'crit') {
      critChance += w.power * tier.effectMult;
      critMult = 2;
    }
    if (t.ow.element === 'kim') critChance += 0.15 * tier.effectMult;
    const isCrit = Math.random() < Math.min(0.85, critChance);
    if (isCrit) dmg *= critMult;
    const mitig = w.effect === 'pierce' ? 1 : 1 / (1 + tg.stats.defense / 4000);
    dmg *= mitig;
    dmg *= 1 - clamp(t.shieldOnTarget, 0, 0.85);
    const final = Math.max(25, Math.round(dmg));
    const lost = Math.min(tg.hp, final);
    tg.hp = Math.max(0, tg.hp - final);
    this.stats[t.shooter].damageDealt += lost;
    this.stats[t.target].damageTaken += lost;
    if (isCrit) this.stats[t.shooter].crits++;
    t.dealt += final;
    t.hitCount++;
    this.addFloater(
      tg.x + rand(-14, 14),
      tg.y - 55,
      isCrit ? `⚡ CHÍ MẠNG! -${final}` : `-${final}`,
      isCrit ? '#fbbf24' : '#f87171',
      isCrit ? 24 : 19,
      60
    );
  }

  private resolveTurn(t: Turn) {
    const bt = this.battle!;
    const sh = this.players[t.shooter];
    const tg = this.players[t.target];
    const w = t.w;
    const e = TIERS[t.ow.tier].effectMult * t.boost * (1 + t.sameBonus);
    const gain = (who: RPlayer, amount: number, label: string) => {
      const real = Math.min(who.maxHp - who.hp, Math.round(amount));
      if (real <= 0) return;
      who.hp += real;
      this.sfx('heal');
      this.addFloater(who.x, who.y - 75, `${label} +${real}`, '#4ade80', 18, 70);
      this.burst(who.x, who.y - 20, '#4ade80', ['💚', '✨'], 10, 3);
    };
    const landed = t.hitCount > 0;

    switch (w.effect) {
      case 'heal':
        gain(sh, sh.maxHp * w.power * e, '💚');
        break;
      case 'lifesteal':
        if (landed) gain(sh, t.dealt * w.power * e, '💖');
        break;
      case 'shield':
        sh.shield = clamp(w.power * e, 0, 0.8);
        this.addFloater(sh.x, sh.y - 75, `🛡️ Giáp -${Math.round(sh.shield * 100)}%`, '#7dd3fc', 17, 80);
        break;
      case 'empower':
        sh.empower = w.power * e;
        this.addFloater(sh.x, sh.y - 75, `🔋 +${Math.round(sh.empower * 100)}% đòn sau`, '#bef264', 17, 80);
        break;
      case 'freeze':
        if (landed) {
          tg.weaken = clamp(w.power * e, 0, 0.6);
          this.addFloater(tg.x, tg.y - 75, `❄️ Đóng băng -${Math.round(tg.weaken * 100)}%`, '#7dd3fc', 17, 80);
        }
        break;
      case 'burn':
        if (landed) {
          const total = (t.raw * w.power * e) / t.boost; // raw already carries the sinh boost (e carries the same-element bonus)
          const ticks = 3;
          for (let i = 1; i <= ticks; i++) {
            this.dots.push({ at: this.time + i * 480, target: tg.idx, amount: Math.max(10, Math.round(total / ticks)), src: sh.idx });
          }
          t.dotsEndAt = this.time + ticks * 480 + 150;
        }
        break;
      default:
        break;
    }
    // elemental perk (only when the weapon actually landed)
    if (landed) {
      const eMult = TIERS[t.ow.tier].effectMult * t.boost * (1 + t.sameBonus);
      switch (t.ow.element) {
        case 'moc':
          gain(sh, sh.maxHp * 0.03 * eMult, '🌿');
          break;
        case 'thuy':
          tg.weaken = Math.max(tg.weaken, clamp(0.1 * eMult, 0, 0.6));
          break;
        case 'hoa': {
          const total = t.raw * 0.12 * eMult;
          for (let i = 1; i <= 2; i++) {
            this.dots.push({ at: this.time + i * 480, target: tg.idx, amount: Math.max(8, Math.round(total / 2)), src: sh.idx });
          }
          t.dotsEndAt = Math.max(t.dotsEndAt, this.time + 2 * 480 + 150);
          break;
        }
        case 'tho':
          sh.shield = Math.max(sh.shield, clamp(0.15 * eMult, 0, 0.8));
          break;
        default:
          break;
      }
    }
    bt.step = 'impact';
    bt.stepT = 0;
  }

  private stepDots() {
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      if (this.time < d.at) continue;
      this.dots.splice(i, 1);
      const tg = this.players[d.target];
      if (tg.hp <= 0) continue;
      const lost = Math.min(tg.hp, d.amount);
      tg.hp = Math.max(0, tg.hp - d.amount);
      this.stats[d.src].damageDealt += lost;
      this.stats[d.target].damageTaken += lost;
      this.addFloater(tg.x + rand(-10, 10), tg.y - 50, `🔥 -${d.amount}`, '#fb923c', 16, 50);
      this.burst(tg.x, tg.y - 20, '#fb923c', ['🔥'], 5, 3);
    }
  }

  private endTurn() {
    const bt = this.battle!;
    const t = bt.turn!;
    const tg = this.players[t.target];
    this.dots = this.dots.filter(() => false);
    if (tg.hp <= 0) {
      // passive revive from the Easter egg (only if it made the lineup)
      const egg = !tg.reviveUsed ? tg.lineup.find((o) => o.weaponId === 'trung_phuc_sinh') : undefined;
      if (egg) {
        tg.reviveUsed = true;
        const pct = clamp(WEAPON_BY_ID.trung_phuc_sinh.power * TIERS[egg.tier].effectMult, 0.2, 0.7);
        tg.hp = Math.round(tg.maxHp * pct);
        this.addFloater(tg.x, tg.y - 90, `🥚 PHỤC SINH! ${tg.hp} HP`, '#fde68a', 24, 100);
        this.burst(tg.x, tg.y - 20, '#fde68a', ['🥚', '🐣', '✨', '💛'], 34, 8);
        this.ring(tg.x, tg.y - 20, 8, 160, '#fde68a', 34);
        this.banner = { text: '🥚 PHỤC SINH!', sub: `${tg.name} hồi sinh với ${Math.round(pct * 100)}% máu`, color: '#fde68a', until: this.time + 1800 };
      } else {
        // knockout: the winner taunts for a moment (the whole match ends only when a team has nobody standing)
        const winner = this.players[t.shooter];
        const lines = ['Knockout nè!', 'Kết thúc!', 'Xem ta đây!'];
        winner.speech = { text: lines[randInt(0, lines.length - 1)], until: this.time + 2400 };
        this.burst(tg.x, tg.y - 20, TIERS[t.ow.tier].color, t.w.fx, 40, 10);
        this.ring(tg.x, tg.y - 20, 10, 180, '#ffffff', 36);
        this.kick(12);
        this.banner = { text: 'KNOCKOUT!', sub: `${winner.name} hạ gục ${tg.name}`, color: '#fbbf24', until: this.time + 2200 };
        bt.step = 'ko';
        bt.stepT = 0;
        return;
      }
    }
    this.nextTurn();
  }

  /** Someone was knocked out: the match is over when a whole team is down, otherwise the turns go on. */
  private afterKo() {
    const down0 = !this.teamAlive(0);
    const down1 = !this.teamAlive(1);
    if (down0 || down1) {
      this.finishBattle(down0 && down1 ? null : down0 ? 1 : 0, 'ko');
      return;
    }
    this.nextTurn();
  }

  private nextTurn() {
    const bt = this.battle!;
    bt.turn = null;
    this.advanceTurnCounter();
    if (bt.round >= bt.rounds) {
      this.finishBattle(null, 'rounds');
      return;
    }
    if (bt.turnInRound === 0) {
      this.banner = {
        text: `HIỆP ${bt.round + 1}`,
        sub: `${this.players[bt.order[0]].name} ra đòn trước`,
        color: '#fbbf24',
        until: this.time + 1500,
      };
      bt.step = 'announce';
    } else {
      bt.step = 'gap';
    }
    bt.stepT = 0;
  }

  private advanceTurnCounter() {
    const bt = this.battle;
    if (!bt) return;
    bt.turnInRound++;
    if (bt.turnInRound >= bt.order.length) {
      bt.turnInRound = 0;
      bt.round++;
    }
  }

  /** winner = winning TEAM (ignored for 'rounds': the team with the higher share of its total max HP left wins) */
  private finishBattle(winner: Team | null, reason: 'ko' | 'rounds') {
    let w = winner;
    if (reason === 'rounds') {
      const share = (team: Team) => {
        const mine = this.players.filter((p) => teamOf(p.idx) === team);
        return mine.reduce((a, p) => a + Math.max(0, p.hp), 0) / mine.reduce((a, p) => a + p.maxHp, 0);
      };
      const ra = share(0);
      const rb = share(1);
      w = Math.abs(ra - rb) < 0.0005 ? null : ra > rb ? 0 : 1;
    }
    this.result = { winner: w, reason };
    this.sfx('win');
    this.banner = null;
    this.setPhase('result');
  }

  // ================================================================= FX
  private stepFx() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life++;
      if (p.life >= p.max) this.particles.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life++;
      if (r.life >= r.max) this.rings.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.y -= 0.9;
      f.life++;
      if (f.life >= f.max) this.floaters.splice(i, 1);
    }
  }

  // ================================================================= SNAPSHOT (server -> client replica)
  /** State for one seat: no answers, no opponent line-up while arranging, nothing the client could cheat with. */
  snapshot(seat: Seat): Snapshot {
    const hideFoe = this.phase === 'arrange';
    const pub = (p: RPlayer): PublicPlayer => {
      // the enemy team's weapons / lineup stay secret while arranging; teammates see each other
      const hidden = hideFoe && teamOf(p.idx) !== teamOf(seat);
      return {
        idx: p.idx,
        name: p.name,
        isBot: p.isBot,
        x: p.x,
        y: p.y,
        facing: p.facing,
        angle: p.angle,
        avatarColor: p.avatarColor,
        stats: p.stats,
        hp: p.hp,
        maxHp: p.maxHp,
        weapons: hidden ? [] : p.weapons,
        collected: p.collected,
        lineup: hidden ? [] : p.lineup,
        ready: p.ready,
        status: p.status,
        frozenUntil: p.frozenUntil,
        charging: p.charging,
        charge: p.charge,
        chargeDir: p.chargeDir,
        cooldownUntil: p.cooldownUntil,
        shield: p.shield,
        weaken: p.weaken,
        empower: p.empower,
        lastWeaponIdx: p.lastWeaponIdx,
        upgradesLeft: p.upgradesLeft,
        lastAction: p.lastAction,
        speech: p.speech,
        reaction: p.reaction,
        strikes: p.strikes,
        alert: p.idx === seat ? p.alert : undefined,
        selectedBoxId: p.idx === seat ? p.selectedBoxId : null,
        away: p.away,
        out: p.out,
      };
    };
    const qz = this.quizzes[seat];
    const bt = this.battle;
    return {
      time: this.time,
      phase: this.phase,
      phaseT: this.phaseT,
      teamLeft: [this.teamLeft[0], this.teamLeft[1]],
      collectLeft: Math.max(this.teamLeft[0], this.teamLeft[1]),
      arrangeLeft: this.arrangeLeft,
      wind: this.wind,
      players: this.players.map(pub),
      boxes: this.boxes,
      shells: this.shells.map((sh) => ({
        id: sh.id,
        owner: sh.owner,
        x: sh.x,
        y: sh.y,
        vx: sh.vx,
        vy: sh.vy,
        ammo: sh.ammo,
        color: sh.color,
        kind: sh.kind,
        share: sh.share,
        blast: sh.blast,
        weaponId: sh.weaponId,
        element: sh.element,
        legend: sh.legend,
        age: sh.age,
      })),
      banner: this.banner,
      cturn: this.cturn,
      endReason: this.endReason,
      result: this.result,
      notice: this.notice,
      battle: bt
        ? {
            rounds: bt.rounds,
            round: bt.round,
            turnInRound: bt.turnInRound,
            order: bt.order,
            step: bt.step,
            stepT: bt.stepT,
            wind: bt.wind,
            turn: bt.turn
              ? { shooter: bt.turn.shooter, target: bt.turn.target, ow: bt.turn.ow, sinh: bt.turn.sinh, khac: bt.turn.khac, boost: bt.turn.boost, sinhBonus: bt.turn.sinhBonus, sameBonus: bt.turn.sameBonus }
              : null,
          }
        : null,
      quiz: qz ? { ...qz, question: { ...qz.question, correctIndex: -1 } } : null,
      stats: this.phase === 'result' ? this.stats : null,
    };
  }

  /** Client replica: take the server state; positions are eased in stepReplica, shells keep their local trail. */
  applySnapshot(s: Snapshot, mySeat: Seat) {
    const phaseChanged = s.phase !== this.phase;
    const hadQuiz = !!this.quizzes[mySeat];
    this.mySeat = mySeat;
    this.time = s.time;
    this.phase = s.phase;
    this.phaseT = s.phaseT;
    this.teamLeft = Array.isArray(s.teamLeft) && s.teamLeft.length === 2 ? [s.teamLeft[0], s.teamLeft[1]] : [s.collectLeft, s.collectLeft];
    this.arrangeLeft = s.arrangeLeft;
    this.wind = s.wind;
    this.boxes = s.boxes;
    this.banner = s.banner;
    this.cturn = s.cturn;
    this.endReason = s.endReason;
    this.result = s.result;
    this.notice = s.notice;
    if (s.stats) this.stats = s.stats;
    s.players.forEach((pp, i) => {
      const p = this.players[i];
      const keep = { x: p.x, y: p.y };
      const first = this.smooth[i].x === 0;
      const mine = i === mySeat;
      const local = mine ? { angle: p.angle, charge: p.charge, dir: p.chargeDir } : null;
      Object.assign(p, pp);
      p.reaction = pp.reaction;
      if (local) {
        // my own aim is predicted locally: smooth, and it is exactly what I see when I fire
        if (this.canAim(i)) {
          if (Math.abs(pp.angle - local.angle) < 8) p.angle = local.angle;
          if (this.localChargeSince !== null && this.time - this.localChargeSince < HOLD_LIMIT_MS) {
            p.charging = true;
            p.charge = local.charge;
            p.chargeDir = local.dir;
          } else this.localChargeSince = null;
        } else this.localChargeSince = null;
        if (this.time < this.localReleaseUntil && pp.charging) {
          p.charging = false;
          p.charge = 0;
        }
      }
      this.smooth[i] = { x: pp.x, y: pp.y };
      const far = first || Math.abs(pp.x - keep.x) > 90;
      if (!far) {
        p.x = keep.x;
        p.y = keep.y;
      }
    });
    const old = new Map(this.shells.map((sh) => [sh.id, sh]));
    this.shells = s.shells.map((sh) => {
      const prev = old.get(sh.id);
      if (prev) {
        prev.x = sh.x;
        prev.y = sh.y;
        prev.vx = sh.vx;
        prev.vy = sh.vy;
        return prev;
      }
      return { ...sh, trail: [] };
    });
    this.battle = s.battle
      ? {
          ...s.battle,
          turn: s.battle.turn
            ? {
                ...s.battle.turn,
                w: WEAPON_BY_ID[s.battle.turn.ow.weaponId],
                queue: [],
                spawned: 0,
                ended: 0,
                dealt: 0,
                hitCount: 0,
                empower: 0,
                weaken: 0,
                shieldOnTarget: 0,
                raw: 0,
                impactMs: 0,
                dotsEndAt: 0,
              }
            : null,
        }
      : null;
    this.quizzes = this.players.map(() => null);
    this.quizzes[mySeat] = s.quiz;
    if (phaseChanged || hadQuiz !== !!s.quiz) this.emit();
  }

  private stepReplica() {
    this.time += STEP_MS;
    this.phaseT += STEP_MS;
    if (this.battle) this.battle.stepT += STEP_MS;
    this.stepFx();
    this.players.forEach((p, i) => {
      const t = this.smooth[i];
      p.x += (t.x - p.x) * 0.35;
      p.y += (t.y - p.y) * 0.35;
      if (p.charging) advanceCharge(p);
      if (i === this.mySeat && this.canAim(i)) {
        // predict my own angle from my own keys (same rate as the server)
        const dt = STEP_MS / 1000;
        if (p.input.up) p.angle = clamp(p.angle + 40 * dt, 0, 90);
        if (p.input.down) p.angle = clamp(p.angle - 40 * dt, 0, 90);
      }
    });
    for (const sh of this.shells) {
      const n = stepPhysics(sh.x, sh.y, sh.vx, sh.vy, this.wind);
      sh.x = n.x;
      sh.y = n.y;
      sh.vx = n.vx;
      sh.vy = n.vy;
      sh.age++;
      sh.trail.push({ x: sh.x, y: sh.y });
      if (sh.trail.length > 16) sh.trail.shift();
    }
  }

  private fxOut(ev: FxEvent) {
    if (this.events.length < 400) this.events.push(ev);
  }

  /** Server mode: effects since the last call (sent to the clients, who spawn the particles themselves). */
  drainEvents(): FxEvent[] {
    if (this.events.length === 0) return this.events;
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Client replica: play one effect event coming from the server. */
  applyFx(ev: FxEvent) {
    const n = (i: number) => ev[i] as number;
    switch (ev[0]) {
      case 'p':
        this.addParticle(n(1), n(2), n(3), n(4), ev[5] as string, n(6), n(7), ev[8] as string | undefined, n(9));
        break;
      case 'b':
        this.burst(n(1), n(2), ev[3] as string, ev[4] as string[], n(5), n(6));
        break;
      case 'u':
        this.puff(n(1), n(2), ev[3] as string, n(4));
        break;
      case 'r':
        this.ring(n(1), n(2), n(3), n(4), ev[5] as string, n(6));
        break;
      case 'f':
        this.addFloater(n(1), n(2), ev[3] as string, ev[4] as string, n(5), n(6));
        break;
      case 'k':
        this.kick(n(1));
        break;
      case 's':
        this.sfx(ev[1] as string);
        break;
    }
  }

  private addParticle(x: number, y: number, vx: number, vy: number, color: string, size: number, max: number, emoji?: string, gravity = 0.12) {
    if (this.particles.length > 600) return;
    this.particles.push({ x, y, vx, vy, life: 0, max, color, size, emoji, gravity });
  }

  private particle(x: number, y: number, vx: number, vy: number, color: string, size: number, max: number, emoji?: string, gravity = 0.12) {
    if (this.emitFx) this.fxOut(['p', x, y, vx, vy, color, size, max, emoji, gravity]);
    else this.addParticle(x, y, vx, vy, color, size, max, emoji, gravity);
  }

  private ring(x: number, y: number, r: number, maxR: number, color: string, max: number) {
    if (this.emitFx) this.fxOut(['r', x, y, r, maxR, color, max]);
    else this.rings.push({ x, y, r, maxR, color, life: 0, max });
  }

  private kick(v: number) {
    if (this.emitFx) this.fxOut(['k', v]);
    else this.shake = Math.max(this.shake, v);
  }

  private puff(x: number, y: number, color: string, n: number) {
    if (this.emitFx) {
      this.fxOut(['u', x, y, color, n]);
      return;
    }
    for (let i = 0; i < n; i++) this.addParticle(x, y, rand(-2.5, 2.5), rand(-3.5, 0), color, rand(2, 4), 22);
  }

  private burst(x: number, y: number, color: string, emojis: string[], n: number, speed: number) {
    if (this.emitFx) {
      this.fxOut(['b', x, y, color, emojis, n, speed]);
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1, speed);
      const useEmoji = emojis.length > 0 && Math.random() < 0.4;
      this.addParticle(
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp - 1.5,
        color,
        rand(2, 5),
        rand(22, 44),
        useEmoji ? emojis[randInt(0, emojis.length - 1)] : undefined,
        0.16
      );
    }
  }

  addFloater(x: number, y: number, text: string, color: string, size: number, max: number) {
    if (this.emitFx) this.fxOut(['f', x, y, text, color, size, max]);
    else this.floaters.push({ x, y, text, color, size, life: 0, max });
  }
}

/** Is there at least one hitting shot at this point? (used when placing boxes) */
function solveAimsExists(sx: number, sy: number, facing: 1 | -1, wind: number, tx: number, ty: number): boolean {
  for (let angle = 20; angle <= 86; angle += 2) {
    let lastErr = Infinity;
    for (let p = 10; p <= 100; p += 2) {
      const r = simShot(sx, sy, facing, angle, p, wind, tx, ty, BOX_HIT_R);
      if (r.hit) return true;
      lastErr = r.err;
    }
    void lastErr;
  }
  return false;
}

/** Brute-force the lineup: most "tương sinh" links in the battle slots first, then highest total power. */
export function bestSinhOrder(list: OwnedWeapon[]): OwnedWeapon[] {
  const n = list.length;
  const used = new Array(n).fill(false);
  const cur: OwnedWeapon[] = [];
  let best: { order: OwnedWeapon[]; links: number; value: number } | null = null;
  const slots = Math.min(MAX_LINEUP, n);
  const evaluate = () => {
    let links = 0;
    let value = 0;
    for (let i = 0; i < slots; i++) {
      if (i > 0 && isSinh(cur[i - 1].element, cur[i].element)) links++;
      value += weaponScore(cur[i]) * (1 + sinhBonusAt(cur, i));
    }
    if (!best || links > best.links || (links === best.links && value > best.value)) {
      best = { order: [...cur], links, value };
    }
  };
  const rec = () => {
    if (cur.length === slots) {
      evaluate();
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(list[i]);
      rec();
      cur.pop();
      used[i] = false;
    }
  };
  rec();
  const order = best!.order;
  // benched weapons keep their relative order behind the lineup
  return [...order, ...list.filter((o) => !order.includes(o))];
}
