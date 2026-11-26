import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { LOCALES, fill, langOf } from '../locales/index.mjs'
import type { Alert, CleanSort, Conv, Limit, Scan, Session, SessionSettings, Snapshot, Tab } from '../types'

// Đài Chỉ Huy as a band above the prompt + a pane. The data side is scripts/collect.mjs
// (sessions, alerts, cleanup scan, safe delete).
const PANE = 'dai-chi-huy'

// Every text a person or the agent reads comes from locales/<lang>.mjs, set from the
// `language` option when the module loads.
let lang = 'en'
const t = (key: string, vars?: Record<string, string | number>) => fill(LOCALES[lang]?.[key] ?? key, vars)
const systemLocale = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return ''
  }
}

const tab = atom({ plugin: 'dai-chi-huy', key: 'tab' } as const, 'team' as Tab)
const snapshot = atom({ plugin: 'dai-chi-huy', key: 'snapshot' } as const, null, { shape: 'snap-2' })
const scan = atom({ plugin: 'dai-chi-huy', key: 'scan' } as const, null, { shape: 'scan-1' })
const picked = atom({ plugin: 'dai-chi-huy', key: 'picked' } as const, [] as string[])
const days = atom({ plugin: 'dai-chi-huy', key: 'days' } as const, 0)
const sort = atom({ plugin: 'dai-chi-huy', key: 'sort' } as const, 'size' as CleanSort)
const confirm = atom({ plugin: 'dai-chi-huy', key: 'confirm' } as const, false)
const open = atom({ plugin: 'dai-chi-huy', key: 'open' } as const, '')
// the idle session whose ⏻ tắt was pressed, waiting for "Có, tắt"
const stopAsk = atom({ plugin: 'dai-chi-huy', key: 'stopAsk' } as const, '')
const note = atom({ plugin: 'dai-chi-huy', key: 'note' } as const, '')
// the account's 5-hour and weekly windows, as the last API response reported them
const limits = atom({ plugin: 'dai-chi-huy', key: 'limits' } as const, [] as Limit[], { shape: 'limits-1' })

const DAY_STEPS = [3, 7, 14, 30, 60, 90]

// ---------- formatting (util.rs) ----------
const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.floor(n / 1000)}k` : String(n))
const fmtMem = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`)
const fmtAge = (s: number) => s < 0 ? '–' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m`
  : s < 86400 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
  : `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`
const bar = (frac: number, w: number) => {
  const f = Math.max(0, Math.min(1, frac)) * w
  const full = Math.floor(f)
  return '█'.repeat(full) + '·'.repeat(w - full)
}
const toolLabel = (t: string) => (t.startsWith('mcp__') ? t.slice(5).replace(/^claude-in-/, '').replace('__', '·') : t)
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)
const modelShort = (m: string) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '')

function statusOf(s: Session): { icon: string; label: string; color: string } {
  if (s.status === 'stopped') return { icon: '⏻', label: t('stStopped'), color: 'inactive' }
  if (!s.alive) return { icon: '✕', label: t('stDead'), color: 'error' }
  switch (s.status) {
    case 'busy': return { icon: '●', label: t('stBusy'), color: 'success' }
    case 'shell': return { icon: '●', label: t('stShell'), color: 'suggestion' }
    case 'waiting': return { icon: '●', label: t('stWaiting'), color: 'warning' }
    case 'idle': return { icon: '○', label: t('stIdle'), color: 'inactive' }
    default: return { icon: '○', label: s.status.toUpperCase(), color: 'subtle' }
  }
}
// ---------- quota bars (first row of the band above the chat box) ----------
const QUOTA = [
  { kind: 'five_hour', label: 'quota5h' },
  { kind: 'seven_day', label: 'quotaWeek' },
] as const
const leftOf = (l: Limit, now: number) => (l.resetsAt ? Math.round((Date.parse(l.resetsAt) - now) / 1000) : -1)
// green under 70 %, yellow from 70, red from 90
const quotaColor = (p: number) => (p >= 90 ? 'error' : p >= 70 ? 'warning' : 'success')

// ---------- per-session settings, shared by every session's copy of the mod ----------
// One small JSON file per session under ~/.claude/dai-chi-huy/session/<id>.json: its own rotate
// threshold, whether it rotates by itself, which life it is and its last handoff. The pane of any
// session writes them; the session itself reads its own when it decides to rotate.
const THRESHOLD_CHOICES = [250, 350, 500]
let dataDir = ''
let terminal = false // terminal `claude`: no "Đài Chỉ Huy ⚠" row under the prompt
const settingsPath = (id: string) => `${dataDir}/session/${id}.json`

async function readSettings($: EngineInterface, id: string): Promise<SessionSettings> {
  try {
    const v = JSON.parse(await $.fs.read(settingsPath(id)))
    return v && typeof v === 'object' ? (v as SessionSettings) : {}
  } catch {
    return {}
  }
}

async function writeSettings($: EngineInterface, id: string, patch: Partial<SessionSettings>) {
  const next: Record<string, unknown> = { ...(await readSettings($, id)), ...patch }
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
  await $.fs.write(settingsPath(id), JSON.stringify(next, null, 2))
}

async function setThreshold($: EngineInterface, id: string, k: number) {
  await writeSettings($, id, { rotateK: k === cfg.rotateK ? undefined : k })
  await refresh($)
}

async function setAuto($: EngineInterface, id: string, on: boolean) {
  await writeSettings($, id, { auto: on ? undefined : false })
  await refresh($)
}

// ---------- tự rotate: handoff .md → /clear → the new chat reads it and carries on ----------
// Each session's own copy of the mod watches its own context. Past its threshold it asks the
// agent to write a handoff: at the end of a turn as a prompt of its own, or, in a long turn, in a
// note after a tool's result (stop at a safe point, write it, end the turn). The turn that wrote
// it ends in /clear (same sidebar row, same name) and the new chat starting on that handoff.
// `mid`: asked by the note inside a running turn.
// `why`: what set it off, for the log and the new chat's first prompt.
type Phase = { kind: 'idle' } | { kind: 'writing'; file: string; since: number; k: number; ctx: number; name: string; turns: number; mid: boolean; why: string }
let phase: Phase = { kind: 'idle' }
// after a rotation that did not happen (interrupted, no file), wait for this much more context
let skipBelow = 0

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'phien'

function stamp(ms: number) {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

// A work card, not a history: the new chat must start the next step in 1-2 minutes,
// so the card says exactly what to read. History lives in the project's own PROGRESS/notes.
const handoffSections = () => ['cardIntro', 'cardNext', 'cardRead', 'cardState', 'cardNotes'].map(k => t(k))

const handoffPrompt = (file: string, ctx: number, k: number) => [
  t('rotateHead', { ctx: fmtTokens(ctx), k }),
  t('rotateWrite', { file }),
  ...handoffSections(),
  t('rotateDone'),
].join('\n')

// read by the model after a tool's result, inside a long turn
const midTurnNote = (file: string, ctx: number, k: number) => [
  t('midHead', { ctx: fmtTokens(ctx), k }),
  t('midStop'),
  t('midWrite', { file }),
  ...handoffSections(),
  t('midDone'),
].join('\n')

// The last line (selfRotate) lets the model pick its own rotation point: rotating mid-step costs the
// next chat a full re-read, so after a step it may hand over by itself; the threshold is only the safety net.
const resumePrompt = (name: string, life: number, file: string, why: string) => [
  t('resumeHead', { name, life, why }),
  t('resumeRead', { file }),
  t('resumeWait'),
  t('selfRotate'),
].join('\n')

// Past this session's threshold with tự rotate on: moves to `writing` and returns the request.
async function startRotate($: EngineInterface, mid: boolean) {
  if (phase.kind !== 'idle' || !dataDir) return
  const ctx = (await $.session.usage()).context.tokens ?? 0
  // no settings read below the lowest threshold a session can have (this runs on every tool call)
  if (ctx < Math.min(cfg.rotateK, ...THRESHOLD_CHOICES) * 1000 || ctx < skipBelow) return
  const id = await $.session.id()
  const st = await readSettings($, id)
  if (st.auto === false) return
  const k = st.rotateK ?? cfg.rotateK
  if (ctx < k * 1000 || phase.kind !== 'idle') return
  const snap = await read($, snapshot)
  const name = snap?.sessions.find(s => s.id === id)?.name ?? st.name ?? id.slice(0, 8)
  const now = await $.clock.now()
  const file = `${dataDir}/handoff/${slug(name)}/${stamp(now)}-${id.slice(0, 8)}.md`
  phase = { kind: 'writing', file, since: now, k, ctx, name, turns: 0, mid, why: t('whyMark', { k }) }
  $.ui.toast(t(mid ? 'toastRotateMid' : 'toastRotate', { ctx: fmtTokens(ctx), k }))
  return (mid ? midTurnNote : handoffPrompt)(file, ctx, k)
}

// After the person presses Stop the engine drops a plugin's prompts and refuses its commands
// ("a Stop stands") until the person sends one: then nothing waits, and the next turn end retries
// (the `blocked` toast).
async function checkRotate($: EngineInterface) {
  const text = await startRotate($, false)
  if (!text) return
  const sent = await $.prompt.submit({ text }).catch((err: unknown) => ({ drop: String(err) }))
  if (sent.drop !== undefined) {
    phase = { kind: 'idle' }
    $.ui.toast(t('blocked'))
  }
}

async function afterHandoff($: EngineInterface, isAborted: boolean) {
  if (phase.kind !== 'writing') return
  const p = phase
  const written = await $.fs.stat(p.file).then(s => s.mtimeMs >= p.since - 5000).catch(() => false)
  // the long turn ended without the handoff (the agent stopped for a question, say): ask for it
  // as a prompt of its own, as at any turn's end
  if (p.mid && !isAborted && !written) {
    phase = { kind: 'idle' }
    return checkRotate($)
  }
  // a prompt the person queued may run before the handoff one: give it up to 3 turns
  if (!isAborted && !written && p.turns < 2) {
    phase = { ...p, turns: p.turns + 1 }
    return
  }
  phase = { kind: 'idle' }
  if (isAborted || !written) {
    skipBelow = p.ctx + 30_000
    $.ui.toast(t(isAborted ? 'toastAborted' : 'toastNoFile'))
    return
  }
  const oldId = await $.session.id()
  const st = await readSettings($, oldId)
  const cleared = await $.command.run({ command: 'clear' }).then(() => true, () => false)
  if (!cleared) {
    $.ui.toast(t('blocked'))
    return
  }
  const newId = await $.session.id()
  selfId = newId
  skipBelow = 0
  const life = (st.life ?? 1) + 1
  const now = await $.clock.now()
  await writeSettings($, newId, { ...st, name: p.name, life, handoff: p.file, rotatedAt: now, from: oldId })
  const logPath = `${dataDir}/rotate.log`
  const old = await $.fs.read(logPath).catch(() => '')
  const line = `${new Date(now).toLocaleString('sv-SE').slice(0, 16)} | ${p.name} | ${t('logLife', { from: life - 1, to: life })} | ${fmtTokens(p.ctx)} · ${p.why} | ${p.file}`
  await $.fs.write(logPath, `${old}${line}\n`)
  const resume = resumePrompt(p.name, life, p.file, p.why)
  const sent = await $.prompt.submit({ text: resume }).catch((err: unknown) => ({ drop: String(err) }))
  if (sent.drop !== undefined) {
    // the new chat is open but empty: leave the resume request in the prompt box, one Enter away
    await $.prompt.fill({ text: resume }).catch(() => undefined)
    $.ui.toast(t('toastPressEnter'))
  }
  await refresh($)
}

// Rotate at a natural stop ("đổi chat trước khi chờ"). Before a turn that ends
// waiting for the person, the agent writes its handoff to request/<CLAUDE_CODE_SESSION_ID>.md;
// at that turn's end the mod takes it and rotates when the context is past REQUEST_MIN_K (a
// smaller chat would gain little). The id in the agent's shell can be an older id of this same
// chat (set when its process started), so the chain of `from` ids is searched too.
const REQUEST_MIN_K = 120

async function takeRequest($: EngineInterface): Promise<boolean> {
  if (phase.kind !== 'idle' || !dataDir) return false
  const id = await $.session.id()
  let path = ''
  let text = ''
  for (let cur: string | undefined = id, hops = 0; cur && hops < 20; hops++) {
    const p = `${dataDir}/request/${cur}.md`
    const t = await $.fs.read(p).catch(() => '')
    if (t.trim()) {
      path = p
      text = t
      break
    }
    cur = (await readSettings($, cur)).from
  }
  if (!path) return false
  // taken either way: an empty file is no request
  await $.fs.write(path, '')
  const st = await readSettings($, id)
  if (st.auto === false) return false
  const ctx = (await $.session.usage()).context.tokens ?? 0
  if (ctx < REQUEST_MIN_K * 1000) {
    $.ui.toast(t('toastSmall', { ctx: fmtTokens(ctx), min: REQUEST_MIN_K }))
    return false
  }
  const snap = await read($, snapshot)
  const name = snap?.sessions.find(s => s.id === id)?.name ?? st.name ?? id.slice(0, 8)
  const now = await $.clock.now()
  const file = `${dataDir}/handoff/${slug(name)}/${stamp(now)}-${id.slice(0, 8)}.md`
  await $.fs.write(file, text)
  phase = { kind: 'writing', file, since: now, k: st.rotateK ?? cfg.rotateK, ctx, name, turns: 0, mid: false, why: t('whySelf', { ctx: fmtTokens(ctx) }) }
  await afterHandoff($, false)
  return true
}

const SEV = [
  { label: 'sevCrit', color: 'error' },
  { label: 'sevWarn', color: 'warning' },
  { label: 'sevInfo', color: 'suggestion' },
] as const

type Cfg = { rotateK: number; warnK: number; memWarnMb: number; quietBusyMin: number; protectHours: number }
let cfg: Cfg = { rotateK: 250, warnK: 230, memWarnMb: 1500, quietBusyMin: 15, protectHours: 24 }
let cleanupDays = 7
let polling = false
let lastPoll = 0
const errText = (err: unknown) => String((err as Error)?.message ?? err)

async function collect($: EngineInterface, mode: 'snapshot' | 'scan' | 'delete', extra: object = {}) {
  const script = `${$.plugin.root}/scripts/collect.mjs`
  const r = await $.process.run(['node', script, mode], {
    stdin: JSON.stringify({ ...cfg, dataDir, lang, ...extra }),
    timeoutMs: mode === 'snapshot' ? 30_000 : 300_000,
  })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim().split(/\r?\n/).at(-1) || `collect ${mode} exit ${r.exitCode}`)
  return JSON.parse(r.stdout)
}

async function refresh($: EngineInterface) {
  if (polling) return
  polling = true
  try {
    const snap: Snapshot = await collect($, 'snapshot')
    await update($, snapshot, () => snap)
    const crit = snap.alerts.filter(a => a.sev === 0).length
    const warn = snap.alerts.filter(a => a.sev === 1).length
    $.ui.status(!terminal && crit + warn > 0 ? t('statusLine', { crit, warn }) : undefined)
  } catch (err) {
    await update($, note, () => t('errRead', { err: errText(err) }))
  } finally {
    polling = false
    lastPoll = await $.clock.now()
  }
}

async function rescan($: EngineInterface) {
  await update($, note, () => t('scanning'))
  try {
    const s: Scan = await collect($, 'scan')
    await update($, scan, () => s)
    await update($, picked, list => list.filter(k => s.convs.some(c => `${c.project}/${c.id}` === k)))
    await update($, note, () => '')
  } catch (err) {
    await update($, note, () => t('errScan', { err: errText(err) }))
  }
}

async function deletePicked($: EngineInterface) {
  const ids = await read($, picked)
  await update($, confirm, () => false)
  await update($, note, () => t('deleting', { n: ids.length }))
  try {
    const r = await collect($, 'delete', { ids })
    await update($, picked, () => [])
    await update($, note, () => [
      t('deleted', { n: r.deleted, size: fmtMem(r.freed) }),
      r.errors.length ? t('skipped', { list: r.errors.join('; ') }) : '',
      t('logAt', { path: r.log }),
    ].filter(Boolean).join(' '))
  } catch (err) {
    await update($, note, () => t('errDelete', { err: errText(err) }))
  }
  await rescan($)
  await refresh($)
}

// a session of the desktop app (it has a page there); any other runs in a terminal
const inApp = (s: Session) => /^local_[0-9a-f-]+$/i.test(s.host)

// ⏻ tắt: end an idle session's process so it stops holding RAM. The chat stays: the app starts
// its session again when the user next sends it a message, a terminal one opens again in a new
// window from its name (jump). Checked again on a fresh snapshot right before (still the same
// pid, alive and idle); never this session. Only the session process itself: its background
// jobs keep running.
const canStop = (s: Session) => s.alive && s.status === 'idle' && s.id !== selfId && s.pid > 0

async function stopSession($: EngineInterface, id: string) {
  await update($, stopAsk, () => '')
  const before = (await read($, snapshot))?.sessions.find(x => x.id === id)
  await refresh($)
  const s = (await read($, snapshot))?.sessions.find(x => x.id === id)
  if (!s || !before || s.pid !== before.pid || !canStop(s)) {
    $.ui.toast(s ? t('stopNotIdle', { name: s.name }) : t('stopChanged'))
    return
  }
  const r = await $.process.run(['taskkill.exe', '/PID', String(s.pid), '/F'])
  if (r.exitCode !== 0) {
    $.ui.toast(t('stopFailed', { name: s.name, err: (r.stderr || r.stdout).trim() }))
    return
  }
  await writeSettings($, s.id, { stoppedPid: s.pid })
  $.ui.toast(`${t('stopped', { name: s.name, mem: fmtMem(s.mem) })} ${t(inApp(s) ? 'stoppedApp' : 'stoppedTerm')}`)
  await refresh($)
}

// Clicking a session goes straight into it: a session of the app opens by its app link (the
// same link the sidebar row has). One in a terminal has no page there: still running, it is
// in a window of its own that nothing here can bring forward, so a toast says so; stopped or
// dead, it is resumed in a new terminal window (the resume command is copied if that fails).
// Win32_Process.Create starts that window from the person's own environment, not this
// session's: a session of the app carries the app's variables (its host session id, its
// entrypoint), and a claude started with those would register as a child of this session.
const OPEN_TERMINAL = "exit (Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'cmd.exe /k claude --resume ' + $env:DCH_ID; CurrentDirectory = $env:DCH_CWD }).ReturnValue"
let selfId = ''
type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'
async function jump($: EngineInterface, s: Session, surface: Surface) {
  if (s.id === selfId) {
    $.ui.toast(t('jumpSelf'))
    return
  }
  if (inApp(s)) {
    const r = await $.process.run(['cmd.exe', '/d', '/c', 'start', '', `claude://claude.ai/epitaxy/${s.host}`])
    if (r.exitCode !== 0) $.ui.toast(t('jumpAppFail', { name: s.name }))
    return
  }
  if (s.alive) {
    $.ui.toast(t('jumpOtherWindow', { name: s.name, pid: s.pid }))
    return
  }
  // the id goes into a command line: only ever a session id
  const r = /^[0-9a-f-]{36}$/i.test(s.id)
    ? await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', OPEN_TERMINAL], { env: { DCH_ID: s.id, DCH_CWD: s.cwd } }).catch(() => ({ exitCode: 1 }))
    : { exitCode: 1 }
  if (r.exitCode === 0) {
    $.ui.toast(t('jumpReopened', { name: s.name }))
    return
  }
  await $.ui.copy({ text: `claude --resume ${s.id}`, surface })
  $.ui.toast(t('jumpCopied', { name: s.name }))
}

async function readLimits($: EngineInterface) {
  const { rateLimits } = await $.session.usage()
  await update($, limits, () => rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })))
}

async function poll($: EngineInterface) {
  await readLimits($)
  const isUp = (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
  if (isUp || (await $.clock.now()) - lastPoll > 60_000) await refresh($)
}

export const register: Register = (on, options) => {
  const num = (k: string, d: number) => (typeof options[k] === 'number' ? (options[k] as number) : d)
  cfg = {
    rotateK: num('rotateK', 250),
    warnK: num('warnK', 230),
    memWarnMb: num('memWarnMb', 1500),
    quietBusyMin: num('quietBusyMin', 15),
    protectHours: Math.max(1, num('cleanupProtectHours', 24)),
  }
  cleanupDays = Math.max(1, num('cleanupDays', 7))
  lang = langOf(options.language, systemLocale())

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'chihuy', description: t('cmdDescription') })
    await update($, days, d => d || cleanupDays)
    selfId = await $.session.id()
    terminal = (await $.env.get('CLAUDE_CODE_ENTRYPOINT').catch(() => undefined)) === 'cli'
    const home = (await $.env.get('USERPROFILE').catch(() => undefined)) ?? (await $.env.get('HOME').catch(() => undefined)) ?? ''
    dataDir = `${home.split(String.fromCharCode(92)).join('/')}/.claude/dai-chi-huy`
    await readLimits($)
    // every 10 s while the pane is drawn (as the terminal app refreshes), else once a minute for the band and status line
    $.clock.every(10_000, () => void poll($))
    void refresh($)
    void $.ui.open({ id: PANE, title: t('title') })
    return started
  })

  // The end of a main-thread turn: past its threshold the session rotates by itself; the turn
  // that wrote the handoff ends in /clear and the new chat starting on it. Timers carry the work
  // past this dispatch, which a queued prompt or a /clear has to wait for.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    const isAborted = e.isAborted
    if (phase.kind === 'writing') $.clock.after(300, () => void afterHandoff($, isAborted))
    else if (!isAborted) $.clock.after(300, () => void takeRequest($).then(took => (took ? undefined : checkRotate($))))
    return done
  })

  // A long turn grows past the threshold between its tool calls, where no turn ends: after a
  // main-thread tool's result the model reads a note asking it to stop safely and write the
  // handoff; that turn's end rotates as above.
  on('tool.call', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId || done.deny !== undefined || phase.kind !== 'idle') return done
    const note = await startRotate($, true)
    return note ? { ...done, context: [...(done.context ?? []), note] } : done
  })

  // The rule: no subagents or workflows, in any session; the main session does it all.
  on('tool.call', { tool: 'Agent' }, () => ({ deny: t('noAgents') })).catch(() => ({ deny: t('noAgents') }))
  on('tool.call', { tool: 'Workflow' }, () => ({ deny: t('noAgents') })).catch(() => ({ deny: t('noAgents') }))

  // A window moved a whole point: redraw the quota bars at once.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })))
    }
    return next(e)
  })

  // The band above the prompt: the 5-hour and weekly quota bars.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const lims = await read($, limits)
    const now = await $.clock.now()
    const { Box, Text, Button } = $.ui.resolve(e)
    const W = Math.max(8, Math.min(24, Math.floor((e.props.bodyColumns - 56) / 2)))
    const quotaRow = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
        {QUOTA.map(q => {
          const l = lims.find(v => v.kind === q.kind)
          if (!l) return <Text dimColor>{t(q.label)} {'·'.repeat(W)} {t('quotaWaiting')}</Text>
          const color = quotaColor(l.percentUsed)
          const left = leftOf(l, now)
          return (
            <Text>
              <Text bold>{t(q.label)}</Text> <Text color={color}>{bar(l.percentUsed / 100, W)}</Text> <Text color={color} bold>{l.percentUsed}%</Text>
              <Text dimColor>{left > 0 ? ` · ${t('quotaReset', { t: fmtAge(left) })}` : ''}</Text>
            </Text>
          )
        })}
      </Box>
    )
    return quotaRow
  })

  on('command.run', { command: 'chihuy' }, async $ => {
    await $.ui.open({ id: PANE, title: t('title') })
    void refresh($)
    return { text: t('cmdOpened') }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = Math.max(30, e.props.bodyColumns ?? 60)
    const tb = await read($, tab)
    const snap = await read($, snapshot)
    const msg = await read($, note)
    const now = await $.clock.now()

    const setTab = (v: Tab) => async () => {
      await update($, tab, () => v)
      await update($, confirm, () => false)
      if (v === 'clean' && !(await read($, scan))) await rescan($)
    }
    const alerts = snap?.alerts ?? []
    const nCrit = alerts.filter(a => a.sev === 0).length

    // ---- top bar: counts + 💽 free space of the drive holding .claude ----
    const live = snap?.sessions ?? []
    const count = (f: (s: Session) => boolean) => live.filter(f).length
    const top = (
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text color="success">● {t('nBusy', { n: count(s => s.alive && s.status === 'busy') })}</Text>
          <Text color="suggestion">● {t('nJob', { n: count(s => s.alive && s.status === 'shell') })}</Text>
          <Text color="warning">● {t('nWaiting', { n: count(s => s.alive && s.status === 'waiting') })}</Text>
          <Text color="inactive">○ {t('nIdle', { n: count(s => s.alive && s.status === 'idle') })}</Text>
          {count(s => s.status === 'stopped') > 0 && <Text color="inactive">⏻ {t('nStopped', { n: count(s => s.status === 'stopped') })}</Text>}
          {count(s => !s.alive && s.status !== 'stopped') > 0 && <Text color="error">✕ {t('nDead', { n: count(s => !s.alive && s.status !== 'stopped') })}</Text>}
          {snap?.disk && <Text dimColor>💽 {t('diskFree', { free: fmtMem(snap.disk.free), total: fmtMem(snap.disk.total) })}</Text>}
          <Text dimColor>{snap ? t('updatedAgo', { t: fmtAge(Math.round((now - snap.updated) / 1000)) }) : t('reading')}</Text>
        </Box>
        <Box flexDirection="row" columnGap={1} marginTop={1}>
          <Button key="tab-team" variant={tb === 'team' ? 'primary' : 'secondary'} onPress={setTab('team')}>{t('tabTeam')}</Button>
          <Button key="tab-alerts" variant={tb === 'alerts' ? 'primary' : 'secondary'} onPress={setTab('alerts')}>
            {`${t('tabAlerts')}${alerts.length ? ` (${alerts.length})` : ''}${nCrit ? ' ⚠' : ''}`}
          </Button>
          <Button key="tab-clean" variant={tb === 'clean' ? 'primary' : 'secondary'} onPress={setTab('clean')}>{t('tabClean')}</Button>
          <Button key="refresh" dimColor onPress={async () => { await refresh($); if (tb === 'clean') await rescan($) }}>{t('refresh')}</Button>
        </Box>
        {msg !== '' && <Text color="warning">{msg}</Text>}
      </Box>
    )

    // ---- 1. Đội hình ----
    if (tb === 'team') {
      const sel = await read($, open)
      const asking = await read($, stopAsk)
      const W = Math.max(8, Math.min(20, cols - 40))
      const gap = cfg.rotateK - Math.min(cfg.warnK, cfg.rotateK)
      return (
        <Box flexDirection="column">
          {top}
          {live.length === 0 && <Text dimColor>{snap ? t('noSessions') : t('readingSessions')}</Text>}
          {live.map(s => {
            const st = statusOf(s)
            const k = s.rotateK, rotate = k * 1000, warn = Math.max(0, k - gap) * 1000
            const ctxColor = s.ctx >= rotate ? 'error' : s.ctx >= warn ? 'warning' : 'success'
            const isOpen = sel === s.id
            const doing = s.running
              ? `${toolLabel(s.running.tool)} · ${s.running.text} (${fmtAge(Math.round((now - s.running.ts) / 1000))})`
              : ''
            return (
              <Box key={`s-${s.id}`} flexDirection="column" marginBottom={1}>
                <Box flexDirection="row" columnGap={1}>
                  <Button key={`row-${s.id}`} plain onPress={() => jump($, s, e.surface)}>
                    <Text color={st.color}>{st.icon} {st.label}</Text>{' '}
                    <Text bold>{clip(s.name, Math.max(12, cols - 36))}</Text>{' '}
                    <Text dimColor>{modelShort(s.model)}{s.life > 1 ? ` · ${t('life', { n: s.life })}` : ''}{s.id === selfId ? ` · ${t('thisSession')}` : ''}</Text>{s.modDead ? <Text color="error"> · {t('modDead')}</Text> : null}
                  </Button>
                  <Button key={`info-${s.id}`} plain dimColor onPress={() => update($, open, v => (v === s.id ? '' : s.id))}>{isOpen ? t('collapse') : t('details')}</Button>
                  {canStop(s) && <Button key={`stop-${s.id}`} plain dimColor onPress={() => update($, stopAsk, v => (v === s.id ? '' : s.id))}>{t('stop')}</Button>}
                </Box>
                {asking === s.id && canStop(s) && (
                  <Box flexDirection="row" columnGap={1} alignItems="center">
                    <Text color="warning">{t('stopAsk', { mem: fmtMem(s.mem) })} {t(inApp(s) ? 'stopAskApp' : 'stopAskTerm')}{s.jobs.length ? ` ${t('stopAskJobs', { n: s.jobs.length })}` : ''}</Text>
                    <Button key={`stop-yes-${s.id}`} variant="primary" onPress={() => stopSession($, s.id)}>{t('yesStop')}</Button>
                    <Button key={`stop-no-${s.id}`} onPress={() => update($, stopAsk, () => '')}>{t('cancel')}</Button>
                  </Box>
                )}
                <Text>
                  <Text color={ctxColor}>{bar(s.ctx / rotate, W)}</Text>{' '}
                  <Text dimColor>{fmtTokens(s.ctx)}/{fmtTokens(rotate)}{s.custom ? ` (${t('ownMark')})` : ''} · {t(s.auto ? 'autoOn' : 'autoOff')} · RAM {fmtMem(s.mem)}{s.jobs.length ? ` · ${t('nBgJobs', { n: s.jobs.length })}` : ''} · {t('active', { t: s.lastTs ? t('ago', { t: fmtAge(Math.round((now - s.lastTs) / 1000)) }) : '–' })}</Text>
                </Text>
                {doing !== '' && <Text color="success" wrap="truncate-end">▶ {doing}</Text>}
                {isOpen && (
                  <Box flexDirection="column" paddingLeft={2} marginTop={1}>
                    {s.lastPrompt !== '' && <Text><Text dimColor>{t('request')} </Text>{s.lastPrompt}</Text>}
                    {s.lastSay !== '' && <Text><Text dimColor>{t('report')} </Text>{clip(s.lastSay, 600)}</Text>}
                    {s.jobs.slice(0, 6).map(j => (
                      <Text dimColor>{t('jobLine', { name: j.name, pid: j.pid, mem: fmtMem(j.mem), t: fmtAge(j.runSecs) })}</Text>
                    ))}
                    <Text dimColor>{s.cwd} · pid {s.pid} · {s.entry} {s.version}</Text>
                    <Box flexDirection="row" columnGap={1} marginTop={1} alignItems="center">
                      <Text dimColor>{t('markLabel')}</Text>
                      {[...new Set([cfg.rotateK, ...THRESHOLD_CHOICES])].sort((a, b) => a - b).map(c => (
                        <Button key={`mk-${c}-${s.id}`} variant={c === k ? 'primary' : 'secondary'} onPress={() => setThreshold($, s.id, c)}>{`${c}k`}</Button>
                      ))}
                    </Box>
                    <Box flexDirection="row" columnGap={1} marginTop={1} alignItems="center">
                      <Text dimColor>{t('autoLabel')}</Text>
                      <Button key={`auto-on-${s.id}`} variant={s.auto ? 'primary' : 'secondary'} onPress={() => setAuto($, s.id, true)}>{t('on')}</Button>
                      <Button key={`auto-off-${s.id}`} variant={s.auto ? 'secondary' : 'primary'} onPress={() => setAuto($, s.id, false)}>{t('off')}</Button>
                    </Box>
                    {s.handoff !== '' && (
                      <Box flexDirection="row" columnGap={1} marginTop={1} alignItems="center">
                        <Text dimColor>{t('lastHandoff', { t: fmtAge(Math.round((now - s.rotatedAt) / 1000)) })}</Text>
                        <Button key={`handoff-${s.id}`} plain dimColor onPress={() => $.process.run(['cmd.exe', '/d', '/c', 'start', '', s.handoff.split('/').join(String.fromCharCode(92))]).then(() => undefined)}>{clip(s.handoff.split('/').slice(-2).join('/'), 60)}</Button>
                      </Box>
                    )}
                    <Box flexDirection="row" columnGap={1} marginTop={1}>
                      <Button key={`copy-${s.id}`} onPress={async () => {
                        await $.ui.copy({ text: `claude --resume ${s.id}`, surface: e.surface })
                        $.ui.toast(t('copiedResume'))
                      }}>{t('copyResume')}</Button>
                    </Box>
                  </Box>
                )}
              </Box>
            )
          })}
          {(snap?.rotations.length ?? 0) > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>{t('rotateLog')}</Text>
              {snap?.rotations.map(l => <Text dimColor wrap="truncate-end">{l}</Text>)}
            </Box>
          )}
        </Box>
      )
    }

    // ---- 5. Cảnh báo ----
    if (tb === 'alerts') {
      return (
        <Box flexDirection="column">
          {top}
          {alerts.length === 0 && <Text color="success">{t('noAlerts')}</Text>}
          {alerts.map((a: Alert, i: number) => (
            <Box key={`a-${i}`} flexDirection="column" marginBottom={1}>
              <Text>
                <Text color={SEV[a.sev].color} bold>{t(SEV[a.sev].label)}</Text>{'  '}
                <Text bold>{a.who}</Text>
              </Text>
              <Text>{a.text}</Text>
            </Box>
          ))}
          <Text dimColor>
            {t('thresholds', { rotate: cfg.rotateK, warn: Math.min(cfg.warnK, cfg.rotateK), mem: cfg.memWarnMb, quiet: cfg.quietBusyMin })}
          </Text>
        </Box>
      )
    }

    // ---- 6. 🧹 Dọn dẹp ----
    const sc = await read($, scan)
    const pick = new Set(await read($, picked))
    const N = (await read($, days)) || cleanupDays
    const order = await read($, sort)
    const isConfirm = await read($, confirm)
    const key = (c: Conv) => `${c.project}/${c.id}`
    const ageDays = (c: Conv) => (c.mtime ? Math.floor((now - c.mtime) / 86_400_000) : 0)
    const convs = [...(sc?.convs ?? [])].sort(
      order === 'old' ? (a, b) => a.mtime - b.mtime
        : order === 'project' ? (a, b) => a.project.localeCompare(b.project) || b.bytes - a.bytes
        : (a, b) => b.bytes - a.bytes,
    )
    const deletable = (c: Conv) => !c.live && !c.recent
    const older = convs.filter(c => deletable(c) && ageDays(c) >= N)
    const chosen = convs.filter(c => pick.has(key(c)) && deletable(c))
    const chosenBytes = chosen.reduce((n, c) => n + c.bytes, 0)
    const stepDays = (dir: number) => () => update($, days, d => {
      const i = DAY_STEPS.findIndex(x => x >= (d || cleanupDays))
      const j = Math.max(0, Math.min(DAY_STEPS.length - 1, (i < 0 ? DAY_STEPS.length - 1 : i) + dir))
      return DAY_STEPS[j]
    })
    const diskLine = sc?.disk ? `${bar(1 - sc.disk.free / sc.disk.total, 16)} ${t('diskFree', { free: fmtMem(sc.disk.free), total: fmtMem(sc.disk.total) })}` : ''
    const W = cols

    return (
      <Box flexDirection="column">
        {top}
        {!sc && <Text dimColor>{t('scanningShort')}</Text>}
        {sc && (
          <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginBottom={1}>
            <Text>{t('convs')} <Text bold>{sc.convs.length}</Text> · {t('total')} <Text bold>{fmtMem(sc.total)}</Text></Text>
            {diskLine !== '' && <Text dimColor>💽 {diskLine}</Text>}
            <Text>{t('olderThan', { n: N })} <Text bold>{older.length}</Text> · {fmtMem(older.reduce((n, c) => n + c.bytes, 0))}</Text>
            <Text>{t('picked')} <Text bold color={chosen.length ? 'warning' : undefined}>{chosen.length}</Text> · {fmtMem(chosenBytes)}</Text>
            <Text dimColor>
              {t('autoDelete', { d: sc.periodDays ?? 30, def: sc.periodDays == null ? t('isDefault') : '', h: sc.protectHours })}
            </Text>
          </Box>
        )}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} marginBottom={1}>
          <Button key="pick-old" onPress={() => update($, picked, list => [...new Set([...list, ...older.map(key)])])}>{t('pickOlder', { n: N })}</Button>
          <Button key="days-minus" onPress={stepDays(-1)}>N −</Button>
          <Button key="days-plus" onPress={stepDays(1)}>N +</Button>
          <Button key="pick-none" onPress={() => update($, picked, () => [])}>{t('pickNone')}</Button>
          <Button key="sort" onPress={() => update($, sort, s => (s === 'size' ? 'old' : s === 'old' ? 'project' : 'size'))}>
            {t('sortBy', { by: t(order === 'size' ? 'sortSize' : order === 'old' ? 'sortOld' : 'sortProject') })}
          </Button>
          <Button key="delete" variant="primary" onPress={() => update($, confirm, () => chosen.length > 0)}>{t('deleteN', { n: chosen.length })}</Button>
        </Box>
        {isConfirm && (
          <Box flexDirection="column" borderStyle="round" borderColor="error" paddingX={1} marginBottom={1}>
            <Text color="error" bold>{t('confirmDelete', { n: chosen.length, size: fmtMem(chosenBytes) })}</Text>
            <Text>{t('confirmNote', { h: cfg.protectHours })}</Text>
            <Box flexDirection="row" columnGap={1} marginTop={1}>
              <Button key="confirm-yes" variant="primary" onPress={() => deletePicked($)}>{t('yesDelete')}</Button>
              <Button key="confirm-no" onPress={() => update($, confirm, () => false)}>{t('cancel')}</Button>
            </Box>
          </Box>
        )}
        {convs.slice(0, 300).map(c => {
          const k = key(c)
          const can = deletable(c)
          const mark = c.live ? '🟢' : c.recent ? '🛡' : pick.has(k) ? '☑' : '☐'
          const label = c.name || c.title || t('empty')
          return (
            <Box key={`c-${k}`} flexDirection="row" columnGap={1}>
              <Button key={`pick-${k}`} plain dimColor={!can} onPress={() => can ? update($, picked, list => (list.includes(k) ? list.filter(x => x !== k) : [...list, k])) : undefined}>
                {mark} <Text tabular>{String(ageDays(c)).padStart(3)}d {fmtMem(c.bytes).padStart(8)}</Text>{' '}
                <Text dimColor>{clip(c.project.replace(/^C--/, ''), 14)}</Text>{' '}
                {clip(label, Math.max(16, W - 40))}
              </Button>
              <Button key={`dir-${k}`} plain dimColor onPress={() => $.process.run(['explorer.exe', c.dir]).then(() => undefined)}>📂</Button>
            </Box>
          )
        })}
        {convs.length > 300 && <Text dimColor>{t('more', { n: convs.length - 300 })}</Text>}
      </Box>
    )
  })

}
