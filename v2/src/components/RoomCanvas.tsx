import { useMemo, useRef, useState, useEffect } from 'react';
import { buildBuildingSVG } from '@core/building-render.js';
import { buildFloorsForAgents, teamOf } from '@core/data/floor-layout.js';
import { backgroundUrl } from '@core/data/floor-backgrounds.js';
import { rgbc } from '@core/building-render.js';
import { agentMapTipHTML } from '../render/cardHtml';
import { useConnectedAgents, useBindings } from '../store/hooks';
import type { Agent } from '../core/types';

interface RoomTip { id: string; html: string; x: number; y: number; visible: boolean; }

/* eslint-disable @typescript-eslint/no-explicit-any */
const towerHeightForLoad = (L: number, minH: number, maxH: number) => (L < 0.1 ? minH : minH + L * (maxH - minH));

// Tower-height easing — ported from v1's app-main.js so the columns grow/shrink
// smoothly when an agent's load changes instead of snapping. minH/maxH match the
// SVG building-render's seat scale (16/88).
const TOWER_TAU = 1.05;
const ROOM_MIN_H = 16;
const ROOM_MAX_H = 88;
const easeAlpha = (dt: number) => 1 - Math.exp(-dt / (TOWER_TAU * 1000));
function smoothToward(cur: number | undefined, target: number, dt: number) {
  if (cur == null) return target;
  if (Math.abs(cur - target) < 0.02) return target;
  return cur + (target - cur) * easeAlpha(dt);
}
function towerTargetH(a: Agent | null, minH: number, maxH: number) {
  if (!a || a.status === 'offline') return minH * 0.6;
  return towerHeightForLoad(a.max ? a.used / a.max : 0, minH, maxH);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Port of v1's buildBuilding seatParts: vacant seats as circles, online agents
// as load-scaled towers (team-coloured), offline as low wireframes, with a
// beacon on flagged agents. Tower heights animate via RoomCanvas' rAF loop.
function makeSeatParts(
  TEAM_COLOR: Record<string, [number, number, number]>,
  displayH: Map<string, number>,
) {
  return (s: any, ctx: any) => {
    const a = s.agent as Agent | null;
    const { x, y, TW, TH, minH, maxH } = ctx;
    if (!a) return { cube: ctx.vacantCircle(x, y) };
    const T = TEAM_COLOR[teamOf(a)] || [140, 140, 150];
    if (a.status === 'offline') {
      return { cube: ctx.wire(x, y, 10, 'rgba(27,25,36,.18)', a.id, false, a.flag ? ctx.mkBeacon(x, y, 10) : '') };
    }
    const L = a.max ? a.used / a.max : 0;
    // Use the interpolated display height (see RoomCanvas' rAF loop) so the
    // column animates toward its load target rather than jumping to it.
    const H = displayH.get(a.id) ?? towerTargetH(a, minH, maxH);
    const beacon = a.flag ? ctx.mkBeacon(x, y, H) : '';
    const glow = L < 0.1 ? '' : `<ellipse cx="${x}" cy="${y}" rx="${TW * 1.2}" ry="${TH * 1.2}" fill="${rgbc(T, L * 0.42)}" filter="url(#bg)"/>`;
    return { glow, cube: ctx.tower(x, y, H, T, L, a.id, beacon) };
  };
}

// Room panel: the isometric SVG of the building with hover tooltips, click-to-open
// and animated tower heights. The optional Three.js scene (Scene3D) is not ported.
// Occupancy stats and the team legend mirror v1's room header/footer.
function occupancy(agents: Agent[]) {
  const occupied = agents.filter((a) => a.status !== 'offline' && a.used > 0).length;
  const hot = agents.filter((a) => a.flag).length;
  return { occupied, hot };
}

export function RoomCanvas({ onOpenAgent }: { onOpenAgent?: (id: string) => void }) {
  const agents = useConnectedAgents();
  const bindings = useBindings();
  const TEAM_COLOR = bindings.TEAM_COLOR;

  // Hover tooltip over a seat column (port of v1's attachSeats / room-tip). The
  // stage is the tip's offset parent, so positions are relative to its rect.
  const stageRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<RoomTip | null>(null);

  const seatAt = (target: EventTarget | null): { el: HTMLElement; agent: Agent } | null => {
    const g = (target as HTMLElement)?.closest?.('.seat[data-id]') as HTMLElement | null;
    if (!g) return null;
    const agent = agents.find((a) => a.id === g.dataset.id);
    return agent ? { el: g, agent } : null;
  };

  // Keep the tip element mounted and just toggle `visible` (and content/position)
  // so it fades in/out via CSS like v1, instead of mounting/unmounting abruptly.
  const hideTip = () => setTip((prev) => (prev ? { ...prev, visible: false } : null));

  const onSeatMove = (e: React.MouseEvent) => {
    const hit = seatAt(e.target);
    const stage = stageRef.current;
    if (!hit || !stage) { hideTip(); return; }
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left + 14;
    const y = e.clientY - r.top + 14;
    setTip((prev) => ({
      id: hit.agent.id,
      // Rebuild the markup only when hovering a different agent.
      html: prev && prev.id === hit.agent.id ? prev.html : agentMapTipHTML(hit.agent),
      x,
      y,
      visible: true,
    }));
  };

  const onSeatClick = (e: React.MouseEvent) => {
    const hit = seatAt(e.target);
    if (hit) { hideTip(); onOpenAgent?.(hit.agent.id); }
  };

  // Per-agent display height, eased toward each agent's load target every frame.
  // A ref (not state) so the rAF loop can mutate it without re-subscribing; a
  // `tick` bump forces the SVG to re-render only on frames that actually moved.
  const displayH = useRef<Map<string, number>>(new Map());
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const [tick, setTick] = useState(0);

  // Single rAF loop for the component's lifetime: steps every tracked tower
  // toward its target and, when anything changed, requests one re-render. Idle
  // frames (everything settled) bump nothing, so a stable room costs ~no work.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const step = (ts: number) => {
      raf = requestAnimationFrame(step);
      const dt = last ? Math.min(ts - last, 50) : 16;
      last = ts;
      let dirty = false;
      for (const a of agentsRef.current) {
        const target = towerTargetH(a, ROOM_MIN_H, ROOM_MAX_H);
        const cur = displayH.current.get(a.id);
        const next = smoothToward(cur, target, dt);
        if (cur == null || next !== cur) {
          displayH.current.set(a.id, next);
          dirty = true;
        }
      }
      if (dirty) setTick((t) => t + 1);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Builds the room-canvas-stage inner HTML: the SVG plus the HTML overlay of
  // per-floor name labels, mirroring v1's buildingCanvasHTML so the SVG stays a
  // direct child of .room-canvas-stage (its width/height:100% sizing depends on it).
  const stage = useMemo(() => {
    try {
      // buildFloorsForAgents returns seat-decorated floors; building-render wants
      // its own decorated shape.
      const floors = buildFloorsForAgents(agents);
      // meta collects the per-floor name anchors + viewBox for the label overlay.
      const meta: { anchors: Array<{ name: string; x: number; y: number }>; viewBox?: { x: number; y: number; w: number; h: number } } = { anchors: [] };
      // backgroundUrl renders configured floor backgrounds; seatParts draws the
      // agents (towers) on the seats instead of empty placeholders.
      const svg = buildBuildingSVG(floors as any, 0, { meta, backgroundUrl, seatParts: makeSeatParts(TEAM_COLOR, displayH.current) } as any);
      const { viewBox } = meta;
      if (!viewBox) return { html: svg, aspectRatio: undefined as string | undefined };
      const labels = meta.anchors
        .map((a) => {
          const left = ((a.x - viewBox.x) / viewBox.w) * 100;
          const top = ((a.y - viewBox.y) / viewBox.h) * 100;
          return `<span class="floor-label" style="left:${left}%;top:${top}%">${escapeHtml(String(a.name).toUpperCase())}</span>`;
        })
        .join('');
      return {
        html: `${svg}<div class="floor-labels" aria-hidden="true">${labels}</div>`,
        aspectRatio: `${viewBox.w} / ${viewBox.h}`,
      };
    } catch {
      return { html: null as string | null, aspectRatio: undefined as string | undefined };
    }
    // `tick` is the rAF animation pulse: it forces a re-render so the SVG picks
    // up the freshly-eased display heights from displayH.current.
  }, [agents, TEAM_COLOR, tick]);

  const { occupied, hot } = occupancy(agents);

  return (
    <div className="building-stage ops-building">
      <div className="bldg-head">
        <span className="bcap">La sala · totes les plantes</span>
        <span className="bstats">
          <b className="mono">{occupied}</b> ocupats ·{' '}
          <b className="mono" style={{ color: hot ? 'var(--alert)' : 'var(--ink)' }}>{hot}</b> punts calents
        </span>
      </div>
      <div className="room-canvas">
        {stage.html
          ? (
            <div
              className="room-canvas-stage"
              ref={stageRef}
              style={stage.aspectRatio ? { aspectRatio: stage.aspectRatio } : undefined}
              onMouseMove={onSeatMove}
              onMouseLeave={hideTip}
              onClick={onSeatClick}
            >
              {/* display:contents keeps the SVG a layout child of the stage (its
                  width/height:100% sizing depends on that) while letting the tip
                  be a real React sibling — .room-canvas-stage > .room-tip. */}
              <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: stage.html }} />
              {tip && (
                <div
                  className={`room-tip${tip.visible ? ' is-visible' : ''}`}
                  style={{ left: `${tip.x}px`, top: `${tip.y}px` }}
                  dangerouslySetInnerHTML={{ __html: tip.html }}
                />
              )}
            </div>
          )
          : <div style={{ padding: 24, color: 'var(--faint)' }}>Vista de la sala no disponible.</div>}
      </div>
      <div className="room-legend">
        <div className="lg-group">
          <div className="lt">Equips</div>
          <div className="lg-list">
            {Object.entries(TEAM_COLOR).map(([t, c]) => (
              <div className="li" key={t}>
                <i style={{ width: 11, height: 11, borderRadius: 3, background: rgbc(c) }} />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
