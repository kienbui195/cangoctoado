import React, { useRef, useState } from 'react';
import { bankStats, DEFAULT_BANK, getActiveBank, isCustomBank, resetBank, setCustomBank } from '../data/questions';
import { buildBankCsv, buildTemplateCsv, parseQuestionCsv } from '../utils/questionCsv';
import { soundManager } from '../utils/audio';

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

// Import / export the question bank as CSV (difficulty column: 1 = VIP/dễ, 2 = WOW/trung bình, 3 = LEGEND/khó).
export const QuestionBankModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [, force] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const stats = bankStats();
  const custom = isCustomBank();

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const { questions, errors } = parseQuestionCsv(text);
    if (errors.length > 0) {
      setMsg({ ok: false, lines: [`Không nhập được "${f.name}". Bộ câu hỏi hiện tại giữ nguyên.`, ...errors.slice(0, 12), ...(errors.length > 12 ? [`... và ${errors.length - 12} lỗi khác`] : [])] });
    } else {
      setCustomBank(questions);
      const s = bankStats(questions);
      setMsg({ ok: true, lines: [`Đã nhập ${questions.length} câu từ "${f.name}": mức 1 = ${s.easy}, mức 2 = ${s.medium}, mức 3 = ${s.hard}.`, 'Bộ câu hỏi mặc định đã được thay thế.'] });
    }
    if (fileRef.current) fileRef.current.value = '';
    force((n) => n + 1);
  };

  const btn = 'px-3 py-2 rounded-xl text-sm font-bold border transition active:scale-95';
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-amber-500/50 rounded-3xl p-6 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-black text-amber-400 font-['Fredoka']">📚 Bộ câu hỏi (CSV)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">✕</button>
        </div>

        <div className="rounded-xl bg-slate-950/70 border border-slate-700 p-3 text-sm mb-4">
          <div className="font-bold">
            Đang dùng: {custom ? <span className="text-emerald-300">bộ tùy chỉnh (đã nhập)</span> : <span className="text-slate-300">bộ mặc định (Địa lý, {DEFAULT_BANK.length} câu)</span>}
          </div>
          <div className="mt-1 text-slate-300">
            Mức 1 (VIP, dễ): <b>{stats.easy}</b> · Mức 2 (WOW, trung bình): <b>{stats.medium}</b> · Mức 3 (LEGEND, khó): <b>{stats.hard}</b> · Tổng {getActiveBank().length} câu
          </div>
        </div>

        <ol className="text-sm text-slate-300 list-decimal pl-5 space-y-1 mb-4">
          <li>Bấm <b>Tải template</b> để lấy file CSV mẫu.</li>
          <li>Điền câu hỏi, mỗi dòng 1 câu. Cột <code className="text-amber-300">do_kho</code>: <b>1</b> dễ (VIP), <b>2</b> trung bình (WOW), <b>3</b> khó (LEGEND). Cột <code className="text-amber-300">dap_an_dung</code>: A, B, C hoặc D.</li>
          <li>Bấm <b>Nhập file CSV</b> để thay thế bộ câu hỏi mặc định (cần ít nhất 1 câu cho mỗi mức 1, 2, 3).</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => { soundManager.playClick(); download('cau_hoi_template.csv', buildTemplateCsv()); }} className={`${btn} bg-slate-800 hover:bg-slate-700 border-slate-600`}>
            ⬇ Tải template
          </button>
          <button onClick={() => { soundManager.playClick(); fileRef.current?.click(); }} className={`${btn} bg-gradient-to-b from-amber-300 to-orange-500 text-slate-950 border-amber-300`}>
            ⬆ Nhập file CSV
          </button>
          <button onClick={() => { soundManager.playClick(); download('cau_hoi_hien_tai.csv', buildBankCsv(getActiveBank())); }} className={`${btn} bg-slate-800 hover:bg-slate-700 border-slate-600`}>
            ⬇ Xuất bộ hiện tại
          </button>
          {custom && (
            <button
              onClick={() => { soundManager.playClick(); resetBank(); setMsg({ ok: true, lines: ['Đã khôi phục bộ câu hỏi mặc định.'] }); force((n) => n + 1); }}
              className={`${btn} bg-rose-950 hover:bg-rose-900 border-rose-500/60 text-rose-200`}
            >
              ↺ Khôi phục mặc định
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        {msg && (
          <div className={`mt-4 rounded-xl p-3 text-xs border ${msg.ok ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200' : 'bg-rose-950/60 border-rose-500/50 text-rose-200'}`}>
            {msg.lines.map((l, i) => (
              <div key={i} className={i === 0 ? 'font-bold mb-1' : ''}>{l}</div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">Bộ câu hỏi nhập vào được lưu trong trình duyệt này (localStorage).</p>
      </div>
    </div>
  );
};
