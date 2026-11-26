// Đài Chỉ Huy collector (sessions, alerts, cleanup).
// The mod runs it with `node collect.mjs <snapshot|scan|delete>` and the config as JSON on stdin;
// it prints one JSON object. Only `delete` writes anything, and it re-checks every safety rule first;
// `snapshot` also touches beat/<pid of the session that ran it>, the sign that its mod is alive.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { LOCALES, fill } from '../locales/index.mjs'

const mode = process.argv[2] ?? 'snapshot'
const raw = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
const L = LOCALES[raw.lang] ?? LOCALES.en
const t = (k, v) => fill(L[k], v)
const home = process.env.USERPROFILE || os.homedir()
const cfg = {
  claudeDir: raw.claudeDir || path.join(home, '.claude'),
  rotate: (raw.rotateK ?? 250) * 1000,
  warn: Math.min(raw.warnK ?? 230, raw.rotateK ?? 250) * 1000,
  memWarn: (raw.memWarnMb ?? 1500) * 1024 * 1024,
  quietBusyMin: raw.quietBusyMin ?? 15,
  protectHours: Math.max(1, raw.protectHours ?? 24),
  dataDir: raw.dataDir || path.join(home, '.claude', 'dai-chi-huy'),
  logFile: raw.logFile || path.join(raw.dataDir || path.join(home, '.claude', 'dai-chi-huy'), 'cleanup.log'),
  ids: raw.ids ?? [],
}
const TAIL = 4 * 1024 * 1024
const now = Date.now()

// ---------- helpers (util.rs) ----------
const one = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const cap = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s)
const fmtTokens = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.floor(n / 1000)}k` : String(n))
const fmtMem = b => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`)
const fmtAge = s => s < 0 ? '–' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m`
  : s < 86400 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
  : `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`
const shortPath = (p, n) => p.replace(/\\/g, '/').split('/').filter(Boolean).slice(-n).join('/')
const toolLabel = t => t.startsWith('mcp__') ? t.slice(5).replace(/^claude-in-/, '').replace('__', '·') : t
const isUuid = s => /^[0-9a-f-]{36}$/i.test(s) && s.split('-').length === 5
const sanitizeCwd = cwd => cwd.replace(/[^A-Za-z0-9]/g, '-')

function readTail(p, max) {
  const fd = fs.openSync(p, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - max)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    let text = buf.toString('utf8')
    if (start > 0) text = text.slice(text.indexOf('\n') + 1)
    return text
  } finally { fs.closeSync(fd) }
}
function readHead(p, max) {
  const fd = fs.openSync(p, 'r')
  try {
    const buf = Buffer.alloc(Math.min(max, fs.fstatSync(fd).size))
    fs.readSync(fd, buf, 0, buf.length, 0)
    return buf.toString('utf8')
  } finally { fs.closeSync(fd) }
}
const parse = l => { try { return JSON.parse(l) } catch { return null } }

// what a tool call is doing, one line (model.rs summarize)
function summarize(name, input = {}) {
  const s = k => (typeof input[k] === 'string' ? input[k] : '')
  switch (name) {
    case 'Bash': case 'PowerShell': return (s('description') || one(s('command'))) + (input.run_in_background ? ' ' + t('bg') : '')
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return shortPath(s('file_path') || s('notebook_path'), 3)
    case 'Grep': return `“${cap(s('pattern'), 120)}”${s('path') ? ' in ' + shortPath(s('path'), 2) : ''}`
    case 'Glob': return s('pattern')
    case 'SendMessage': return `→ ${s('to')}: ${(s('message').split('\n')[0])}`
    case 'Agent': case 'Task': return s('description')
    case 'Skill': return `${s('skill')} ${s('args')}`
    case 'WebSearch': case 'ToolSearch': return s('query')
    case 'WebFetch': return s('url')
    default: { const f = Object.values(input).find(v => typeof v === 'string'); return one(f ?? '') }
  }
}

// a typed prompt, not meta / tool results / reminders (cleanup.rs prompt_of + model.rs user_text)
function promptOf(v, withCommands = false) {
  if (v?.type !== 'user' || v.isMeta) return null
  const c = v.message?.content
  const text = typeof c === 'string' ? c : Array.isArray(c) ? (c.find(x => x.type === 'text')?.text ?? '') : ''
  const t = text.trim()
  if (!t) return null
  const cmd = withCommands && t.match(/^<command-name>([^<]*)<\/command-name>/)
  if (cmd) return one(`${cmd[1]} ${t.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? ''}`)
  if (t.startsWith('<') || t.startsWith('[Request interrupted') || t.startsWith('Caveat:')) return null
  return cap(one(t), 240)
}

// ---------- one transcript's tail (model.rs ingest_*) ----------
function readTranscript(p) {
  const st = { model: '', ctx: 0, pending: [], lastTs: 0, errors: [], files: {}, tname: '', lastPrompt: '', lastSay: '' }
  let text
  try { text = readTail(p, TAIL) } catch { return st }
  for (const line of text.split('\n')) {
    if (line.length > 2_000_000 || !line.includes('"type"')) continue
    const v = parse(line)
    if (!v) continue
    const side = v.isSidechain === true
    const ts = v.timestamp ? Date.parse(v.timestamp) : 0
    if (v.type === 'agent-name' && v.agentName) st.tname = v.agentName
    else if (v.type === 'custom-title' && !st.tname) st.tname = v.customTitle || v.title || ''
    else if (v.type === 'system' && v.subtype === 'compact_boundary' && !side) st.ctx = v.compactMetadata?.postTokens ?? 0
    else if (v.type === 'assistant') {
      const msg = v.message ?? {}
      if (typeof msg.model === 'string' && msg.model.startsWith('<')) continue
      if (!side) {
        if (msg.model) st.model = msg.model
        const u = msg.usage
        if (u) {
          const c = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
          if (c > 0) st.ctx = c
        }
        if (ts > st.lastTs) st.lastTs = ts
      }
      for (const c of msg.content ?? []) {
        if (c.type === 'text' && c.text?.trim() && !side) st.lastSay = cap(one(c.text), 600)
        if (c.type !== 'tool_use') continue
        if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(c.name)) {
          const fp = (c.input?.file_path ?? c.input?.notebook_path ?? '').replace(/\\/g, '/')
          if (fp) st.files[fp] = Math.max(st.files[fp] ?? 0, ts)
        }
        if (!side) {
          st.pending.push({ id: c.id, ts, tool: c.name, text: cap(summarize(c.name, c.input), 300) })
          if (st.pending.length > 40) st.pending.shift()
        }
      }
    } else if (v.type === 'user' && !v.isMeta) {
      if (!side && ts > st.lastTs) st.lastTs = ts
      const content = v.message?.content
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c.type !== 'tool_result') continue
          const i = st.pending.findIndex(x => x.id === c.tool_use_id)
          const pend = i >= 0 ? st.pending.splice(i, 1)[0] : null
          if (c.is_error === true) st.errors.push({ ts, tool: pend?.tool ?? 'tool' })
        }
      }
      const pr = promptOf(v, true)
      if (pr && !side) { st.lastPrompt = pr; st.lastSay = '' }
    }
  }
  return st
}

function findTranscript(id, cwd) {
  const proj = path.join(cfg.claudeDir, 'projects')
  const direct = path.join(proj, sanitizeCwd(cwd), `${id}.jsonl`)
  if (fs.existsSync(direct)) return direct
  for (const d of safeList(proj)) {
    const p = path.join(proj, d, `${id}.jsonl`)
    if (fs.existsSync(p)) return p
  }
  return null
}
function safeList(dir) { try { return fs.readdirSync(dir) } catch { return [] } }

// ---------- processes: RAM + background jobs (one CIM query) ----------
function processes() {
  const ps = "Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}|{2}|{3}|{4}' -f $_.ProcessId,$_.ParentProcessId,$_.WorkingSetSize,([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(),$_.Name }"
  const map = new Map()
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 16 * 1024 * 1024 })
    for (const l of out.split(/\r?\n/)) {
      const [pid, ppid, mem, start, ...name] = l.split('|')
      if (!pid) continue
      map.set(+pid, { pid: +pid, ppid: +ppid, mem: +mem || 0, start: +start || 0, name: name.join('|') })
    }
  } catch { /* no process info: everything still works but RAM/jobs/alive */ }
  return map
}
function jobsOf(pid, born, procs) {
  const kids = new Map()
  for (const p of procs.values()) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, [])
    kids.get(p.ppid).push(p.pid)
  }
  const out = [], seen = new Set()
  const stack = (kids.get(pid) ?? []).map(c => [c, 1])
  while (stack.length) {
    const [c, depth] = stack.pop()
    if (seen.has(c) || depth > 6) continue
    seen.add(c)
    const p = procs.get(c)
    if (!p) continue
    // MCP servers / plugins start with the session: they are services, not jobs
    if (depth === 1 && born > 0 && p.start - born < 120_000) continue
    const n = p.name.toLowerCase()
    if (n !== 'conhost.exe' && n !== 'openconsole.exe') out.push({ pid: c, name: p.name, mem: p.mem, runSecs: Math.max(0, Math.round((now - p.start) / 1000)) })
    for (const g of kids.get(c) ?? []) stack.push([g, depth + 1])
  }
  return out.sort((a, b) => b.mem - a.mem)
}

function disk() {
  try {
    const s = fs.statfsSync(cfg.claudeDir)
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }
  } catch { return null }
}

// ---------- snapshot: Đội hình + Cảnh báo ----------
// A mod can stop inside one session's process (seen once: no rotation from 250k to 577k) and nothing
// in that process says so. Every live mod runs this snapshot at least once a minute, so its parent
// (the session's claude process) leaves a fresh beat; a session process with none is told apart.
const BEAT_STALE = 5 * 60_000
function beat(procs) {
  const dir = path.join(cfg.dataDir, 'beat')
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, String(process.ppid)), String(now))
    // beats of processes gone
    if (procs.size) for (const f of safeList(dir)) if (!procs.has(+f)) fs.rmSync(path.join(dir, f), { force: true })
  } catch { /* no beat: this snapshot still works */ }
}
function modDeadOf(pid, procs) {
  const p = procs.get(pid)
  // unknown without process info, and a process that just started has not polled yet
  if (!p || !p.start || now - p.start < BEAT_STALE) return false
  try { return now - fs.statSync(path.join(cfg.dataDir, 'beat', String(pid))).mtimeMs > BEAT_STALE } catch { return true }
}

function snapshot() {
  const procs = processes()
  beat(procs)
  const sessions = []
  const dir = path.join(cfg.claudeDir, 'sessions')
  for (const f of safeList(dir)) {
    if (!f.endsWith('.json')) continue
    const v = parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    if (!v?.sessionId) continue
    const alive = procs.size === 0 ? true : procs.has(v.pid)
    const tr = findTranscript(v.sessionId, v.cwd ?? '')
    const t = tr ? readTranscript(tr) : readTranscript('')
    const p = procs.get(v.pid)
    // a session ended with ⏻ tắt keeps its registration file until the app starts it again: 'stopped', not 'dead'
    const status = alive ? (v.status ?? '?') : settingsOf(v.sessionId).stoppedPid === v.pid ? 'stopped' : 'dead'
    const running = status !== 'idle' && alive ? t.pending.at(-1) ?? null : null
    sessions.push({
      id: v.sessionId,
      name: v.name || t.tname || `#${v.sessionId.slice(0, 8)}`,
      pid: v.pid, alive, status,
      statusSince: v.statusUpdatedAt ?? 0,
      host: v.hostSessionId ?? '', cwd: v.cwd ?? '', entry: v.entrypoint ?? '', version: v.version ?? '',
      model: t.model, ctx: t.ctx, lastTs: t.lastTs,
      running, mem: p?.mem ?? 0,
      jobs: alive && p ? jobsOf(v.pid, v.startedAt ?? 0, procs) : [],
      modDead: alive && modDeadOf(v.pid, procs),
      errors30: t.errors.filter(e => now - e.ts < 30 * 60_000).length,
      ...rotateInfo(v.sessionId),
      files: t.files, lastPrompt: t.lastPrompt, lastSay: t.lastSay,
    })
  }
  const d = disk()
  let rotations = []
  try { rotations = fs.readFileSync(path.join(cfg.dataDir, 'rotate.log'), 'utf8').trim().split(/\r?\n/).filter(Boolean).slice(-8).reverse() } catch { /* none yet */ }
  return { updated: now, sessions: sessions.map(({ files, ...s }) => s), disk: d, alerts: alerts(sessions, d), rotations }
}

function rotateInfo(id) {
  const st = settingsOf(id)
  return {
    rotateK: st.rotateK || cfg.rotate / 1000, custom: !!st.rotateK, auto: st.auto !== false,
    life: st.life || 1, handoff: st.handoff || '', rotatedAt: st.rotatedAt || 0,
  }
}

// per-session settings the mod writes (its own rotate threshold, tự rotate on/off, life, handoff)
function settingsOf(id) {
  try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'session', `${id}.json`), 'utf8')) || {} } catch { return {} }
}
// a session's own threshold, else the plugin's; warn keeps the plugin's gap
function limitsOf(id) {
  const k = settingsOf(id).rotateK
  if (!k) return { rotate: cfg.rotate, warn: cfg.warn }
  return { rotate: k * 1000, warn: Math.max(0, k * 1000 - (cfg.rotate - cfg.warn)) }
}

// model.rs compute_alerts, same rules and words
function alerts(sessions, d) {
  const a = []
  if (d && d.total > 0) {
    const gb = d.free / 1024 ** 3
    if (d.free * 20 < d.total || gb < 10) a.push({ sev: 0, who: t('disk'), text: t('diskCrit', { free: fmtMem(d.free) }) })
    else if (d.free * 10 < d.total || gb < 30) a.push({ sev: 1, who: t('disk'), text: t('diskLow', { free: fmtMem(d.free) }) })
  }
  for (const s of sessions) {
    const who = s.name, sid = s.id
    if (s.status === 'stopped') continue
    if (!s.alive) { a.push({ sev: 1, sid, who, text: t('aDead', { pid: s.pid ?? 0 }) }); continue }
    if (s.modDead) a.push({ sev: 0, sid, who, text: t('aModDead') })
    const { rotate, warn } = limitsOf(s.id)
    if (s.ctx >= rotate) a.push({ sev: 0, sid, who, text: t('aCtxOver', { ctx: fmtTokens(s.ctx), rotate: fmtTokens(rotate) }) })
    else if (s.ctx >= warn) a.push({ sev: 1, sid, who, text: t('aCtxNear', { ctx: fmtTokens(s.ctx), warn: fmtTokens(warn) }) })
    if (s.mem >= cfg.memWarn) a.push({ sev: 1, sid, who, text: t('aRam', { mem: fmtMem(s.mem) }) })
    if (s.running) {
      const mins = Math.floor((now - s.running.ts) / 60_000)
      if (mins >= 20) a.push({ sev: 2, sid, who, text: t('aLongTool', { mins, tool: toolLabel(s.running.tool), text: cap(s.running.text, 80) }) })
    } else if (s.status === 'busy' && s.lastTs) {
      const mins = Math.floor((now - s.lastTs) / 60_000)
      if (mins >= cfg.quietBusyMin) a.push({ sev: 1, sid, who, text: t('aQuiet', { mins }) })
    }
    if (s.errors30 >= 3) a.push({ sev: 1, sid, who, text: t('aErrors', { n: s.errors30 }) })
    if (s.status === 'idle' && s.statusSince) {
      const mins = Math.floor((now - s.statusSince) / 60_000)
      if (mins >= 60) a.push({ sev: 2, sid, who, text: t('aIdle', { t: fmtAge(mins * 60) }) })
    }
  }
  // files edited by two or more live sessions in the last hour
  const byFile = {}
  for (const s of sessions) for (const [f, t] of Object.entries(s.files)) if (now - t < 3600_000) (byFile[f] ??= new Set()).add(s.name)
  for (const [f, who] of Object.entries(byFile).sort()) if (who.size > 1) a.push({ sev: 1, who: [...who].sort().join(' + '), text: t('aSameFile', { path: shortPath(f, 3) }) })
  return a.sort((x, y) => x.sev - y.sev || x.who.localeCompare(y.who))
}

// ---------- Dọn dẹp (cleanup.rs) ----------
function sizeOf(p) {
  let st
  try { st = fs.lstatSync(p) } catch { return 0 }
  if (!st.isDirectory()) return st.size
  let total = 0
  for (const e of safeList(p)) total += sizeOf(path.join(p, e))
  return total
}
const mtimeOf = p => { try { return fs.statSync(p).mtimeMs } catch { return 0 } }
function liveIds() {
  const procs = processes()
  const ids = new Set(), names = {}
  const dir = path.join(cfg.claudeDir, 'sessions')
  for (const f of safeList(dir)) {
    if (!f.endsWith('.json')) continue
    const v = parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    if (!v?.sessionId) continue
    if (v.name) names[v.sessionId] = v.name
    if (procs.size === 0 || procs.has(v.pid)) ids.add(v.sessionId)
  }
  return { ids, names }
}
function titleOf(p) {
  let summary = '', name = ''
  try {
    for (const l of readHead(p, 256 * 1024).split('\n')) {
      const v = parse(l)
      if (!v) continue
      if (v.type === 'summary' && !summary) summary = v.summary ?? ''
      else if (v.type === 'custom-title' && !name) name = v.customTitle ?? ''
      else if (v.type === 'user') { const t = promptOf(v); if (t) return { title: t, name } }
    }
    if (summary) return { title: cap(one(summary), 240), name }
    const lines = readTail(p, 512 * 1024).split('\n').reverse()
    for (const l of lines) { const t = promptOf(parse(l)); if (t) return { title: `… ${t}`, name } }
  } catch { /* unreadable: no title */ }
  return { title: '', name }
}
function convs() {
  const proj = path.join(cfg.claudeDir, 'projects'), fh = path.join(cfg.claudeDir, 'file-history')
  const horizon = now - cfg.protectHours * 3600_000
  const { ids: live, names } = liveIds()
  const out = [], fhUsed = new Set()
  for (const project of safeList(proj)) {
    const pdir = path.join(proj, project)
    try { if (!fs.statSync(pdir).isDirectory()) continue } catch { continue }
    const ids = {}
    for (const e of safeList(pdir)) {
      const p = path.join(pdir, e)
      let isDir = false
      try { isDir = fs.statSync(p).isDirectory() } catch { continue }
      if (isDir && isUuid(e)) (ids[e] ??= {}).side = p
      else if (!isDir && e.endsWith('.jsonl')) (ids[e.slice(0, -6)] ??= {}).tr = p
    }
    for (const [id, { tr, side }] of Object.entries(ids)) {
      const files = [tr, side].filter(Boolean)
      const fhd = path.join(fh, id)
      if (!fhUsed.has(id) && fs.existsSync(fhd)) { fhUsed.add(id); files.push(fhd) }
      const mt = (tr && mtimeOf(tr)) || (side && mtimeOf(side)) || 0
      out.push({ id, project, files, mtime: mt, live: live.has(id), recent: mt > horizon, tr })
    }
  }
  return { list: out, live, names }
}
function scan() {
  const { list, names } = convs()
  const proj = path.join(cfg.claudeDir, 'projects')
  const rows = list.map(c => {
    const { title, name } = c.tr ? titleOf(c.tr) : { title: t('subOnly'), name: '' }
    return { id: c.id, project: c.project, dir: path.join(proj, c.project), bytes: c.files.reduce((n, p) => n + sizeOf(p), 0), mtime: c.mtime, live: c.live, recent: c.recent, title, name: names[c.id] || name }
  }).sort((a, b) => b.bytes - a.bytes)
  let period = null
  try { period = JSON.parse(fs.readFileSync(path.join(cfg.claudeDir, 'settings.json'), 'utf8')).cleanupPeriodDays ?? null } catch { /* none */ }
  return { when: now, convs: rows, total: rows.reduce((n, c) => n + c.bytes, 0), periodDays: period, protectHours: cfg.protectHours, disk: disk() }
}

// Delete: re-checks live + recent on disk right before deleting, logs every deletion.
function del() {
  const want = new Set(cfg.ids)
  const { list, live } = convs()
  const horizon = now - cfg.protectHours * 3600_000
  let n = 0, freed = 0
  const errs = []
  fs.mkdirSync(path.dirname(cfg.logFile), { recursive: true })
  const titles = {}
  for (const c of list) if (want.has(`${c.project}/${c.id}`) && c.tr) titles[c.id] = titleOf(c.tr).title
  for (const c of list) {
    if (!want.has(`${c.project}/${c.id}`)) continue
    if (live.has(c.id)) { errs.push(t('delRunning', { id: c.id })); continue }
    if (mtimeOf(c.files[0]) > horizon) { errs.push(t('delRecent', { id: c.id })); continue }
    const bytes = c.files.reduce((s, p) => s + sizeOf(p), 0)
    let ok = true
    for (const p of c.files) {
      try { fs.rmSync(p, { recursive: true, force: true }) } catch (e) { if (fs.existsSync(p)) { ok = false; errs.push(`${p}: ${e.message}`) } }
    }
    if (ok) { n += 1; freed += bytes }
    const stamp = new Date().toLocaleString('sv-SE').slice(0, 19)
    const mt = c.mtime ? new Date(c.mtime).toLocaleString('sv-SE').slice(0, 16) : ''
    fs.appendFileSync(cfg.logFile, `${stamp} | ${ok ? 'deleted' : 'partial'} | ${c.project} | ${c.id} | ${fmtMem(bytes)} | ${mt} | ${cap(titles[c.id] ?? '', 160)}\n`)
  }
  return { deleted: n, freed, errors: errs, log: cfg.logFile }
}

const result = mode === 'scan' ? scan() : mode === 'delete' ? del() : snapshot()
process.stdout.write(JSON.stringify(result))
