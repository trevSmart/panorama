/**
 * Shared isometric building renderer.
 *
 * Pure module: no globals, no agent knowledge. Callers provide decorated
 * floors ({ name, cells, cellset, assigned: [{ c, r, ... }] }) and an
 * optional `seatParts(seat, ctx)` callback that returns the SVG fragments
 * for each seat ({ glow?, cube? }). Without a callback, seats render as
 * vacant dashed diamonds (used by the floor editor preview).
 */

export const shade = (c, f) => c.map(v => Math.round(v * f));
export const tint = (c, k) => c.map(v => Math.round(v + (255 - v) * k));
export const rgbc = (c, o = 1) => `rgba(${c[0]},${c[1]},${c[2]},${o})`;

export function isoDepthSum(c, r, dir, gMaxC, gMaxR) {
  if (dir === 1) return c + r;
  if (dir === 2) return gMaxR - r + c;
  if (dir === 3) return r + gMaxC - c;
  return c + r;
}

/** @returns {{ gMaxC: number, gMaxR: number }} max grid coords across all floors */
export function gridExtents(floors) {
  let gMaxC = 0, gMaxR = 0;
  floors.forEach(f => f.cells.forEach(([c, r]) => { if (c > gMaxC) gMaxC = c; if (r > gMaxR) gMaxR = r; }));
  return { gMaxC, gMaxR };
}

export function computeFloorLayout(floors, dir, gMaxC, gMaxR, opts) {
  const { minH, maxH, TH, beaconPad, marginMin, slabT = 0 } = opts;
  const offsets = [0];
  const gaps = [];
  for (let i = 0; i < floors.length - 1; i++) {
    const lower = floors[i];
    const upper = floors[i + 1];
    // Use the lower floor's full cell extent (not just its seats) so detached
    // areas painted in the editor can never interleave with the floor above.
    const lowerSums = lower.cells.map(([c, r]) => isoDepthSum(c, r, dir, gMaxC, gMaxR));
    const cellSums = upper.cells.map(([c, r]) => isoDepthSum(c, r, dir, gMaxC, gMaxR));
    const maxCell = cellSums.length ? Math.max(...cellSums) : 0;
    const minLower = lowerSums.length ? Math.min(...lowerSums) : 0;
    const geoDelta = (maxCell - minLower) * TH;
    const gap = geoDelta + TH + maxH + beaconPad + marginMin + slabT;
    gaps.push(gap);
    offsets.push(offsets[offsets.length - 1] - gap);
  }
  return { offsets, gaps };
}

const EMPTY_SVG = '<svg viewBox="0 0 480 240" xmlns="http://www.w3.org/2000/svg"><text x="240" y="120" text-anchor="middle" fill="#9C98A6" font-size="14" font-family="Inter,sans-serif">Team map unavailable</text></svg>';

/**
 * @param {Array<{ name: string, cells: number[][], cellset: Set<string>, assigned: Array<{ c: number, r: number }> }>} floors
 * @param {number} dir 0-3 camera direction
 * @param {{ floorOffsets?: number[], seatParts?: Function, showLabels?: boolean }} [opts]
 * @returns {string} SVG markup
 */
export function buildBuildingSVG(floors, dir = 0, opts = {}) {
  if (!floors?.length || !floors.some(f => f.cells.length)) return EMPTY_SVG;
  const TW = 34, TH = 17, minH = 16, maxH = 88, THK = 6;
  const { showLabels = true } = opts;
  const { gMaxC, gMaxR } = gridExtents(floors);
  const floorOffsets = opts.floorOffsets
    || computeFloorLayout(floors, dir, gMaxC, gMaxR, { minH, maxH, TH, beaconPad: 24, marginMin: 14, marginBase: 28 }).offsets;
  const getPos =
    dir === 1 ? (c, r) => [(r - c) * TW, (r + c) * TH] :
      dir === 2 ? (c, r) => [(gMaxR - r - c) * TW, (gMaxR - r + c) * TH] :
        dir === 3 ? (c, r) => [(r + c - gMaxC) * TW, (r + gMaxC - c) * TH] :
          (c, r) => [(c - r) * TW, (c + r) * TH];
  const makeRfVis = has =>
    dir === 1 ? (c, r) => !has(c, r + 1) :
      dir === 2 ? (c, r) => !has(c, r - 1) :
        dir === 3 ? (c, r) => !has(c, r + 1) :
          (c, r) => !has(c + 1, r);
  const makeLfVis = has =>
    dir === 1 ? (c, r) => !has(c + 1, r) :
      dir === 2 ? (c, r) => !has(c + 1, r) :
        dir === 3 ? (c, r) => !has(c - 1, r) :
          (c, r) => !has(c, r + 1);
  // Back walls: the two grid edges furthest from the camera (the inverse corner
  // of the perspective). For each, a cell is on the back perimeter when it has
  // no neighbour on that side. The wall panel rises from that ground edge.
  // Back-right edge of a diamond: from top vertex (x,y-TH) to right vertex (x+TW,y).
  // Back-left edge of a diamond: from top vertex (x,y-TH) to left vertex (x-TW,y).
  const makeBrVis = has =>
    dir === 1 ? (c, r) => !has(c - 1, r) :
      dir === 2 ? (c, r) => !has(c - 1, r) :
        dir === 3 ? (c, r) => !has(c + 1, r) :
          (c, r) => !has(c, r - 1);
  const makeBlVis = has =>
    dir === 1 ? (c, r) => !has(c, r - 1) :
      dir === 2 ? (c, r) => !has(c, r + 1) :
        dir === 3 ? (c, r) => !has(c, r - 1) :
          (c, r) => !has(c - 1, r);
  // Which grid edge (N/S/E/O) each visible rear wall corresponds to, per dir.
  // Inverse of makeBrVis/makeBlVis above.
  const brEdge = dir === 0 ? 'N' : dir === 3 ? 'E' : 'O';
  const blEdge = dir === 0 ? 'O' : dir === 2 ? 'S' : 'N';
  const sortFn =
    dir === 2 ? (a, b) => (a.c - a.r) - (b.c - b.r) || (a.c - b.c) :
      dir === 3 ? (a, b) => (a.r - a.c) - (b.r - b.c) || (a.r - b.r) :
        (a, b) => (a.c + a.r) - (b.c + b.r) || (a.c - b.c);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const ext = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  // Updated per-floor inside the render loop so seat helpers can report how
  // high they actually reach (towers, beacons) and labels can sit just above.
  let trackTop = () => { };
  const faces = (x, y, H) => ({ top: `${x},${y - TH - H} ${x + TW},${y - H} ${x},${y + TH - H} ${x - TW},${y - H}`, lf: `${x - TW},${y} ${x},${y + TH} ${x},${y + TH - H} ${x - TW},${y - H}`, rf: `${x},${y + TH} ${x + TW},${y} ${x + TW},${y - H} ${x},${y + TH - H}` });
  const mkBeacon = (x, y, H) => { const by = y - TH - H - 15; trackTop(by - 5); return `<line x1="${x}" y1="${y - TH - H}" x2="${x}" y2="${by + 4}" stroke="#E05641" stroke-width="1.5"/><circle class="beacon" cx="${x}" cy="${by}" r="5" fill="#E05641" stroke="#fff" stroke-width="1.5"/>`; };
  const wire = (x, y, H, stroke, id, vacant, beacon) => { trackTop(y - TH - H); const p = faces(x, y, H); return `<g class="seat" ${id ? `data-id="${id}"` : ''}><polygon points="${p.rf}" fill="none" stroke="${stroke}"/><polygon points="${p.lf}" fill="none" stroke="${stroke}"/><polygon points="${p.top}" fill="rgba(255,255,255,.35)" stroke="${stroke}"/>${vacant ? '<title>Lloc lliure</title>' : ''}${beacon || ''}</g>`; };
  const band = (x, y, h1, h2, oL, oR, T, stroke) => `<polygon points="${x},${y + TH - h1} ${x + TW},${y - h1} ${x + TW},${y - h2} ${x},${y + TH - h2}" fill="${rgbc(shade(T, .72), oR)}"${stroke ? ` stroke="${stroke}"` : ''}/><polygon points="${x - TW},${y - h1} ${x},${y + TH - h1} ${x},${y + TH - h2} ${x - TW},${y - h2}" fill="${rgbc(shade(T, .92), oL)}"${stroke ? ` stroke="${stroke}"` : ''}/>`;
  const tower = (x, y, H, T, L, id, beacon) => {
    trackTop(y - TH - H);
    const baseH = THK, capH = THK, edge = rgbc(shade(T, .5), .3); let s = '';
    if (H <= baseH + capH) { s += band(x, y, 0, H, .86, .86, T, edge); }
    else { s += band(x, y, 0, baseH, .88, .88, T, edge); s += band(x, y, baseH, H - capH, .26, .22, T, ''); s += band(x, y, H - capH, H, .72, .72, T, edge); }
    const top = `${x},${y - TH - H} ${x + TW},${y - H} ${x},${y + TH - H} ${x - TW},${y - H}`;
    s += `<polygon points="${top}" fill="${rgbc(tint(T, .22), .35)}" stroke="rgba(255,255,255,.5)" stroke-width="1"/>`;
    if (L >= 1) s += `<polygon points="${top}" fill="none" stroke="#E05641" stroke-width="2"/>`;
    return `<g class="seat" data-id="${id}" style="--sc:${rgbc(shade(T, .5))}">${s}${beacon || ''}</g>`;
  };
  const vacantDiamond = (x, y) => `<g class="seat"><polygon points="${x},${y - TH * .58} ${x + TW * .58},${y} ${x},${y + TH * .58} ${x - TW * .58},${y}" fill="none" stroke="rgba(27,25,36,.22)" stroke-dasharray="3 3"/><title>Lloc lliure</title></g>`;
  const seatParts = opts.seatParts || ((s, ctx) => ({ cube: vacantDiamond(ctx.x, ctx.y) }));

  const LABEL_GAP = 28;
  const floorXBounds = floors.map((f) => {
    let floorMinX = 1e9, floorMaxX = -1e9;
    f.cells.forEach(([c, r]) => {
      const [x] = getPos(c, r);
      floorMinX = Math.min(floorMinX, x - TW);
      floorMaxX = Math.max(floorMaxX, x + TW);
    });
    return floorMinX === 1e9 ? null : { minX: floorMinX, maxX: floorMaxX };
  });
  const buildingMinX = Math.min(...floorXBounds.filter(Boolean).map((b) => b.minX));
  const buildingMaxX = Math.max(...floorXBounds.filter(Boolean).map((b) => b.maxX));
  const buildingCenterX = (buildingMinX + buildingMaxX) / 2;
  const floorXShifts = floorXBounds.map((b) => (b ? buildingCenterX - (b.minX + b.maxX) / 2 : 0));

  let allShadows = '', body = '', labels = '';
  floors.forEach((f, i) => {
    if (!f.cells.length) return;
    const yOff = floorOffsets[i]; const has = (c, r) => f.cellset.has(c + ',' + r);
    const openingAt = new Map(); // "c,r,edge" → kind
    (f.openings || []).forEach((o) => openingAt.set(`${o.c},${o.r},${o.edge}`, o.kind));
    const xShift = floorXShifts[i] || 0;
    const rfVis = makeRfVis(has); const lfVis = makeLfVis(has);
    const brVis = makeBrVis(has); const blVis = makeBlVis(has);
    let fWalls = '', fGround = '', fGroundShadow = '', fGlow = '', fCubes = '';
    let fMinX = 1e9, fMaxX = -1e9, fTopY = 1e9;
    const centerSet = new Set(f.cells.map(([c, r]) => {
      const [x, y] = getPos(c, r);
      return `${x + xShift},${y + yOff}`;
    }));
    const hasRearCellBeyond = (x, y, dx) => {
      for (let n = 1; n <= f.cells.length; n++) {
        if (centerSet.has(`${x + dx * n},${y - TH * n}`)) return true;
      }
      return false;
    };
    // Height of the back walls, in screen px: spans roughly the inter-floor gap
    // so the floor reads as an enclosed room rather than a floating slab.
    const WALL_H = maxH + TH;
    // Overlay a frame on the wall quad. p0/p1 are the two ground vertices,
    // p0t/p1t the two top vertices (p0→p0t is the rising edge). Window sits at
    // mid-height; door rises from the ground. Interpolated so it follows the
    // isometric perspective. No hole is cut.
    const openingFrame = (p0, p1, p0t, p1t, kind) => {
      const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      // Openings span the full width of their wall block (no horizontal inset).
      const g0 = p0, g1 = p1;
      const t0 = p0t, t1 = p1t;
      const vLo = kind === 'door' ? 0 : 0.32;
      const vHi = kind === 'door' ? 0.62 : 0.7;
      const bl = lerp(g0, t0, vLo), tl = lerp(g0, t0, vHi);
      const br = lerp(g1, t1, vLo), tr = lerp(g1, t1, vHi);
      const fill = kind === 'door' ? 'rgba(110,110,115,.55)' : 'rgba(120,140,170,.35)';
      const stroke = kind === 'door' ? 'rgba(80,80,88,.18)' : 'rgba(95,120,155,.18)';
      return `<polygon class="opening opening-${kind}" points="${bl[0]},${bl[1]} ${br[0]},${br[1]} ${tr[0]},${tr[1]} ${tl[0]},${tl[1]}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    };
    f.cells.forEach(([c, r]) => {
      const [xBase, y0] = getPos(c, r); const x0 = xBase + xShift; const y = y0 + yOff;
      fMinX = Math.min(fMinX, x0 - TW); fMaxX = Math.max(fMaxX, x0 + TW);
      if (y - TH < fTopY) fTopY = y - TH;
      // Back walls rise from the rear ground edges (top vertex → side vertex),
      // extruded upward by WALL_H. Drawn first so they sit behind everything.
      if (brVis(c, r) && !hasRearCellBeyond(x0, y, TW)) {
        const brPts = `${x0},${y - TH} ${x0 + TW},${y} ${x0 + TW},${y - WALL_H} ${x0},${y - TH - WALL_H}`;
        fWalls += `<polygon points="${brPts}" fill="rgb(247,246,243)"/><polygon points="${brPts}" fill="rgba(27,25,36,.032)" stroke="rgba(27,25,36,.045)" stroke-width=".5"/>`;
        const brKind = openingAt.get(`${c},${r},${brEdge}`);
        if (brKind) {
          fWalls += openingFrame([x0, y - TH], [x0 + TW, y], [x0, y - TH - WALL_H], [x0 + TW, y - WALL_H], brKind);
        }
        if (y - TH - WALL_H < fTopY) fTopY = y - TH - WALL_H;
        ext(x0 + TW, y - TH - WALL_H);
      }
      if (blVis(c, r) && !hasRearCellBeyond(x0, y, -TW)) {
        const blPts = `${x0},${y - TH} ${x0 - TW},${y} ${x0 - TW},${y - WALL_H} ${x0},${y - TH - WALL_H}`;
        fWalls += `<polygon points="${blPts}" fill="rgb(247,246,243)"/><polygon points="${blPts}" fill="rgba(27,25,36,.052)" stroke="rgba(27,25,36,.045)" stroke-width=".5"/>`;
        const blKind = openingAt.get(`${c},${r},${blEdge}`);
        if (blKind) {
          fWalls += openingFrame([x0, y - TH], [x0 - TW, y], [x0, y - TH - WALL_H], [x0 - TW, y - WALL_H], blKind);
        }
        if (y - TH - WALL_H < fTopY) fTopY = y - TH - WALL_H;
        ext(x0 - TW, y - TH - WALL_H);
      }
      // Depth-anchor shadow: a copy of each ground diamond, blurred as a group
      // so the per-cell diamonds melt into one soft patch that traces the
      // room's silhouette. Drawn behind the floor with no vertical offset, so
      // the blur halo bleeds out evenly past every edge (front and sides) —
      // a directional nudge would leave the far edge unshaded and the near
      // edge dark, reading as if the shadow stopped one cell short. Each
      // diamond is inflated about its own centre by SHADOW_PAD so the silhouette
      // sits slightly proud of the floor on every side (a deliberate padding,
      // not just blur spill). The even halo reads as a floor resting under
      // overhead light, fixing the otherwise-ambiguous iso depth.
      const SHADOW_PAD = 1.31;
      const sw = TW * SHADOW_PAD, sh = TH * SHADOW_PAD;
      fGroundShadow += `<polygon points="${x0},${y - sh} ${x0 + sw},${y} ${x0},${y + sh} ${x0 - sw},${y}"/>`;
      const cellPts = `${x0},${y - TH} ${x0 + TW},${y} ${x0},${y + TH} ${x0 - TW},${y}`;
      let cellG = `<polygon points="${cellPts}" fill="rgb(247,246,243)"/><polygon class="ct" points="${cellPts}" fill="rgba(247,246,243,.4)" stroke="rgba(27,25,36,.09)"/>`;
      if (rfVis(c, r)) cellG += `<polygon points="${x0 + TW},${y} ${x0},${y + TH} ${x0},${y + TH + THK} ${x0 + TW},${y + THK}" fill="rgba(27,25,36,.05)"/>`;
      if (lfVis(c, r)) cellG += `<polygon points="${x0 - TW},${y} ${x0},${y + TH} ${x0},${y + TH + THK} ${x0 - TW},${y + THK}" fill="rgba(27,25,36,.08)"/>`;
      fGround += `<g class="iso-cell">${cellG}</g>`;
      ext(x0 - TW, y - TH); ext(x0 + TW, y + TH + THK);
    });
    // Topmost point actually drawn on this floor (slab, or tallest tower/beacon
    // once seats render below); the label hangs just above it.
    let fContentTop = fTopY;
    trackTop = ty => { if (ty < fContentTop) fContentTop = ty; };
    const seats = f.assigned.slice().sort(sortFn);
    seats.forEach(s => {
      const [xBase, y0] = getPos(s.c, s.r); const x0 = xBase + xShift; const y = y0 + yOff;
      const parts = seatParts(s, { x: x0, y, TW, TH, minH, maxH, faces, wire, tower, band, mkBeacon, vacantDiamond });
      if (!parts) return;
      if (parts.glow) fGlow += parts.glow;
      if (parts.cube) fCubes += parts.cube;
    });
    if (fGroundShadow) allShadows += `<g filter="url(#floordrop)" fill="rgba(27,25,36,.1)">${fGroundShadow}</g>`;
    body += fWalls + fGround + fGlow + fCubes;
    if (showLabels && f.name) {
      const labelY = fContentTop - LABEL_GAP;
      const labelX = (fMinX + fMaxX) / 2;
      ext(fMinX, labelY - 16); ext(fMaxX, labelY);
      labels += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" font-family="Inter,sans-serif" font-weight="600" letter-spacing="1.5" fill="rgba(27,25,36,.55)" paint-order="stroke" stroke="rgba(247,246,243,.9)" stroke-width="3">${escapeXml(f.name.toUpperCase())}</text>`;
    }
  });
  const pad = 30, vb = `${minX - pad} ${minY - pad} ${(maxX - minX) + pad * 2} ${(maxY - minY) + pad * 2}`;
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="bg" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter><filter id="floordrop" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter></defs><g>${allShadows}${body}</g><g>${labels}</g></svg>`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
