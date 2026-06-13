import { PHOTOS } from './mock-photos.js';
import { loadCustomFloors } from './floor-store.js';

export const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const pick = (arr) => arr[rnd(0, arr.length - 1)];

export const QUEUES = [
  { id: 'ac', name: 'Atenció Client', color: '#6A5BE8' },
  { id: 'in', name: 'Incidències', color: '#E05641' },
  { id: 've', name: 'Vendes', color: '#15A06A' },
  { id: 'st', name: 'Suport Tècnic', color: '#D9981F' },
  { id: 're', name: 'Retenció', color: '#A98AFF' },
];

export const SKILLS = [
  { id: 'ca', name: 'Català', agents: 14 },
  { id: 'es', name: 'Castellà', agents: 18 },
  { id: 'en', name: 'Anglès', agents: 9 },
  { id: 'fr', name: 'Francès', agents: 5 },
  { id: 'tec', name: 'Suport tècnic L2', agents: 6 },
  { id: 'ven', name: 'Vendes outbound', agents: 4 },
  { id: 'ret', name: 'Retenció premium', agents: 3 },
];

import { CH_LBL } from './channel-labels.js';

export { CH_LBL };

export const STATUS = {
  online: { c: 'var(--ok)', lbl: 'Online' },
  busy: { c: 'var(--alert)', lbl: 'Ocupat' },
  away: { c: 'var(--watch)', lbl: 'Absent' },
  offline: { c: 'var(--off)', lbl: 'Desconnectat' },
};

export const NAMES = [
  ['Núria Ferran', 'Sènior · Atenció'], ['Pau Vidal', 'Agent · Vendes'], ['Aisha Khan', 'Agent · Suport'],
  ['Marc Soler', 'Sènior · Incidències'], ['Lucía Ortega', 'Agent · Atenció'], ['Tariq Aziz', 'Agent · Retenció'],
  ['Emma Roca', 'Agent · Vendes'], ['Jordi Camps', 'Sènior · Suport'], ['Sara Lloret', 'Agent · Atenció'],
  ['Hugo Marín', 'Agent · Incidències'], ['Mei Chen', 'Agent · Suport'], ['Olga Prats', 'Agent · Retenció'],
  ['Iván Mora', 'Agent · Vendes'], ['Carla Bru', 'Sènior · Atenció'], ['Adam Novak', 'Agent · Incidències'],
  ['Laia Pons', 'Agent · Suport'],
  ['Èric Sala', 'Agent · Atenció'], ['Júlia Vives', 'Agent · Vendes'], ['Omar Haddad', 'Agent · Suport'],
  ['Berta Coll', 'Agent · Incidències'], ['Nil Bosch', 'Agent · Retenció'], ['Paula Gil', 'Sènior · Vendes'],
  ['Roger Mas', 'Agent · Suport'], ['Anna Tort', 'Agent · Atenció'], ['Dani Reig', 'Agent · Incidències'],
  ['Clara Vega', 'Agent · Vendes'], ['Marta Pi', 'Agent · Suport'], ['Pol Esteve', 'Agent · Retenció'],
  ['Júlia Font', 'Agent · Atenció'], ['Saïd Amraoui', 'Agent · Suport'], ['Ona Serra', 'Agent · Vendes'],
  ['Bru Llopis', 'Agent · Incidències'], ['Vera Soto', 'Agent · Atenció'], ['Guillem Rius', 'Agent · Suport'],
];

export const WORK_KINDS = [
  { channelKey: 'veu', t: 'Trucada entrant', q: 'ac' },
  { channelKey: 'chat', t: 'Xat web', q: 'st' },
  { channelKey: 'cas', t: 'Cas #', q: 'in' },
  { channelKey: 'wa', t: 'WhatsApp', q: 've' },
  { channelKey: 'email', t: 'Email', q: 'ac' },
];

export const TEAM_COLOR = {
  Atenció: [106, 91, 232],
  Vendes: [21, 160, 106],
  Suport: [217, 152, 31],
  Incidències: [224, 86, 65],
  Retenció: [169, 138, 255],
};

export const teamOf = (a) => a.role.split('·')[1].trim();

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

export let agents = NAMES.map((n, i) => {
  const N = NAMES.length;
  const st = i < N * 0.6 ? 'online' : i < N * 0.72 ? 'busy' : i < N * 0.84 ? 'away' : 'offline';
  const max = pick([4, 5, 5, 6]);
  const used = st === 'offline' ? 0 : st === 'away' ? rnd(0, 1) : rnd(1, max);
  const chans = { veu: 0, chat: 0, email: 0, wa: 0, cas: 0 };
  let left = used;
  while (left > 0) {
    chans[pick(['veu', 'chat', 'wa', 'cas', 'email'])]++;
    left--;
  }
  const wk = used > 0 ? { ...pick(WORK_KINDS) } : null;
  if (wk && wk.t === 'Cas #') wk.t = `Cas #${rnd(48210, 48999)}`;
  return {
    id: `a${i}`,
    name: n[0],
    role: n[1],
    status: st,
    max,
    used,
    chans,
    queues: [pick(QUEUES).id, pick(QUEUES).id],
    photo: PHOTOS[i % PHOTOS.length],
    work: wk,
    workSec: wk ? rnd(40, 900) : 0,
    loginMin: st === 'offline' ? 0 : rnd(25, 380),
    lastAccept: st === 'offline' ? null : rnd(0, 40),
    flag: false,
    flagReason: null,
  };
});

export let queueState = QUEUES.map((q) => ({
  ...q,
  backlog: rnd(1, 9),
  longest: rnd(20, 150),
  avg: rnd(20, 90),
  online: agents.filter((a) => a.queues.includes(q.id) && a.status === 'online').length || rnd(1, 4),
}));

export const FLOORS = loadCustomFloors() || [floorBaixa(), floorPrimera()];

(function assignFloors() {
  const order = ['Atenció', 'Incidències', 'Vendes', 'Suport', 'Retenció'];
  const sorted = agents.slice().sort((a, b) => order.indexOf(teamOf(a)) - order.indexOf(teamOf(b)));
  let k = 0;
  FLOORS.forEach((f) => {
    f.cellset = new Set(f.cells.map(([c, r]) => `${c},${r}`));
    f.assigned = f.seats.map(([c, r]) => ({ c, r, agent: sorted[k++] || null }));
  });
})();
