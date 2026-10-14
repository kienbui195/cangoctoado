import React from 'react';
import { RoyaleEngine, MatchStats, RPlayer, TEAM_LABEL, Team, teamOf } from '../game/royaleEngine';

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

interface Row {
  label: string;
  value: (s: MatchStats, hp: { hp: number; max: number }) => React.ReactNode;
  /** which side is "better" for the highlight: 1 = larger wins, -1 = smaller wins, 0 = none */
  better?: 1 | -1;
  num?: (s: MatchStats, hp: { hp: number; max: number }) => number;
}

const ROWS: Row[] = [
  { label: 'Số câu hỏi đã mở', value: (s) => s.opened, num: (s) => s.opened },
  {
    label: 'Số câu trả lời đúng',
    value: (s) => `${s.correct}/${s.opened}${s.opened ? ` (${Math.round((s.correct / s.opened) * 100)}%)` : ''}`,
    num: (s) => s.correct,
    better: 1,
  },
  { label: 'Thời gian trả lời trung bình', value: (s) => (s.opened ? secs(s.answerMsTotal / s.opened) : '—'), num: (s) => (s.opened ? s.answerMsTotal / s.opened : Infinity), better: -1 },
  {
    label: 'Vũ khí thu thập được',
    value: (s) => (
      <span>
        <b>{s.collected.white + s.collected.blue + s.collected.red}</b> <span className="text-slate-400 text-xs">(VIP {s.collected.white} · WOW {s.collected.blue} · LEGEND {s.collected.red})</span>
      </span>
    ),
    num: (s) => s.collected.white + s.collected.blue + s.collected.red,
    better: 1,
  },
  { label: 'Nâng cấp thành công', value: (s) => `${s.upgradeOk}/${s.upgradeTries} lượt`, num: (s) => s.upgradeOk, better: 1 },
  { label: 'Tổng sát thương gây ra', value: (s) => `${Math.round(s.damageDealt)}${s.crits ? ` (⚡ ${s.crits} chí mạng)` : ''}`, num: (s) => s.damageDealt, better: 1 },
  { label: 'Tổng sát thương nhận vào', value: (s) => Math.round(s.damageTaken), num: (s) => s.damageTaken, better: -1 },
  { label: 'Máu còn lại', value: (_s, h) => `${Math.max(0, Math.round(h.hp))}/${h.max}`, num: (_s, h) => h.hp, better: 1 },
];

const REASON: Record<string, string> = {
  ko: 'hạ gục đối thủ',
  rounds: 'còn nhiều máu hơn sau khi hết các hiệp',
  forfeit: 'thắng vì đối thủ thoát hoặc mất kết nối',
};

const REASON_TEAM: Record<string, string> = {
  ko: 'hạ gục toàn bộ đội đối phương',
  rounds: 'còn tỉ lệ máu cao hơn sau khi hết các hiệp',
  forfeit: 'thắng vì cả đội đối phương đã thoát hoặc mất kết nối',
};

type Hp = { hp: number; max: number };

const sumStats = (list: MatchStats[]): MatchStats =>
  list.reduce<MatchStats>(
    (a, s) => ({
      opened: a.opened + s.opened,
      correct: a.correct + s.correct,
      answerMsTotal: a.answerMsTotal + s.answerMsTotal,
      upgradeTries: a.upgradeTries + s.upgradeTries,
      upgradeOk: a.upgradeOk + s.upgradeOk,
      damageDealt: a.damageDealt + s.damageDealt,
      damageTaken: a.damageTaken + s.damageTaken,
      crits: a.crits + s.crits,
      collected: { white: a.collected.white + s.collected.white, blue: a.collected.blue + s.collected.blue, red: a.collected.red + s.collected.red },
    }),
    { opened: 0, correct: 0, answerMsTotal: 0, upgradeTries: 0, upgradeOk: 0, damageDealt: 0, damageTaken: 0, crits: 0, collected: { white: 0, blue: 0, red: 0 } }
  );

/** Result card. 1v1: side-by-side comparison. Team rooms: one column per player plus a total per team. `children` = the buttons. */
export const MatchSummary: React.FC<{ engine: RoyaleEngine; children: React.ReactNode }> = ({ engine: e, children }) => {
  if (e.players.length > 2) return <TeamSummary engine={e}>{children}</TeamSummary>;
  const r = e.result!;
  const me = e.mySeat;
  const foe = me === 0 ? 1 : 0;
  const title = r.winner === null ? 'HÒA NHAU!' : r.winner === teamOf(me) ? 'BẠN CHIẾN THẮNG!' : 'BẠN THUA RỒI!';
  const hp = (seat: number): Hp => ({ hp: e.players[seat].hp, max: e.players[seat].maxHp });
  return (
    <div data-hud className="absolute inset-0 z-50 pointer-events-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-amber-400 p-5 md:p-7 rounded-3xl text-center max-w-2xl w-full shadow-2xl shadow-amber-500/20 my-auto">
        <div className="text-5xl mb-1">{r.winner === null ? '🤝' : r.winner === teamOf(me) ? '🏆' : '💔'}</div>
        <h3 className="text-3xl font-black text-amber-400 font-['Fredoka'] mb-1">{title}</h3>
        <p className="text-slate-300 text-sm mb-4">
          {r.winner !== null ? (
            <>
              <b className="text-white">{e.players[r.winner].name}</b> {REASON[r.reason]}.
            </>
          ) : (
            'Hai bên còn lượng máu bằng nhau.'
          )}
        </p>

        <div className="rounded-2xl border border-slate-700 overflow-hidden text-left mb-5">
          <div className="grid grid-cols-[1fr_1.4fr_1fr] bg-slate-800 text-xs font-black">
            <div className="px-3 py-2 text-amber-300 truncate">{e.players[me].name} (bạn)</div>
            <div className="px-3 py-2 text-center text-slate-400">SO SÁNH</div>
            <div className="px-3 py-2 text-cyan-300 text-right truncate">{e.players[foe].name}</div>
          </div>
          {ROWS.map((row) => {
            const a = row.num?.(e.stats[me], hp(me)) ?? 0;
            const b = row.num?.(e.stats[foe], hp(foe)) ?? 0;
            const dir = row.better ?? 0;
            const win = dir !== 0 && a !== b ? (dir * (a - b) > 0 ? 'me' : 'foe') : null;
            return (
              <div key={row.label} className="grid grid-cols-[1fr_1.4fr_1fr] border-t border-slate-800 text-sm items-center">
                <div className={`px-3 py-1.5 font-bold ${win === 'me' ? 'text-emerald-300' : 'text-slate-100'}`}>{row.value(e.stats[me], hp(me))}</div>
                <div className="px-2 py-1.5 text-center text-[11px] text-slate-400 leading-tight">{row.label}</div>
                <div className={`px-3 py-1.5 font-bold text-right ${win === 'foe' ? 'text-emerald-300' : 'text-slate-100'}`}>{row.value(e.stats[foe], hp(foe))}</div>
              </div>
            );
          })}
        </div>
        {children}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- team rooms (2v2 ...)
const TeamSummary: React.FC<{ engine: RoyaleEngine; children: React.ReactNode }> = ({ engine: e, children }) => {
  const r = e.result!;
  const myTeam = teamOf(e.mySeat);
  const members = (t: Team): RPlayer[] => e.players.filter((p) => teamOf(p.idx) === t);
  const teams: Team[] = [0, 1];
  const title = r.winner === null ? 'HÒA NHAU!' : r.winner === myTeam ? 'ĐỘI BẠN CHIẾN THẮNG!' : 'ĐỘI BẠN THUA RỒI!';
  const hpOf = (p: RPlayer): Hp => ({ hp: p.hp, max: p.maxHp });
  const hpOfTeam = (t: Team): Hp => members(t).reduce((a, p) => ({ hp: a.hp + Math.max(0, p.hp), max: a.max + p.maxHp }), { hp: 0, max: 0 });
  const totals = teams.map((t) => sumStats(members(t).map((p) => e.stats[p.idx])));
  const color = (t: Team) => (t === 0 ? 'text-amber-300' : 'text-cyan-300');
  const bg = (t: Team) => (t === 0 ? 'bg-amber-950/40' : 'bg-cyan-950/40');

  return (
    <div data-hud className="absolute inset-0 z-50 pointer-events-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-amber-400 p-5 md:p-6 rounded-3xl text-center max-w-4xl w-full shadow-2xl shadow-amber-500/20 my-auto">
        <div className="text-5xl mb-1">{r.winner === null ? '🤝' : r.winner === myTeam ? '🏆' : '💔'}</div>
        <h3 className="text-3xl font-black text-amber-400 font-['Fredoka'] mb-1">{title}</h3>
        <p className="text-slate-300 text-sm mb-4">
          {r.winner !== null ? (
            <>
              <b className="text-white">Đội {TEAM_LABEL[r.winner]}</b> ({members(r.winner).map((p) => p.name).join(', ')}) {REASON_TEAM[r.reason]}.
            </>
          ) : (
            'Hai đội còn tỉ lệ máu bằng nhau.'
          )}
        </p>

        <div className="rounded-2xl border border-slate-700 overflow-x-auto text-left mb-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-800 text-xs font-black">
                <th className="px-3 py-2 text-slate-400 text-left">SO SÁNH</th>
                {teams.map((t) => (
                  <React.Fragment key={t}>
                    {members(t).map((p) => (
                      <th key={p.idx} className={`px-2 py-2 text-center max-w-[120px] ${color(t)} ${bg(t)}`}>
                        <div className="truncate">{p.name}{p.idx === e.mySeat ? ' (bạn)' : ''}</div>
                        <div className="text-[9px] font-bold text-slate-400">Đội {TEAM_LABEL[t]}{p.out ? ' · rời trận' : ''}</div>
                      </th>
                    ))}
                    <th className={`px-2 py-2 text-center border-l border-slate-600 ${color(t)} ${bg(t)}`}>
                      TỔNG ĐỘI {TEAM_LABEL[t]} {r.winner === t ? '🏆' : ''}
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const tv = teams.map((t) => row.num?.(totals[t], hpOfTeam(t)) ?? 0);
                const dir = row.better ?? 0;
                const winTeam = dir !== 0 && tv[0] !== tv[1] ? (dir * (tv[0] - tv[1]) > 0 ? 0 : 1) : null;
                return (
                  <tr key={row.label} className="border-t border-slate-800">
                    <td className="px-3 py-1.5 text-[11px] text-slate-400 leading-tight">{row.label}</td>
                    {teams.map((t) => (
                      <React.Fragment key={t}>
                        {members(t).map((p) => (
                          <td key={p.idx} className="px-2 py-1.5 text-center font-bold text-slate-100">
                            {row.value(e.stats[p.idx], hpOf(p))}
                          </td>
                        ))}
                        <td className={`px-2 py-1.5 text-center font-black border-l border-slate-600 ${winTeam === t ? 'text-emerald-300' : 'text-slate-100'}`}>
                          {row.value(totals[t], hpOfTeam(t))}
                        </td>
                      </React.Fragment>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {children}
      </div>
    </div>
  );
};
