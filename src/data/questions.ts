// Temporary question bank (multiple choice A/B/C/D). Difficulty is tied to the gift box color:
// white (VIP) = easy, blue (WOW) = medium, red (LEGEND) = hard. Geography demo set. The first option listed is the correct one; choices are shuffled when asked.

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  difficulty: Difficulty;
  text: string;
  /** options[0] is the correct answer in the bank; shuffled at ask time */
  options: [string, string, string, string];
}

export interface AskedQuestion {
  id: string;
  difficulty: Difficulty;
  text: string;
  options: string[];
  correctIndex: number;
}

const q = (id: string, difficulty: Difficulty, text: string, options: [string, string, string, string]): Question => ({
  id,
  difficulty,
  text,
  options,
});

export const DEFAULT_BANK: Question[] = [
  // ---- EASY (VIP / white boxes, on the ground) — Địa lý
  q('e1', 'easy', 'Thủ đô của Việt Nam là thành phố nào?', ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Huế']),
  q('e2', 'easy', 'Đại dương nào lớn nhất thế giới?', ['Thái Bình Dương', 'Đại Tây Dương', 'Ấn Độ Dương', 'Bắc Băng Dương']),
  q('e3', 'easy', 'Châu lục nào lớn nhất thế giới?', ['Châu Á', 'Châu Phi', 'Châu Mỹ', 'Châu Âu']),
  q('e4', 'easy', 'Quốc gia nào có diện tích lớn nhất thế giới?', ['Nga', 'Canada', 'Trung Quốc', 'Hoa Kỳ']),
  q('e5', 'easy', 'Ngọn núi cao nhất Việt Nam là núi nào?', ['Fansipan', 'Bà Đen', 'Langbiang', 'Yên Tử']),
  q('e6', 'easy', 'Việt Nam nằm ở châu lục nào?', ['Châu Á', 'Châu Âu', 'Châu Phi', 'Châu Đại Dương']),
  q('e7', 'easy', 'Hoang mạc nóng lớn nhất thế giới là hoang mạc nào?', ['Sahara', 'Gobi', 'Kalahari', 'Atacama']),

  // ---- MEDIUM (WOW / blue boxes, mid-air)
  q('m1', 'medium', 'Thủ đô của nước Úc là thành phố nào?', ['Canberra', 'Sydney', 'Melbourne', 'Perth']),
  q('m2', 'medium', 'Vịnh Hạ Long thuộc tỉnh nào của Việt Nam?', ['Quảng Ninh', 'Hải Phòng', 'Thanh Hóa', 'Nghệ An']),
  q('m3', 'medium', 'Con sông nào dài nhất châu Âu?', ['Volga', 'Danube', 'Rhine', 'Seine']),
  q('m4', 'medium', 'Thành phố nào đông dân nhất Việt Nam?', ['TP. Hồ Chí Minh', 'Hà Nội', 'Hải Phòng', 'Cần Thơ']),
  q('m5', 'medium', 'Lãnh thổ của quốc gia nào có hình chiếc ủng?', ['Ý', 'Hy Lạp', 'Tây Ban Nha', 'Bồ Đào Nha']),
  q('m6', 'medium', 'Eo biển nào ngăn cách châu Á và Bắc Mỹ?', ['Eo biển Bering', 'Eo biển Malacca', 'Eo biển Gibraltar', 'Eo biển Hormuz']),
  q('m7', 'medium', 'Thủ đô của Canada là thành phố nào?', ['Ottawa', 'Toronto', 'Vancouver', 'Montreal']),
  q('m8', 'medium', 'Đỉnh núi cao nhất thế giới là đỉnh nào?', ['Everest', 'K2', 'Kilimanjaro', 'Mont Blanc']),

  // ---- HARD (LEGEND / red boxes, high up / at the edges)
  q('h1', 'hard', 'Hồ nước ngọt sâu nhất thế giới là hồ nào?', ['Hồ Baikal', 'Hồ Superior', 'Hồ Victoria', 'Hồ Tanganyika']),
  q('h2', 'hard', 'Quốc gia nào có nhiều đảo nhất thế giới?', ['Thụy Điển', 'Indonesia', 'Philippines', 'Nhật Bản']),
  q('h3', 'hard', 'Thủ đô của Thổ Nhĩ Kỳ là thành phố nào?', ['Ankara', 'Istanbul', 'Izmir', 'Bursa']),
  q('h4', 'hard', 'Con sông nào chảy qua nhiều quốc gia nhất châu Âu?', ['Danube', 'Rhine', 'Volga', 'Elbe']),
  q('h5', 'hard', 'Nơi thấp nhất trên bề mặt đất liền của Trái Đất là?', ['Biển Chết', 'Thung lũng Chết', 'Hồ Assal', 'Vùng trũng Qattara']),
  q('h6', 'hard', 'Thủ đô hiện nay của Myanmar là thành phố nào?', ['Naypyidaw', 'Yangon', 'Mandalay', 'Bago']),
  q('h7', 'hard', 'Dãy núi nào dài nhất thế giới trên đất liền?', ['Andes', 'Himalaya', 'Rocky', 'Alps']),
];

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------- active bank (default or imported from CSV)
const STORAGE_KEY = 'cangoctoado_question_bank_v1';

let activeBank: Question[] = DEFAULT_BANK;
let custom = false;

const isValidBank = (v: unknown): v is Question[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every(
    (x) =>
      x &&
      typeof x.text === 'string' &&
      ['easy', 'medium', 'hard'].includes(x.difficulty) &&
      Array.isArray(x.options) &&
      x.options.length === 4 &&
      x.options.every((o: unknown) => typeof o === 'string')
  );

try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (isValidBank(parsed)) {
      activeBank = parsed;
      custom = true;
    }
  }
} catch {
  /* ignore broken storage */
}

export const getActiveBank = () => activeBank;
export const isCustomBank = () => custom;

export function bankStats(bank: Question[] = activeBank): Record<Difficulty, number> {
  return {
    easy: bank.filter((x) => x.difficulty === 'easy').length,
    medium: bank.filter((x) => x.difficulty === 'medium').length,
    hard: bank.filter((x) => x.difficulty === 'hard').length,
  };
}

/** Replace the default bank with an imported one (kept in this browser's localStorage). */
export function setCustomBank(bank: Question[]) {
  activeBank = bank;
  custom = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
  } catch {
    /* storage full / blocked: still active for this session */
  }
}

export function resetBank() {
  activeBank = DEFAULT_BANK;
  custom = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Picks a question of the given difficulty from a bank (avoiding recently used ones) and shuffles its options. */
export function askFromBank(bank: Question[], difficulty: Difficulty, usedIds: Set<string>): AskedQuestion {
  let pool = bank.filter((x) => x.difficulty === difficulty);
  if (pool.length === 0) pool = DEFAULT_BANK.filter((x) => x.difficulty === difficulty); // safety net
  let fresh = pool.filter((x) => !usedIds.has(x.id));
  if (fresh.length === 0) {
    pool.forEach((x) => usedIds.delete(x.id));
    fresh = pool;
  }
  const picked = fresh[Math.floor(Math.random() * fresh.length)];
  usedIds.add(picked.id);
  const correct = picked.options[0];
  const options = shuffle([...picked.options]);
  return {
    id: picked.id,
    difficulty,
    text: picked.text,
    options,
    correctIndex: options.indexOf(correct),
  };
}

/** Same, from the bank active in this browser (default or imported CSV). */
export const askQuestion = (difficulty: Difficulty, usedIds: Set<string>): AskedQuestion => askFromBank(activeBank, difficulty, usedIds);
