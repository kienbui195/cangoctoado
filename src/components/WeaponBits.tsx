import React from 'react';
import { ELEMENTS, Element, KHAC, SINH } from '../data/royaleWeapons';

/** Small pill with the (Vietnamese) element name in its own color. */
export const ElementBadge: React.FC<{ element: Element; size?: number }> = ({ element, size = 16 }) => {
  const el = ELEMENTS[element];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-black leading-none shrink-0 px-1"
      style={{
        minWidth: size,
        height: Math.round(size * 0.85),
        fontSize: Math.max(8, Math.round(size * 0.55)),
        background: el.color,
        color: element === 'kim' ? '#422006' : '#fff',
        border: '1.5px solid rgba(2,6,23,.85)',
        boxShadow: `0 0 6px ${el.color}aa`,
      }}
      title={`${el.name} — ${el.perk}`}
    >
      {el.name}
    </span>
  );
};

const Chain: React.FC<{ map: Record<Element, Element>; verb: string }> = ({ map, verb }) => {
  const order: Element[] = [];
  let cur: Element = 'moc';
  for (let i = 0; i < 5; i++) {
    order.push(cur);
    cur = map[cur];
  }
  return (
    <span className="inline-flex items-center flex-wrap gap-1" title={verb}>
      {order.map((e, i) => (
        <React.Fragment key={e}>
          <ElementBadge element={e} size={18} />
          <span className="text-slate-400 text-[10px]">{i < 4 ? '→' : '→ ' + ELEMENTS[order[0]].name}</span>
        </React.Fragment>
      ))}
    </span>
  );
};

/** Always-visible rule card for the Ngũ hành system (shown while arranging weapons). */
export const ElementRules: React.FC = () => (
  <div className="rounded-xl bg-slate-900/80 border border-slate-700 p-2 text-[11px] text-slate-300 space-y-1.5">
    <div className="font-black text-amber-300 tracking-wide">☯ QUY TẮC NGŨ HÀNH</div>
    <div>
      <span className="font-black text-emerald-300">Tương sinh (+30%, cộng dồn):</span> bắn vũ khí hệ <i>sinh</i> ra hệ của vũ khí kế tiếp của <b>chính bạn</b> thì vũ khí kế tiếp mạnh thêm 30% (sát thương và hiệu ứng); chuỗi liên tiếp càng dài càng mạnh: mắt xích thứ 2 +35%, thứ 3 +40%... · <span className="font-black text-sky-300">Cùng hệ liên tiếp:</span> hiệu ứng +20%, +25%...
      <div className="mt-1"><Chain map={SINH} verb="sinh" /></div>
    </div>
    <div>
      <span className="font-black text-rose-300">Tương khắc (−20%):</span> trong cùng <b>1 hiệp</b>, nếu vũ khí của bạn bị hệ của vũ khí đối thủ <i>khắc</i> thì sát thương và hiệu ứng của bạn giảm 20%. (Hiệp N của bạn đối đầu hiệp N của đối thủ.)
      <div className="mt-1"><Chain map={KHAC} verb="khắc" /></div>
    </div>
    <div className="text-slate-400">Mỗi hệ còn có điểm riêng khi trúng đích: Kim +chí mạng · Mộc hồi máu · Thủy làm chậm · Hỏa bỏng nhẹ · Thổ nhận giáp.</div>
  </div>
);

export const SINH_TEXT = 'Mộc → Hỏa → Thổ → Kim → Thủy → Mộc';
