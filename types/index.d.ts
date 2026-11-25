export type Running = { id: string; ts: number; tool: string; text: string }
export type Job = { pid: number; name: string; mem: number; runSecs: number }
export type Session = {
  id: string
  name: string
  host: string
  pid: number
  alive: boolean
  status: string
  statusSince: number
  cwd: string
  entry: string
  version: string
  model: string
  ctx: number
  lastTs: number
  running: Running | null
  mem: number
  jobs: Job[]
  errors30: number
  lastPrompt: string
  lastSay: string
  /** its rotate threshold in k tokens (its own pick, else the plugin's) */
  rotateK: number
  /** true when the session has its own threshold */
  custom: boolean
  /** tự rotate on */
  auto: boolean
  /** 1 for the first chat, +1 at each rotation */
  life: number
  handoff: string
  rotatedAt: number
  /** alive, but its process left no beat for 5 minutes: the mod is not running in it */
  modDead?: boolean
}
/** ~/.claude/dai-chi-huy/session/<id>.json */
export type SessionSettings = {
  rotateK?: number
  auto?: boolean
  life?: number
  handoff?: string
  rotatedAt?: number
  from?: string
  name?: string
  /** the pid ⏻ tắt ended: its leftover registration shows as ĐÃ TẮT, not CHẾT */
  stoppedPid?: number
}
export type Alert = { sev: 0 | 1 | 2; sid?: string; who: string; text: string }
export type Disk = { free: number; total: number } | null
export type Snapshot = { updated: number; sessions: Session[]; disk: Disk; alerts: Alert[]; rotations: string[] }
export type Conv = {
  id: string
  project: string
  dir: string
  bytes: number
  mtime: number
  live: boolean
  recent: boolean
  title: string
  name: string
  host: string
}
export type Scan = {
  when: number
  convs: Conv[]
  total: number
  periodDays: number | null
  protectHours: number
  disk: Disk
}
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Tab = 'team' | 'alerts' | 'clean'
export type CleanSort = 'size' | 'old' | 'project'

declare module 'claude-code' {
  interface PluginState {
    'dai-chi-huy': {
      tab: Tab
      snapshot: Shaped<Snapshot | null>
      scan: Shaped<Scan | null>
      picked: string[]
      days: number
      sort: CleanSort
      confirm: boolean
      open: string
      stopAsk: string
      note: string
      limits: Shaped<Limit[]>
    }
  }
}
