// UI-facing domain types, mirrored from the vendored src/lib/data/types.js
// (JSDoc typedefs). These are the shapes the providers return.

export type PresenceStatus = 'online' | 'busy' | 'away' | 'offline';

export interface PanoramaCapabilities {
  canChangePresence: boolean;
  canReassignWork: boolean;
  canChangeQueues: boolean;
  canChangeSkills: boolean;
  canFlagAgent: boolean;
  liveUpdates: boolean;
}

export interface AgentSkill {
  id: string;
  skillId?: string | null;
  name: string;
  type?: string | null;
  level?: number | null;
  startDate?: string | null;
  lastModifiedDate?: string | null;
  lastModifiedBy?: string | null;
}

export interface Agent {
  id: string;
  name: string;
  role?: string;
  recordUrl?: string | null;
  status: PresenceStatus;
  max: number;
  used: number;
  chans?: Record<string, number>;
  queueIds?: string[];
  queues?: string[];
  photo?: string;
  work?: object | null;
  skills?: AgentSkill[] | null;
  workSec?: number;
  loginMin?: number;
  lastAccept?: number | null;
  flag?: boolean;
  flagReason?: string | null;
}

export interface Queue {
  id: string;
  name: string;
  color?: string;
  backlog?: number;
  longest?: number;
  avg?: number;
  online?: number;
}

export interface Skill {
  id: string;
  name: string;
  type?: string | null;
  agents?: number;
  backlog?: number;
}

export interface WorkItem {
  id: string;
  subject: string;
  channelKey?: string;
  queueId?: string | null;
  agentId?: string | null;
  status?: 'queued' | 'assigned' | string;
  ageSec?: number;
}

export type DataSource = 'mock' | 'salesforce';

export interface StatusMeta {
  c: string;
  lbl: string;
}

/** The data provider contract (both mock and salesforce implement this). */
export interface PanoramaProvider {
  source: DataSource;
  capabilities: PanoramaCapabilities;
  getAgents(opts?: { scope?: 'connected' | 'all' }): Agent[] | Promise<Agent[]>;
  getAgentById(id: string): Agent | null;
  getQueues(): Queue[];
  getSkills(): Promise<Skill[]>;
  getSkillAgents(skillId: string): Promise<Agent[]>;
  getAgentSkills(agentId: string): Promise<AgentSkill[]>;
  getWork(): Promise<WorkItem[]>;
  updateAgentSkills(agentId: string, changes: unknown): Promise<unknown>;
  getLegacyBindings(): Record<string, unknown>;
  subscribe?(fn: () => void): () => void;
  startSimulation?(hooks: SimulationHooks): void;
  setRefreshInterval?(cfg: { intervalMs: number; autoRefresh: boolean }): void;
  refresh?(opts?: { poll?: boolean }): Promise<unknown>;
  init?(): Promise<void>;
}

export interface SimulationHooks {
  isView: (v: string) => boolean;
  updateOverviewMetrics?: () => void;
  updateAgents?: () => void;
  updateRoomPanel?: () => void;
  refreshActiveDetail?: () => void;
  queueCard?: (q: Queue) => string;
  activePanelEl?: () => HTMLElement | null;
  Scene3D?: { update: (dt: number) => void };
}
