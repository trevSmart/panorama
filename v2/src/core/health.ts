// Port of the health() / verdict / pillars computation from src/app-main.js
// (lines 99-147), as pure functions over data instead of reading globals.
import { formatDurationSec } from '@core/ui/duration.js';
import { isLiveDataMode } from '@core/data/mode.js';
import type { Agent, Queue } from './types';

export type PillarState = 'ok' | 'watch' | 'alert';

export interface Pillar {
  id: string;
  view: string;
  lbl: string;
  val: string | number;
  raw: number;
  state: PillarState;
  msg: Record<PillarState, string>;
}

export interface Health {
  online: number;
  backlog: number;
  longest: number;
  util: number;
  flags: number;
  sla: number;
  pillars: Pillar[];
  worst: PillarState;
}

const RANK: Record<PillarState, number> = { ok: 0, watch: 1, alert: 2 };

export function computeHealth(agents: Agent[], queues: Queue[]): Health {
  const online = agents.filter((a) => a.status === 'online').length;
  const backlog = queues.reduce((s, q) => s + (q.backlog || 0), 0);
  const longest = queues.length ? Math.max(0, ...queues.map((q) => q.longest || 0)) : 0;
  const totCap = agents.filter((a) => a.status !== 'offline').reduce((s, a) => s + (a.max || 0), 0);
  const totUsed = agents.reduce((s, a) => s + (a.used || 0), 0);
  const util = totCap > 0 ? Math.round((totUsed / totCap) * 100) : 0;
  const flags = agents.filter((a) => a.flag).length;
  const sla = Math.max(70, Math.min(99, 98 - Math.round(backlog * 0.9) - (longest > 180 ? 6 : 0)));

  const lvl = (v: number, w: number, a: number): PillarState => (v >= a ? 'alert' : v >= w ? 'watch' : 'ok');

  const allPillars: Pillar[] = [
    {
      id: 'wait', view: 'queues', lbl: 'Espera', val: formatDurationSec(longest, { short: true }), raw: longest, state: lvl(longest, 150, 240),
      msg: { ok: 'dins de marge', watch: 'pujant', alert: 'sobre el llindar' },
    },
    {
      id: 'backlog', view: 'queues', lbl: 'Backlog', val: backlog, raw: backlog, state: lvl(backlog, 18, 30),
      msg: { ok: 'estable', watch: 'creixent', alert: 'acumulant-se' },
    },
    {
      id: 'cover', view: 'agents', lbl: 'Cobertura', val: `${util}%`, raw: util, state: lvl(util, 82, 93),
      msg: { ok: 'folgada', watch: 'ajustada', alert: 'al límit' },
    },
    {
      id: 'sla', view: 'queues', lbl: 'SLA', val: `${sla}%`, raw: sla, state: sla >= 90 ? 'ok' : sla >= 80 ? 'watch' : 'alert',
      msg: { ok: 'complint', watch: 'al caire', alert: 'incomplint' },
    },
    {
      id: 'help', view: 'agents', lbl: 'Ajuda', val: flags, raw: flags, state: flags === 0 ? 'ok' : flags <= 1 ? 'watch' : 'alert',
      msg: { ok: 'cap petició', watch: '1 agent espera', alert: `${flags} agents esperen` },
    },
  ];

  const pillars = isLiveDataMode()
    ? allPillars.filter((p) => p.id !== 'sla' && p.id !== 'help')
    : allPillars;
  const worst = pillars.reduce<PillarState>((w, p) => (RANK[p.state] > RANK[w] ? p.state : w), 'ok');

  return { online, backlog, longest, util, flags, sla, pillars, worst };
}

export interface Verdict {
  dot: PillarState;
  title: string;
  sub: string;
}

export function computeVerdict(h: Health): Verdict {
  const attn = h.pillars.filter((p) => p.state !== 'ok');
  if (h.worst === 'ok') {
    return {
      dot: 'ok',
      title: 'Tot va bé.',
      sub: 'Cap cosa que requereixi la teva atenció ara mateix. Pots dedicar-te a una altra cosa amb tranquil·litat.',
    };
  }
  if (h.worst === 'watch') {
    return {
      dot: 'watch',
      title: 'Tot bé, amb un ull a sobre.',
      sub: `Res urgent, però hi ha ${attn.length}${attn.length === 1 ? ' indicador' : ' indicadors'} que val la pena vigilar: ${attn.map((p) => p.lbl.toLowerCase()).join(', ')}.`,
    };
  }
  const al = h.pillars.filter((p) => p.state === 'alert');
  return {
    dot: 'alert',
    title: al.length === 1 ? 'Una cosa necessita la teva atenció.' : 'Hi ha coses per atendre.',
    sub: `Mira ${al.map((p) => p.lbl.toLowerCase()).join(' i ')}. Toca per anar directe al detall.`,
  };
}
