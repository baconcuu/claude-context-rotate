import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// macOS and Linux: the same buttons, each with the system's own command to stop, open and resume.
const base = {
  alive: true, statusSince: 0, cwd: '/Users/u/game b7', version: '2',
  model: 'claude-opus-5-5', ctx: 100_000, lastTs: 0, running: null, mem: 336 * 1024 ** 2, jobs: [], errors30: 0, lastPrompt: '', lastSay: '',
  rotateK: 250, custom: false, auto: true, life: 1, handoff: '', rotatedAt: 0,
}
const CLI = { ...base, host: '', entry: 'cli', id: 'c0ffee00-1111-2222-3333-444444444444', name: 'game-b7', pid: 7373, status: 'idle' }
const APP = { ...base, host: 'local_00000000-0000-0000-0000-000000000000', entry: 'claude-desktop', id: 'app-1', name: 'app-a', pid: 8484, status: 'busy' }
const SELF = { ...base, host: '', entry: 'cli', id: 'self-session', name: 'self', pid: 6262, status: 'idle' }
const LINK = `claude://claude.ai/epitaxy/${APP.host}`

const PANE = {
  plugin: 'dai-chi-huy',
  component: 'Pane',
  requestId: 'dai-chi-huy',
  surface: 'terminal',
  props: { title: 'Đài Chỉ Huy', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

// ran: every command but the collector's
function world(on: Parameters<TestBody>[1], platform: string) {
  on('command.register', () => ({ value: { command: 'chihuy' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 60_000 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'self-session' }))
  on('session.info', () => ({ value: { platform } as never }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } as never }))
  const toasts: string[] = []
  const copies: string[] = []
  const ran: string[][] = []
  on('ui.toast', (_, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.copy', (_, e) => { copies.push(e.text); return { value: { isCopied: true } } })
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  const files: Record<string, string> = {}
  on('fs.read', (_, e) => (files[e.path] !== undefined ? { value: files[e.path] ?? '' } : Promise.reject(new Error('ENOENT'))))
  on('fs.write', (_, e) => { files[e.path] = e.text; return { value: undefined } })
  let cli = CLI
  const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'node') return ok(JSON.stringify({ updated: 0, disk: { free: 1, total: 2 }, sessions: [cli, APP, SELF], alerts: [], rotations: [] }))
    ran.push([...e.argv])
    if (e.argv[0] === 'kill') cli = { ...cli, alive: false, status: 'stopped' }
    return ok('')
  })
  return { toasts, copies, ran }
}

test('macOS: open opens an app session, kill stops, a stopped terminal session resumes in Terminal', { options: { language: 'en' } }, async ($, on) => {
  const { copies, ran } = world(on, 'macos')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'chihuy', args: '' } as never)
  const ui = await $.ui.mount(PANE)

  await ui.press({ key: `row-${APP.id}` })
  expect(ran).toEqual([['open', LINK]])
  await ui.press({ key: `stop-${CLI.id}` })
  await ui.press({ key: `stop-yes-${CLI.id}` })
  expect(ran.at(-1)).toEqual(['kill', '7373'])

  // the folder and the id reach the script as arguments, never as text of it
  await ui.press({ key: `row-${CLI.id}` })
  expect(ran.at(-1)?.[0]).toBe('osascript')
  expect(ran.at(-1)?.slice(-2)).toEqual([base.cwd, CLI.id])
  expect(copies).toEqual([])
  await ui.unmount()
})

test('Linux: xdg-open opens an app session, kill stops, a stopped terminal session gets its resume command copied', { options: { language: 'en' } }, async ($, on) => {
  const { copies, ran, toasts } = world(on, 'linux')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'chihuy', args: '' } as never)
  const ui = await $.ui.mount(PANE)

  await ui.press({ key: `row-${APP.id}` })
  expect(ran).toEqual([['xdg-open', LINK]])
  await ui.press({ key: `stop-${CLI.id}` })
  await ui.press({ key: `stop-yes-${CLI.id}` })
  expect(ran.at(-1)).toEqual(['kill', '7373'])

  await ui.press({ key: `row-${CLI.id}` })
  expect(ran.length).toBe(2)
  expect(copies).toEqual([`claude --resume ${CLI.id}`])
  expect(toasts.at(-1)).toMatch(/claude --resume/)
  await ui.unmount()
})
