// CSV template / import / export for the question bank.
// Columns: do_kho (1 dễ=VIP, 2 trung bình=WOW, 3 khó=LEGEND), cau_hoi, dap_an_a..d, dap_an_dung (A/B/C/D)

import type { Difficulty, Question } from '../data/questions';

export const CSV_HEADER = ['do_kho', 'cau_hoi', 'dap_an_a', 'dap_an_b', 'dap_an_c', 'dap_an_d', 'dap_an_dung'];

const LEVEL_TO_DIFF: Record<string, Difficulty> = { '1': 'easy', '2': 'medium', '3': 'hard' };
const DIFF_TO_LEVEL: Record<Difficulty, string> = { easy: '1', medium: '2', hard: '3' };
const LETTERS = ['A', 'B', 'C', 'D'];

const SAMPLE_ROWS: string[][] = [
  ['1', 'Thủ đô của Việt Nam là thành phố nào?', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Huế', 'A'],
  ['2', 'Thủ đô của nước Úc là thành phố nào?', 'Sydney', 'Canberra', 'Melbourne', 'Perth', 'B'],
  ['3', 'Hồ nước ngọt sâu nhất thế giới là hồ nào?', 'Hồ Superior', 'Hồ Victoria', 'Hồ Baikal', 'Hồ Tanganyika', 'C'],
];

const esc = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (rows: string[][]) => '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'; // BOM: Excel reads UTF-8

export const buildTemplateCsv = () => toCsv([CSV_HEADER, ...SAMPLE_ROWS]);

/** Current bank as CSV (the correct answer is placed at its original position A). */
export function buildBankCsv(bank: Question[]): string {
  const rows = bank.map((q) => [DIFF_TO_LEVEL[q.difficulty], q.text, ...q.options, 'A']);
  return toCsv([CSV_HEADER, ...rows]);
}

/** Minimal RFC-4180 parser (quotes, escaped quotes, newlines inside quotes). */
function parseRows(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface CsvParseResult {
  questions: Question[];
  errors: string[];
}

export function parseQuestionCsv(input: string): CsvParseResult {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  // Excel in Vietnamese locales saves with ";" -> detect the delimiter
  const delim = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const all = parseRows(text, delim).filter((r) => r.some((c) => c.trim() !== ''));
  const errors: string[] = [];
  const questions: Question[] = [];

  if (all.length === 0) return { questions, errors: ['File trống.'] };

  // skip the header row when the first cell is not a level number
  let start = 0;
  if (!/^[123]$/.test(all[0][0].trim())) start = 1;

  for (let i = start; i < all.length; i++) {
    const r = all[i].map((c) => c.trim());
    const line = i + 1;
    if (r.length < 7) {
      errors.push(`Dòng ${line}: cần đủ 7 cột (do_kho, cau_hoi, 4 đáp án, dap_an_dung), đang có ${r.length}.`);
      continue;
    }
    const diff = LEVEL_TO_DIFF[r[0]];
    if (!diff) {
      errors.push(`Dòng ${line}: do_kho phải là 1, 2 hoặc 3 (đang là "${r[0]}").`);
      continue;
    }
    if (!r[1]) {
      errors.push(`Dòng ${line}: thiếu nội dung câu hỏi.`);
      continue;
    }
    const opts = r.slice(2, 6);
    if (opts.some((o) => !o)) {
      errors.push(`Dòng ${line}: cả 4 đáp án A, B, C, D đều phải có nội dung.`);
      continue;
    }
    if (new Set(opts.map((o) => o.toLowerCase())).size < 4) {
      errors.push(`Dòng ${line}: có đáp án bị trùng nhau.`);
      continue;
    }
    const idx = LETTERS.indexOf(r[6].toUpperCase());
    if (idx < 0) {
      errors.push(`Dòng ${line}: dap_an_dung phải là A, B, C hoặc D (đang là "${r[6]}").`);
      continue;
    }
    // bank format: options[0] is the correct answer (shuffled when asked)
    const ordered = [opts[idx], ...opts.filter((_, k) => k !== idx)] as [string, string, string, string];
    questions.push({ id: `c${questions.length + 1}`, difficulty: diff, text: r[1], options: ordered });
  }

  if (errors.length === 0) {
    const counts = { easy: 0, medium: 0, hard: 0 } as Record<Difficulty, number>;
    questions.forEach((q) => counts[q.difficulty]++);
    (['easy', 'medium', 'hard'] as Difficulty[]).forEach((d) => {
      if (counts[d] === 0) errors.push(`Thiếu câu hỏi mức ${DIFF_TO_LEVEL[d]} (cần ít nhất 1 câu mỗi mức 1, 2, 3).`);
    });
  }
  return { questions, errors };
}
