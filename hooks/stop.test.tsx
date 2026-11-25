import { expect, test } from 'claude-code/testing'

const base = {
  host: 'local_00000000-0000-0000-0000-000000000000', alive: true, statusSince: 0, cwd: 'C:\\Game', entry: 'claude-desktop', version: '2',
  model: 'claude-opus-5-5', ctx: 100_000, lastTs: 0, running: null, mem: 336 * 1024 ** 2, jobs: [], errors30: 0, lastPrompt: '', lastSay: '',
  rotateK: 250, custom: false, auto: true, life: 1, handoff: '', rotatedAt: 0,
}
const IDLE = { ...base, id: 'idle-1', name: 'Sửa lỗi đăng nhập', pid: 4242, status: 'idle' }
const BUSY = { ...base, id: 'busy-1', name: 'Trang chủ mới', pid: 5151, status: 'busy' }
const SELF = { ...base, id: 'self-session', name: 'Phiên này', pid: 6262, status: 'idle' }

const PANE = {
  plugin: 'dai-chi-huy',
  component: 'Pane',
  requestId: 'dai-chi-huy',
  surface: 'desktop',
  props: { title: 'Đài Chỉ Huy', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('⏻ tắt ends only an idle session other than this one, after a confirm', async ($, on) => {
  on('command.register', () => ({ value: { command: 'chihuy' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 60_000 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'self-session' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => { toasts.push(e.text); return { value: undefined } })
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/u' : undefined }))
  const files: Record<string, string> = {}
  on('fs.read', (_, e) => (files[e.path] !== undefined ? { value: files[e.path] } : Promise.reject(new Error('ENOENT'))))
  on('fs.write', (_, e) => { files[e.path] = e.text; return { value: undefined } })
  let idle = IDLE
  const killed: string[][] = []
  const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', (_, e) => {
    // the collector reports a pid ⏻ tắt recorded as 'stopped'
    if (e.argv[0] === 'taskkill.exe') { killed.push(e.argv); idle = { ...idle, alive: false, status: 'stopped' }; return ok('') }
    return ok(JSON.stringify({ updated: 0, disk: { free: 1, total: 2 }, sessions: [idle, BUSY, SELF], alerts: [], rotations: [] }))
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'chihuy', args: '' })
  const ui = await $.ui.mount(PANE)

  // the button shows on the idle session only: not on a busy one, not on this session
  expect(await ui.find({ type: 'Button', key: 'stop-idle-1' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'stop-busy-1' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'stop-self-session' })).toBeUndefined()

  // first press asks; Huỷ kills nothing
  await ui.press({ key: 'stop-idle-1' })
  expect((await ui.find({ type: 'Text', text: /Tắt phiên này/ }))?.text).toContain('336 MB')
  await ui.press({ key: 'stop-no-idle-1' })
  expect(await ui.find({ type: 'Text', text: /Tắt phiên này/ })).toBeUndefined()
  expect(killed).toEqual([])

  // Có, tắt: taskkill on that pid alone (no /T: its background jobs keep running)
  await ui.press({ key: 'stop-idle-1' })
  await ui.press({ key: 'stop-yes-idle-1' })
  expect(killed).toEqual([['taskkill.exe', '/PID', '4242', '/F']])
  expect(toasts.at(-1)).toMatch(/Đã tắt Sửa lỗi đăng nhập, lấy lại ~336 MB/)
  expect(await ui.find({ type: 'Button', key: 'stop-idle-1' })).toBeUndefined()
  expect(Object.entries(files).map(([k, v]) => [k.split(String.fromCharCode(92)).join('/'), JSON.parse(v)])).toEqual([['C:/Users/u/.claude/dai-chi-huy/session/idle-1.json', { stoppedPid: 4242 }]])
  expect((await ui.find({ type: 'Text', text: /ĐÃ TẮT/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /1 đã tắt/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /chết/ }))).toBeUndefined()
  await ui.unmount()
})

test('⏻ tắt does nothing when the session got busy before the confirm', async ($, on) => {
  on('command.register', () => ({ value: { command: 'chihuy' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 60_000 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'self-session' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => { toasts.push(e.text); return { value: undefined } })
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/u' : undefined }))
  on('fs.read', () => Promise.reject(new Error('ENOENT')))
  let idle = IDLE
  const killed: string[][] = []
  on('process.run', (_, e) => {
    if (e.argv[0] === 'taskkill.exe') killed.push(e.argv)
    return { value: { exitCode: 0, stdout: JSON.stringify({ updated: 0, disk: { free: 1, total: 2 }, sessions: [idle], alerts: [], rotations: [] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'chihuy', args: '' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'stop-idle-1' })
  idle = { ...IDLE, status: 'busy' }
  await ui.press({ key: 'stop-yes-idle-1' })
  expect(killed).toEqual([])
  expect(toasts.at(-1)).toMatch(/Không tắt/)
  await ui.unmount()
})

// a session in a terminal: no page in the desktop app (no host id), entrypoint cli
const CLI = { ...base, host: '', entry: 'cli', id: 'c0ffee00-1111-2222-3333-444444444444', name: 'game-b7', pid: 7373, status: 'idle' }

test('a terminal session: ⏻ tắt says how to open it again, its name resumes it in a new terminal window', async ($, on) => {
  on('command.register', () => ({ value: { command: 'chihuy' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 60_000 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'self-session' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => { toasts.push(e.text); return { value: undefined } })
  const copies: string[] = []
  on('ui.copy', (_, e) => { copies.push(e.text); return { value: { isCopied: true } } })
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/u' : undefined }))
  const files: Record<string, string> = {}
  on('fs.read', (_, e) => (files[e.path] !== undefined ? { value: files[e.path] } : Promise.reject(new Error('ENOENT'))))
  on('fs.write', (_, e) => { files[e.path] = e.text; return { value: undefined } })
  let cli = CLI
  const opened: { argv: readonly string[]; env?: Record<string, string> }[] = []
  const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'taskkill.exe') { cli = { ...cli, alive: false, status: 'stopped' }; return ok('') }
    if (e.argv[0] === 'powershell.exe') { opened.push({ argv: e.argv.slice(0, 4), env: e.init?.env }); return ok('') }
    return ok(JSON.stringify({ updated: 0, disk: { free: 1, total: 2 }, sessions: [cli, SELF], alerts: [], rotations: [] }))
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'chihuy', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // still running: it is in a terminal window of its own, so nothing is run or copied
  await ui.press({ key: `row-${CLI.id}` })
  expect(opened).toEqual([])
  expect(copies).toEqual([])
  expect(toasts.at(-1)).toMatch(/game-b7 đang mở ở một cửa sổ terminal khác \(pid 7373\)/)

  // the confirm does not promise that the app opens it again
  await ui.press({ key: `stop-${CLI.id}` })
  const ask = (await ui.find({ type: 'Text', text: /Tắt phiên này/ }))?.text
  expect(ask).toContain('bấm tên phiên để mở lại trong cửa sổ terminal mới')
  expect(ask).not.toContain('app mở lại')
  await ui.press({ key: `stop-yes-${CLI.id}` })
  expect(toasts.at(-1)).toMatch(/Đã tắt game-b7.*Bấm tên phiên để mở lại trong cửa sổ terminal mới/)

  // stopped: its name resumes it in a new terminal window, in its own folder; the id and the
  // folder reach PowerShell as variables, never as text of the command
  await ui.press({ key: `row-${CLI.id}` })
  expect(opened).toEqual([{ argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command'], env: { DCH_ID: CLI.id, DCH_CWD: base.cwd } }])
  expect(copies).toEqual([])
  expect(toasts.at(-1)).toMatch(/Đã mở lại game-b7 trong một cửa sổ terminal mới/)
  await ui.unmount()
})

test('a stopped terminal session whose window cannot be opened gets its resume command copied', async ($, on) => {
  on('command.register', () => ({ value: { command: 'chihuy' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 60_000 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'self-session' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => { toasts.push(e.text); return { value: undefined } })
  const copies: string[] = []
  on('ui.copy', (_, e) => { copies.push(e.text); return { value: { isCopied: true } } })
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/u' : undefined }))
  on('fs.read', () => Promise.reject(new Error('ENOENT')))
  const stopped = { ...CLI, alive: false, status: 'stopped' }
  on('process.run', (_, e) => ({
    value: e.argv[0] === 'powershell.exe'
      ? { exitCode: 1, stdout: '', stderr: 'no', isStdoutTruncated: false, isStderrTruncated: false }
      : { exitCode: 0, stdout: JSON.stringify({ updated: 0, disk: { free: 1, total: 2 }, sessions: [stopped, SELF], alerts: [], rotations: [] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'chihuy', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: `row-${CLI.id}` })
  expect(copies).toEqual([`claude --resume ${CLI.id}`])
  expect(toasts.at(-1)).toMatch(/đã copy lệnh claude --resume/)
  await ui.unmount()
})
