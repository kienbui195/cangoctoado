import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 850;

const MAX_SCALE = 3;
const FIT_MARGIN_X = 260;
const FIT_MARGIN_Y = 300;

export interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

export interface ViewInfo extends Camera {
  w: number;
  h: number;
}

interface Props {
  focusPoints: { x: number; y: number }[];
  /** mini-map dots (defaults to focusPoints); `color` = team color */
  markers?: { x: number; y: number; color?: string }[];
  /** top offset (px) of the mini-map: moved down when several player cards are stacked above it */
  minimapTop?: number;
  /** called with world coordinates when the background is clicked (not dragged) */
  onWorldClick?: (x: number, y: number) => void;
  world: React.ReactNode;
  overlay: React.ReactNode | ((view: ViewInfo) => React.ReactNode);
}

const MINIMAP_W = 200;
const MINIMAP_H = Math.round((MINIMAP_W * WORLD_HEIGHT) / WORLD_WIDTH);
const PLAYER_COLORS = ['#f59e0b', '#06b6d4'];

/** Where the mini-map sits (and the right-hand weapon panels below it) when each team shows `perTeam` stacked cards. */
export const CARD_H = 58;
export const minimapTopFor = (perTeam: number) => Math.max(58, 4 + perTeam * CARD_H - 4);
export const MINIMAP_BLOCK_H = 110;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Full-screen viewport with a camera: auto-fits all focus points (both players),
// mouse wheel zooms, dragging pans. Manual control switches off auto-fit until "Tự động" is pressed.
export const GameViewport: React.FC<Props> = ({ focusPoints, markers, minimapTop = 58, onWorldClick, world, overlay }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  const [camera, setCamera] = useState<Camera>({ scale: 1, tx: 0, ty: 0 });
  const [auto, setAuto] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const minScale = Math.max(size.w / WORLD_WIDTH, size.h / WORLD_HEIGHT);

  // Keep the world covering the whole viewport (no empty edges)
  const constrain = useCallback(
    (c: Camera): Camera => {
      const scale = clamp(c.scale, minScale, MAX_SCALE);
      return {
        scale,
        tx: clamp(c.tx, size.w - WORLD_WIDTH * scale, 0),
        ty: clamp(c.ty, size.h - WORLD_HEIGHT * scale, 0),
      };
    },
    [minScale, size.w, size.h]
  );

  const fitCamera = useCallback((): Camera => {
    const xs = focusPoints.map((p) => p.x);
    const ys = focusPoints.map((p) => p.y);
    const minX = Math.min(...xs) - FIT_MARGIN_X;
    const maxX = Math.max(...xs) + FIT_MARGIN_X;
    const minY = Math.min(...ys) - FIT_MARGIN_Y;
    const maxY = Math.max(...ys) + FIT_MARGIN_Y * 0.6;
    const scale = Math.min(size.w / (maxX - minX), size.h / (maxY - minY));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const s = clamp(scale, minScale, MAX_SCALE);
    return constrain({ scale: s, tx: size.w / 2 - cx * s, ty: size.h / 2 - cy * s });
  }, [focusPoints, size.w, size.h, minScale, constrain]);

  const focusKey = focusPoints.map((p) => `${Math.round(p.x / 8)},${Math.round(p.y / 8)}`).join('|');

  useEffect(() => {
    if (auto) setCamera(fitCamera());
    else setCamera((c) => constrain(c));
  }, [auto, focusKey, size.w, size.h]);

  // Mini map: whole battlefield + both players + the frame currently shown on screen
  const mapRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef({ camera, size, focusPoints: markers ?? focusPoints });
  liveRef.current = { camera, size, focusPoints: markers ?? focusPoints };

  useEffect(() => {
    let id: number;
    const draw = () => {
      const cv = mapRef.current;
      const ctx = cv?.getContext('2d');
      if (cv && ctx) {
        const { camera: c, size: sz, focusPoints: pts } = liveRef.current;
        const k = MINIMAP_W / WORLD_WIDTH;
        ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);
        const terrain = (window as any).__gunnyTerrainCanvas as HTMLCanvasElement | undefined;
        if (terrain) ctx.drawImage(terrain, 0, 0, MINIMAP_W, MINIMAP_H);
        pts.forEach((p, i) => {
          ctx.fillStyle = (pts[i] as { color?: string }).color || PLAYER_COLORS[i] || '#fff';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x * k, (p.y - 12) * k, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        // current screen frame
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          (-c.tx / c.scale) * k,
          (-c.ty / c.scale) * k,
          (sz.w / c.scale) * k,
          (sz.h / c.scale) * k
        );
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, []);

  const moveFromMinimap = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH;
    const wy = ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
    setAuto(false);
    setCamera((c) =>
      constrain({ scale: c.scale, tx: size.w / 2 - wx * c.scale, ty: size.h / 2 - wy * c.scale })
    );
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setAuto(false);
    setCamera((c) => {
      const next = clamp(c.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), minScale, MAX_SCALE);
      const k = next / c.scale;
      return constrain({ scale: next, tx: px - (px - c.tx) * k, ty: py - (py - c.ty) * k });
    });
  };

  const zoomBy = (factor: number) => {
    setAuto(false);
    setCamera((c) => {
      const next = clamp(c.scale * factor, minScale, MAX_SCALE);
      const k = next / c.scale;
      const px = size.w / 2;
      const py = size.h / 2;
      return constrain({ scale: next, tx: px - (px - c.tx) * k, ty: py - (py - c.ty) * k });
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-hud], button')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: camera.tx, ty: camera.ty, moved: false };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return; // tiny jitter = still a click
    d.moved = true;
    setAuto(false);
    setCamera((c) =>
      constrain({ ...c, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) })
    );
  };

  const endDrag = (e?: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (d && !d.moved && e && e.type === 'pointerup' && onWorldClick) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        onWorldClick(
          (e.clientX - rect.left - camera.tx) / camera.scale,
          (e.clientY - rect.top - camera.ty) / camera.scale
        );
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-slate-950 touch-none ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          transform: `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.scale})`,
          transition: dragging ? 'none' : 'transform 350ms ease-out',
        }}
      >
        {world}
      </div>

      {/* HUD layer (fixed on screen) */}
      <div className="absolute inset-0 pointer-events-none">
        {typeof overlay === 'function' ? overlay({ ...camera, w: size.w, h: size.h }) : overlay}
      </div>

      {/* Mini map (top-right, under the player card) */}
      <div
        data-hud
        style={{ top: minimapTop }}
        className="absolute right-1 z-40 pointer-events-auto rounded-lg border border-slate-600 bg-slate-950/80 p-0.5 shadow-xl"
      >
        <canvas
          ref={mapRef}
          width={MINIMAP_W}
          height={MINIMAP_H}
          className="block rounded cursor-crosshair"
          style={{ width: MINIMAP_W, height: MINIMAP_H }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            moveFromMinimap(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) moveFromMinimap(e);
          }}
          title="Mini map: bấm / kéo để di chuyển khung nhìn"
        />
      </div>

      {/* Camera controls — tucked in bottom-right corner */}
      <div
        data-hud
        className="absolute bottom-2 right-2 z-40 flex flex-col gap-1 pointer-events-auto"
      >
        <button
          onClick={() => zoomBy(1.2)}
          className="p-1.5 rounded-lg bg-slate-900/85 border border-slate-700 text-slate-200 hover:bg-slate-800"
          title="Phóng to (cuộn chuột lên)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.2)}
          className="p-1.5 rounded-lg bg-slate-900/85 border border-slate-700 text-slate-200 hover:bg-slate-800"
          title="Thu nhỏ (cuộn chuột xuống)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => setAuto(true)}
          className={`p-1.5 rounded-lg border ${
            auto
              ? 'bg-emerald-950/85 border-emerald-400 text-emerald-300'
              : 'bg-slate-900/85 border-slate-700 text-slate-200 hover:bg-slate-800'
          }`}
          title="Tự động khung hình theo cả 2 đối thủ"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
