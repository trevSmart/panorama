import { loadCustomPlaces, loadActivePlaceId } from './floor-store.js';

export const TEAM_COLOR = {
  Atenció: [106, 91, 232],
  Vendes: [21, 160, 106],
  Suport: [217, 152, 31],
  Incidències: [224, 86, 65],
  Retenció: [169, 138, 255],
  Operations: [106, 91, 232],
};

/** @param {{ role?: string }} agent */
export function teamOf(agent) {
  const part = agent.role?.split('·')[1]?.trim();
  if (part && TEAM_COLOR[part]) return part;
  return 'Operations';
}

function floorBaixa() {
  const cells = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 11; c++) cells.push([c, r]);
  const seats = [];
  [1, 3, 5].forEach((r) => [1, 2, 4, 5, 7, 8, 10].forEach((c) => seats.push([c, r])));
  return { name: 'Planta baixa', cells, seats };
}

function floorPrimera() {
  const cells = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) cells.push([c, r]);
  for (let r = 0; r < 4; r++) for (let c = 7; c < 11; c++) cells.push([c, r]);
  const seats = [];
  [1, 3, 5].forEach((r) => [1, 2, 4, 5].forEach((c) => seats.push([c, r])));
  [1, 3].forEach((r) => [8, 9].forEach((c) => seats.push([c, r])));
  return { name: 'Primera planta · L', cells, seats };
}

/** Built-in default: one place with two sample floors. */
export function defaultPlaces() {
  return [{ id: 'default', name: 'Lloc 1', floors: [floorBaixa(), floorPrimera()] }];
}

/** Custom layout from the floor editor if present, otherwise the built-in design. */
export function basePlaces() {
  return loadCustomPlaces() || defaultPlaces();
}

/** Floors of the active place — used by the team map. */
export function baseFloors() {
  const places = basePlaces();
  const activeId = loadActivePlaceId() || places[0].id;
  const place = places.find((p) => p.id === activeId) || places[0];
  return place.floors;
}

/**
 * @param {Array<{ name?: string, role?: string }>} agents
 */
export function buildFloorsForAgents(agents) {
  const floors = baseFloors();
  const order = ['Atenció', 'Incidències', 'Vendes', 'Suport', 'Retenció', 'Operations'];
  const sorted = agents.slice().sort(
    (a, b) => order.indexOf(teamOf(a)) - order.indexOf(teamOf(b)) || (a.name || '').localeCompare(b.name || ''),
  );
  let k = 0;
  floors.forEach((f) => {
    f.cellset = new Set(f.cells.map(([c, r]) => `${c},${r}`));
    f.assigned = f.seats.map(([c, r]) => ({ c, r, agent: sorted[k++] || null }));
    f.openings = f.openings || [];
  });
  return floors;
}
