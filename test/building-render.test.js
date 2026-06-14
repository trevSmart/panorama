import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBuildingSVG } from '../src/building-render.js';

const TW = 34;
const TH = 17;

function makeLRoom() {
  const cells = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) cells.push([c, r]);
  for (let r = 0; r < 4; r++) for (let c = 7; c < 11; c++) cells.push([c, r]);
  return {
    name: 'L room',
    cells,
    cellset: new Set(cells.map(([c, r]) => `${c},${r}`)),
    assigned: [],
  };
}

function makeRectRoom(name, cols, rows) {
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
  return {
    name,
    cells,
    cellset: new Set(cells.map(([c, r]) => `${c},${r}`)),
    assigned: [],
  };
}

function gridExtents(floors) {
  let gMaxC = 0;
  let gMaxR = 0;
  floors.forEach((f) => f.cells.forEach(([c, r]) => {
    if (c > gMaxC) gMaxC = c;
    if (r > gMaxR) gMaxR = r;
  }));
  return { gMaxC, gMaxR };
}

function getPosForDir(dir, gMaxC, gMaxR) {
  if (dir === 1) return (c, r) => [(r - c) * TW, (r + c) * TH];
  if (dir === 2) return (c, r) => [(gMaxR - r - c) * TW, (gMaxR - r + c) * TH];
  if (dir === 3) return (c, r) => [(r + c - gMaxC) * TW, (r + gMaxC - c) * TH];
  return (c, r) => [(c - r) * TW, (c + r) * TH];
}

function keyEdge(a, b) {
  return `${a[0]},${a[1]} ${b[0]},${b[1]}`;
}

function expectedRearEdges(floor, dir, gMaxC, gMaxR) {
  const getPos = getPosForDir(dir, gMaxC, gMaxR);
  const centers = new Map();
  floor.cells.forEach(([c, r]) => {
    const [x, y] = getPos(c, r);
    centers.set(`${x},${y}`, true);
  });

  const edges = new Set();
  floor.cells.forEach(([c, r]) => {
    const [x, y] = getPos(c, r);
    if (!centers.has(`${x + TW},${y - TH}`)) edges.add(keyEdge([x, y - TH], [x + TW, y]));
    if (!centers.has(`${x - TW},${y - TH}`)) edges.add(keyEdge([x, y - TH], [x - TW, y]));
  });
  return edges;
}

function renderedRearEdges(svg) {
  const edges = new Set();
  const wallPolygon = /<polygon points="([^"]+)" fill="rgba\(27,25,36,\.[0-9]+\)" stroke="rgba\(27,25,36,\.[0-9]+\)" stroke-width="\.5"/g;
  for (const match of svg.matchAll(wallPolygon)) {
    const points = match[1].split(' ').slice(0, 2);
    edges.add(points.join(' '));
  }
  return edges;
}

function buildWithMeta(floors, dir = 0, opts = {}) {
  const meta = { anchors: [] };
  const svg = buildBuildingSVG(floors, dir, { ...opts, meta });
  return { svg, meta };
}

test('rotated room walls follow the screen-space rear perimeter', () => {
  const floor = makeLRoom();
  const floors = [floor];
  const { gMaxC, gMaxR } = gridExtents(floors);

  for (const dir of [0, 1, 2, 3]) {
    const actual = renderedRearEdges(buildBuildingSVG(floors, dir));
    const expected = expectedRearEdges(floor, dir, gMaxC, gMaxR);
    assert.deepEqual(actual, expected, `dir ${dir}`);
  }
});

test('rear walls are skipped when floor cells continue farther behind them', () => {
  const floor = {
    name: 'Staggered room',
    cells: [[0, 0], [2, 0]],
    cellset: new Set(['0,0', '2,0']),
    assigned: [],
  };

  const svg = buildBuildingSVG([floor], 0);
  const edges = renderedRearEdges(svg);

  assert.equal(edges.has('68,17 34,34'), false);
});

test('floor label anchors follow editor list order — first floor sits highest on screen', () => {
  const floors = [
    makeRectRoom('Top floor', 6, 4),
    makeRectRoom('Bottom floor', 6, 4),
  ];
  const { svg, meta } = buildWithMeta(floors, 0);
  assert.doesNotMatch(svg, /<text[^>]*>TOP FLOOR<\/text>/);
  assert.equal(meta.anchors.length, 2);
  assert.match(meta.anchors[0].name, /Top floor/i);
  assert.match(meta.anchors[1].name, /Bottom floor/i);
  assert.ok(meta.anchors[0].y < meta.anchors[1].y, 'first list item should sit above the second');
});

test('rooms are centered by their projected footprint after rotation', () => {
  const floors = [
    makeRectRoom('Wide room', 11, 7),
    makeRectRoom('Narrow room', 4, 4),
  ];

  for (const dir of [0, 1, 2, 3]) {
    const { meta } = buildWithMeta(floors, dir);
    assert.equal(meta.anchors.length, 2, `dir ${dir}`);
    assert.equal(meta.anchors[1].x, meta.anchors[0].x, `dir ${dir}`);
  }
});

test('a window opening on a visible rear edge draws a window frame', () => {
  const floor = {
    name: 'Cell',
    cells: [[0, 0]],
    cellset: new Set(['0,0']),
    assigned: [],
    openings: [{ c: 0, r: 0, edge: 'N', kind: 'window' }],
  };
  const svg = buildBuildingSVG([floor], 0);
  assert.match(svg, /class="opening opening-window"/);
});

test('a door opening on a visible rear edge draws a door frame', () => {
  const floor = {
    name: 'Cell',
    cells: [[0, 0]],
    cellset: new Set(['0,0']),
    assigned: [],
    openings: [{ c: 0, r: 0, edge: 'O', kind: 'door' }],
  };
  const svg = buildBuildingSVG([floor], 0);
  assert.match(svg, /class="opening opening-door"/);
});

test('an opening on a non-visible edge is not drawn', () => {
  const floor = {
    name: 'Cell',
    cells: [[0, 0]],
    cellset: new Set(['0,0']),
    assigned: [],
    openings: [{ c: 0, r: 0, edge: 'S', kind: 'window' }],
  };
  const svg = buildBuildingSVG([floor], 0);
  assert.doesNotMatch(svg, /class="opening/);
});

test('openings draw on each dir\'s rear edges and not on front edges', () => {
  const REAR = { 0: ['N', 'O'], 1: ['O', 'N'], 2: ['O', 'S'], 3: ['E', 'N'] };
  const ALL = ['N', 'S', 'E', 'O'];
  for (const dir of [0, 1, 2, 3]) {
    const rear = REAR[dir];
    for (const edge of ALL) {
      const floor = {
        name: 'Cell',
        cells: [[0, 0]],
        cellset: new Set(['0,0']),
        assigned: [],
        openings: [{ c: 0, r: 0, edge, kind: 'window' }],
      };
      const svg = buildBuildingSVG([floor], dir);
      const drawn = /class="opening/.test(svg);
      assert.equal(drawn, rear.includes(edge), `dir ${dir} edge ${edge}`);
    }
  }
});

test('rendering without openings field is tolerated', () => {
  const floor = {
    name: 'Cell',
    cells: [[0, 0]],
    cellset: new Set(['0,0']),
    assigned: [],
  };
  assert.doesNotThrow(() => buildBuildingSVG([floor], 0));
});
