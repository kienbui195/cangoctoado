import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { GameStage } from '../components/GameStage';
import { MatchSummary } from '../components/MatchSummary';
import { ROOM_MODE_LIST, ROOM_MODES, RoomMode } from '../game/roomModes';
import { TEAM_LABEL } from '../game/royaleEngine';
import { soundManager } from '../utils/audio';
import { buildTemplateCsv } from '../utils/questionCsv';
import { clearSession, loginAccount, OnlineClient, OnlineUser, registerAccount, RoomView, savedSession } from './client';

const useOnline = (c: OnlineClient | null) => {
  const [, set] = useState(0);
  useEffect(() => (c ? c.subscribe(() => set((v) => (v + 1) % 1e9)) : undefined), [c]);
};

const Shell: React.FC<{ children: React.ReactNode; onBack?: () => void; backLabel?: string }> = ({ children, onBack, backLabel = '← Màn hình chờ' }) => (
  <div className="relative min-h-screen overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-teal-950 text-slate-100 flex flex-col items-center justify-center px-4 py-8 font-['Nunito',sans-serif]">
    {onBack && (
      <button onClick={onBack} className="absolute left-4 top-4 text-xs text-slate-400 hover:text-amber-300 underline underline-offset-4">
        {backLabel}
      </button>
    )}
    <div className="text-center mb-5">
      <div className="text-5xl">💣</div>
      <h1 className="text-3xl md:text-4xl font-black text-amber-400 font-['Fredoka'] tracking-wide drop-shadow-[0_3px_0_rgba(120,53,15,0.8)]">CĂN GÓC TỌA ĐỘ</h1>
      <div className="text-xs text-slate-400 mt-1">Chơi online theo phòng: 1v1 hoặc 2v2</div>
    </div>
    {children}
  </div>
);

const Card: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({ children, wide }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`w-full ${wide ? 'max-w-xl' : 'max-w-sm'} rounded-3xl bg-slate-900/90 border border-slate-700 p-6 shadow-2xl`}>
    {children}
  </motion.div>
);

const input = 'w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-600 focus:border-amber-400 outline-none text-sm text-white placeholder:text-slate-500';
const btnPrimary = 'w-full py-3 rounded-xl bg-gradient-to-b from-amber-300 to-orange-500 text-slate-950 font-black font-[\'Fredoka\'] tracking-wide shadow-[0_5px_0_#92400e] active:translate-y-[2px] active:shadow-[0_3px_0_#92400e] disabled:opacity-50 disabled:cursor-not-allowed transition';
const btnGhost = 'px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm font-bold text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition';
const errBox = 'rounded-xl bg-rose-950/70 border border-rose-700 text-rose-200 text-sm px-3 py-2';

const OnlinePill: React.FC<{ count: number }> = ({ count }) => (
  <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-emerald-300">
    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
    {count} người đang online
  </span>
);

// ================================================================= auth
const AuthScreen: React.FC<{ onAuthed: (user: OnlineUser, token: string) => void; onBack: () => void; notice?: string | null }> = ({ onAuthed, onBack, notice }) => {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ user: OnlineUser; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (mode === 'register' && pw !== pw2) return setError('Hai lần nhập mật khẩu chưa giống nhau.');
    setBusy(true);
    try {
      if (mode === 'register') setCreated(await registerAccount(name, pw));
      else {
        const r = await loginAccount(username, pw);
        onAuthed(r.user, r.token);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Shell>
        <Card>
          <div className="text-center">
            <div className="text-4xl mb-2">🎉</div>
            <h2 className="text-xl font-black text-emerald-300 mb-1">Đăng ký thành công!</h2>
            <p className="text-sm text-slate-300">Đây là username của bạn. Hãy ghi nhớ nó: bạn cần username này cùng mật khẩu để đăng nhập lần sau.</p>
            <div className="my-4 rounded-2xl bg-slate-950 border-2 border-amber-400 py-4 text-2xl font-black font-['Fredoka'] text-amber-300 select-all break-all">{created.user.username}</div>
            <button
              className={`${btnGhost} mb-3`}
              onClick={() => {
                navigator.clipboard?.writeText(created.user.username).then(() => setCopied(true)).catch(() => undefined);
              }}
            >
              {copied ? '✔ Đã sao chép' : 'Sao chép username'}
            </button>
            <button className={btnPrimary} onClick={() => onAuthed(created.user, created.token)}>
              VÀO CHƠI
            </button>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell onBack={onBack}>
      <Card>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-800 mb-4 text-sm font-black">
          {(['register', 'login'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`py-2 rounded-lg transition ${mode === m ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'}`}
            >
              {m === 'register' ? 'Đăng ký' : 'Đăng nhập'}
            </button>
          ))}
        </div>
        {notice && <div className={`${errBox} mb-3`}>{notice}</div>}
        <form onSubmit={submit} className="grid gap-3">
          {mode === 'register' ? (
            <>
              <label className="grid gap-1 text-xs font-bold text-slate-300">
                Tên hiển thị
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="VD: Nguyễn Văn An" autoFocus required />
              </label>
              <div className="text-[11px] text-slate-400 -mt-1">Hệ thống sẽ tự tạo cho bạn một username duy nhất từ tên này.</div>
            </>
          ) : (
            <label className="grid gap-1 text-xs font-bold text-slate-300">
              Username
              <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} placeholder="VD: nguyenvanan-4821" autoFocus required autoCapitalize="none" />
            </label>
          )}
          <label className="grid gap-1 text-xs font-bold text-slate-300">
            Mật khẩu
            <input className={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} maxLength={128} placeholder="Ít nhất 6 ký tự" required />
          </label>
          {mode === 'register' && (
            <label className="grid gap-1 text-xs font-bold text-slate-300">
              Nhập lại mật khẩu
              <input className={input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            </label>
          )}
          {error && <div className={errBox}>{error}</div>}
          <button className={btnPrimary} disabled={busy} type="submit">
            {busy ? 'ĐANG XỬ LÝ...' : mode === 'register' ? 'TẠO TÀI KHOẢN' : 'ĐĂNG NHẬP'}
          </button>
        </form>
        {mode === 'login' && <p className="mt-3 text-[11px] text-slate-500">Quên mật khẩu? Liên hệ người quản trị để được đặt lại.</p>}
      </Card>
    </Shell>
  );
};

// ================================================================= lobby (logged in, not in a room)
const OnlineLobby: React.FC<{ client: OnlineClient; onLogout: () => void; onBack: () => void }> = ({ client, onLogout, onBack }) => {
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<RoomMode>('1v1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const up = client.conn === 'online';

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Có lỗi xảy ra.');
  };

  return (
    <Shell onBack={onBack}>
      <Card>
        <div className="text-center mb-4">
          <div className="text-sm text-slate-400">Xin chào</div>
          <div className="text-xl font-black text-amber-300">{client.user.displayName}</div>
          <div className="text-[11px] text-slate-500">@{client.user.username}</div>
          <OnlinePill count={client.online} />
        </div>
        {client.message && (
          <div className={`${errBox} mb-3 flex justify-between gap-2`}>
            <span>{client.message}</span>
            <button onClick={() => client.dismissMessage()} className="text-rose-300 font-black">
              ✕
            </button>
          </div>
        )}
        {!up && <div className="rounded-xl bg-amber-950/60 border border-amber-700 text-amber-200 text-sm px-3 py-2 mb-3">{client.conn === 'connecting' ? 'Đang kết nối máy chủ...' : 'Mất kết nối, đang thử lại...'}</div>}
        <div className="text-xs font-bold text-slate-300 mb-1.5">Loại phòng</div>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {ROOM_MODE_LIST.map((m) => {
            const info = ROOM_MODES[m];
            const on = mode === m;
            return (
              <button
                key={m}
                type="button"
                disabled={!info.enabled}
                onClick={() => setMode(m)}
                title={info.enabled ? `${info.seats} người chơi (2 đội, mỗi đội ${info.perTeam})` : 'Sắp có'}
                className={`py-2 rounded-xl border text-sm font-black leading-tight transition ${
                  !info.enabled ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed' : on ? 'bg-amber-400 border-amber-200 text-slate-950' : 'bg-slate-800 border-slate-600 text-slate-200 hover:border-amber-400'
                }`}
              >
                {m}
                {!info.enabled && <div className="text-[9px] font-bold text-slate-500">sắp có</div>}
              </button>
            );
          })}
        </div>
        <button className={btnPrimary} disabled={!up || busy} onClick={() => run(() => client.createRoom(mode))}>
          ➕ TẠO PHÒNG {mode}
        </button>
        <div className="my-4 flex items-center gap-3 text-[11px] text-slate-500">
          <div className="h-px flex-1 bg-slate-700" /> hoặc vào phòng có sẵn <div className="h-px flex-1 bg-slate-700" />
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) run(() => client.joinRoom(code));
          }}
        >
          <input className={`${input} text-center font-black tracking-[0.3em] uppercase`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="MÃ PHÒNG" />
          <button className={btnGhost} disabled={!up || busy || !code.trim()} type="submit">
            Vào
          </button>
        </form>
        {error && <div className={`${errBox} mt-3`}>{error}</div>}
        <button onClick={onLogout} className="mt-5 w-full text-xs text-slate-400 hover:text-rose-300 underline underline-offset-4">
          Đăng xuất
        </button>
      </Card>
    </Shell>
  );
};

// ================================================================= waiting room
const downloadTemplate = () => {
  const url = URL.createObjectURL(new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mau-cau-hoi.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const RoomScreen: React.FC<{ client: OnlineClient; room: RoomView }> = ({ client, room }) => {
  const isHost = room.hostId === client.user.id;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvMsg, setCsvMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const need = room.seats;
  const full = room.players.length === need && room.players.every((p) => p.connected);
  const total = room.bank.easy + room.bank.medium + room.bank.hard;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setCsvMsg(null);
    const text = await f.text();
    const r = (await client.importCsv(text)) as { ok: boolean; error?: string; errors?: string[]; counts?: { easy: number; medium: number; hard: number } };
    if (r.ok) setCsvMsg({ ok: true, lines: [`Đã nhập ${r.counts!.easy + r.counts!.medium + r.counts!.hard} câu hỏi (dễ ${r.counts!.easy} · TB ${r.counts!.medium} · khó ${r.counts!.hard}).`] });
    else setCsvMsg({ ok: false, lines: r.errors ?? [r.error ?? 'Không nhập được file.'] });
    if (file.current) file.current.value = '';
  };

  return (
    <Shell>
      <Card wide>
        <div className="text-center">
          <div className="text-xs font-bold text-slate-400">MÃ PHÒNG</div>
          <button
            className="text-5xl font-black font-['Fredoka'] tracking-[0.25em] text-amber-300 select-all"
            onClick={() => navigator.clipboard?.writeText(room.code).then(() => setCopied(true)).catch(() => undefined)}
            title="Bấm để sao chép"
          >
            {room.code}
          </button>
          <div className="text-[11px] text-slate-500">{copied ? '✔ Đã sao chép mã' : 'Gửi mã này cho những người chơi còn lại'}</div>
        </div>

        <div className="mt-2 text-center">
          <OnlinePill count={client.online} />
        </div>

        {room.notice && <div className={`${errBox} mt-4`}>{room.notice}</div>}

        <div className="mt-3 text-center text-xs font-bold text-slate-300">
          Phòng <span className="text-amber-300">{room.mode}</span> · cần đủ {need} người ({room.players.length}/{need})
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([0, 1] as const).map((team) => (
            <div key={team} className="min-w-0">
              <div className={`mb-1.5 text-center text-xs font-black tracking-wider ${team === 0 ? 'text-amber-300' : 'text-cyan-300'}`}>ĐỘI {TEAM_LABEL[team]}</div>
              <div className="grid gap-2">
                {Array.from({ length: need / 2 }, (_, k) => 2 * k + team).map((slot) => {
                  const p = room.players.find((x) => x.seat === slot);
                  return (
                    <div key={slot} className={`min-w-0 rounded-xl px-3 py-2.5 border ${p ? (team === 0 ? 'bg-slate-800 border-amber-700/60' : 'bg-slate-800 border-cyan-700/60') : 'bg-slate-900/50 border-dashed border-slate-700'}`}>
                      {p ? (
                        <>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-black text-white truncate min-w-0">{p.displayName}</span>
                            {p.id === client.user.id && <span className="text-[10px] text-slate-400 shrink-0">(bạn)</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">@{p.username}</div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            {p.id === room.hostId ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-black whitespace-nowrap">CHỦ PHÒNG</span> : <span />}
                            <span className={`text-xs font-bold whitespace-nowrap ${p.connected ? 'text-emerald-300' : 'text-rose-300'}`}>{p.connected ? '● Sẵn sàng' : '○ Mất kết nối'}</span>
                          </div>
                        </>
                      ) : (
                        <span className="block py-2 text-sm text-slate-500 truncate">Ghế trống · đang chờ...</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {need > 2 && <div className="mt-2 text-center text-[11px] text-slate-500">Người vào sau được xếp vào ghế trống đầu tiên (chủ phòng ở đội A).</div>}

        <div className="mt-4 rounded-xl bg-slate-800/60 border border-slate-700 p-3 text-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              📚 Bộ câu hỏi: <b>{room.bank.custom ? 'tùy chỉnh' : 'mặc định'}</b>{' '}
              <span className="text-xs text-slate-400">
                ({total} câu · dễ {room.bank.easy} · TB {room.bank.medium} · khó {room.bank.hard})
              </span>
            </div>
            {isHost && (
              <div className="flex gap-2">
                <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <button className={`${btnGhost} !py-1.5 !text-xs`} onClick={() => file.current?.click()}>
                  Nhập CSV
                </button>
                <button className={`${btnGhost} !py-1.5 !text-xs`} onClick={downloadTemplate}>
                  Tải file mẫu
                </button>
                {room.bank.custom && (
                  <button
                    className={`${btnGhost} !py-1.5 !text-xs`}
                    onClick={async () => {
                      setCsvMsg(null);
                      await client.resetCsv();
                    }}
                  >
                    Dùng mặc định
                  </button>
                )}
              </div>
            )}
          </div>
          {!isHost && <div className="text-[11px] text-slate-500 mt-1">Chủ phòng quyết định bộ câu hỏi.</div>}
          {csvMsg && (
            <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${csvMsg.ok ? 'bg-emerald-950/70 border border-emerald-700 text-emerald-200' : 'bg-rose-950/70 border border-rose-700 text-rose-200'}`}>
              {csvMsg.lines.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>

        {error && <div className={`${errBox} mt-3`}>{error}</div>}
        <div className="mt-5 flex gap-3">
          {isHost ? (
            <button
              className={btnPrimary}
              disabled={!full || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await client.startGame();
                setBusy(false);
                if (!r.ok) setError(r.error ?? 'Không bắt đầu được.');
              }}
            >
              {full ? '▶ BẮT ĐẦU' : `CẦN ĐỦ ${need} NGƯỜI (${room.players.length}/${need})`}
            </button>
          ) : (
            <div className="flex-1 grid place-items-center rounded-xl bg-slate-800 text-sm text-slate-300 font-bold">{full ? 'Đang chờ chủ phòng bắt đầu...' : 'Đang chờ người chơi...'}</div>
          )}
          <button className={btnGhost} onClick={() => client.leaveRoom()}>
            Thoát phòng
          </button>
        </div>
      </Card>
    </Shell>
  );
};

// ================================================================= match
const OnlineGame: React.FC<{ client: OnlineClient; room: RoomView }> = ({ client, room }) => {
  const e = client.engine!;
  const io = useMemo(() => client.gameIO(), [client, client.engineKey]);
  const me = room.players.find((p) => p.id === client.user.id);
  const others = room.players.filter((p) => p.id !== client.user.id);
  const alone = room.players.length < room.seats; // somebody is missing: "play again" goes back to the waiting room
  const multi = room.seats > 2;
  const lost = multi ? 'bị loại khỏi ván' : 'bị xử thua';
  const waitingFor = room.players.filter((p) => p.connected && !p.vote).length;

  return (
    <GameStage
      key={client.engineKey}
      engine={e}
      io={io}
      exitLabel="Thoát phòng"
      onExit={() => {
        if (room.status === 'result' || window.confirm(multi ? 'Thoát giữa ván bạn sẽ bị loại, đồng đội vẫn chơi tiếp. Bạn chắc chứ?' : 'Thoát giữa ván sẽ bị xử thua. Bạn chắc chứ?')) client.leaveRoom();
      }}
      renderStatus={() => (
        <>
          {client.conn !== 'online' && (
            <div data-hud className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-rose-900/90 border border-rose-500 text-rose-100 text-sm font-black">
              Mất kết nối với máy chủ, đang thử lại... (quá 20 giây sẽ {lost})
            </div>
          )}
          {e.phase !== 'result' && others.filter((o) => !o.connected && !e.players[o.seat]?.out).map((o, i) => (
            <div key={o.id} data-hud style={{ top: 56 + i * 40 }} className="absolute left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-amber-900/90 border border-amber-500 text-amber-100 text-sm font-black">
              {o.displayName} đang mất kết nối... (quá 20 giây sẽ {lost})
            </div>
          ))}
        </>
      )}
      renderResult={() => (
        <MatchSummary engine={e}>
          {room.notice && <div className="mb-3 text-xs text-amber-200">{room.notice}</div>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                soundManager.playClick();
                client.vote(true);
              }}
              disabled={!!me?.vote}
              className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-black text-sm rounded-xl shadow-lg transition active:scale-95 disabled:opacity-60"
            >
              {alone ? (me?.vote ? 'ĐANG VỀ PHÒNG CHỜ...' : 'VỀ PHÒNG CHỜ') : me?.vote ? (multi ? `ĐÃ ĐỒNG Ý · CHỜ ${waitingFor} NGƯỜI NỮA...` : 'ĐÃ ĐỒNG Ý · ĐANG CHỜ ĐỐI THỦ...') : others.some((o) => o.vote) ? `CHƠI LẠI (${others.filter((o) => o.vote).length}/${others.length} người đã đồng ý ✔)` : 'CHƠI LẠI'}
            </button>
            <button onClick={() => client.vote(false)} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold text-sm rounded-xl border border-rose-500/30 transition">
              Thoát phòng
            </button>
          </div>
        </MatchSummary>
      )}
    />
  );
};

// ================================================================= entry
export const OnlineApp: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [session, setSession] = useState(savedSession);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const client = useMemo(() => (session ? new OnlineClient(session.user, session.token) : null), [session]);
  useOnline(client);

  useEffect(() => {
    if (!client) return;
    client.connect();
    return () => client.close();
  }, [client]);

  // the server ended the session (token expired / logged in elsewhere)
  useEffect(() => {
    if (client && client.conn === 'off' && client.message && !savedSession()) {
      setAuthNotice(client.message);
      setSession(null);
    }
  });

  if (!session || !client) {
    return (
      <AuthScreen
        onBack={onBack}
        notice={authNotice}
        onAuthed={(user, token) => {
          setAuthNotice(null);
          setSession({ user, token });
        }}
      />
    );
  }

  const room = client.room;
  if (!room) {
    return (
      <OnlineLobby
        client={client}
        onBack={onBack}
        onLogout={() => {
          clearSession();
          setSession(null);
        }}
      />
    );
  }
  if (room.status === 'waiting' || !client.engine) return <RoomScreen client={client} room={room} />;
  return <OnlineGame client={client} room={room} />;
};
