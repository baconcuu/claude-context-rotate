import { expect, mock, test } from 'claude-code/testing'

// One session past its threshold: the turn's end asks for a handoff; the handoff turn's end
// clears the chat and starts the new one on it.
const OLD = '11111111-1111-1111-1111-111111111111'
const NEW = '22222222-2222-2222-2222-222222222222'
const HOME = 'C:/Users/u'
const DATA = `${HOME}/.claude/dai-chi-huy`

// drops.n: how many of the plugin's next prompts the engine drops (a Stop stands)
function world(on: Parameters<Parameters<typeof test>[1]>[1], ctxTokens: { value: number }, drops = { n: 0 }) {
  const files: Record<string, { text: string; mtimeMs: number }> = {}
  const submitted: string[] = []
  const commands: string[] = []
  const seen: string[] = []
  let id = OLD
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.env(on, { USERPROFILE: 'C:\\Users\\u' })
  on('command.register', () => ({ value: { command: 'chihuy' } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: id }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: ctxTokens.value, window: 1_000_000 }, rateLimits: [] } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'no collector in tests', isStdoutTruncated: false, isStderrTruncated: false } }))
  const at = (p: string) => p.replace(/\\/g, '/')
  on('fs.read', (_, e) => { seen.push(`read ${e.path}`); const f = files[at(e.path)]; return f ? { value: f.text } : Promise.reject(new Error('ENOENT')) })
  on('fs.write', (_, e) => { seen.push(`write ${e.path}`); files[at(e.path)] = { text: e.text, mtimeMs: clock.now() }; return { value: undefined } })
  on('fs.stat', (_, e) => { seen.push(`stat ${e.path}`); const f = files[at(e.path)]; return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : Promise.reject(new Error('ENOENT')) })
  on('prompt.submit', (_, e) => {
    if (drops.n > 0) { drops.n--; return { drop: 'a Stop stands' } }
    submitted.push(e.text)
    return { text: e.text }
  })
  on('command.run', (_, e) => { commands.push(e.command); if (e.command === 'clear') id = NEW; return { text: '' } })
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  return { files, submitted, commands, clock, seen }
}

const turnEnd = (isAborted = false) => ({
  reason: isAborted ? 'aborted' : 'answer', answer: '', durationMs: 1, isAborted, turnId: 't',
}) as never

test('past its threshold a session writes a handoff, clears and starts the new chat on it', async ($, on) => {
  const ctx = { value: 260_000 }
  const w = world(on, ctx)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // the turn ends at 260k, past 250k: the agent is asked for the handoff
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.submitted.length).toBe(1)
  expect(w.submitted[0]).toContain('chạm mốc 250k')
  const file = /`([^`]+\.md)`/.exec(w.submitted[0])?.[1] ?? ''
  expect(file.startsWith(`${DATA}/handoff/`)).toBe(true)

  // the agent writes it; the handoff turn ends: /clear, then the new chat starts on the file
  w.files[file] = { text: '# bàn giao', mtimeMs: w.clock.now() }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual(['clear'])
  expect(w.submitted.length).toBe(2)
  expect(w.submitted[1]).toContain(file)
  expect(w.submitted[1]).toContain('đời 2')
  expect(JSON.parse(w.files[`${DATA}/session/${NEW}.json`].text)).toMatchObject({ life: 2, handoff: file, from: OLD })
  expect(w.files[`${DATA}/rotate.log`].text).toContain('đời 1 → 2')
})

test('a session with tự rotate off, or under its own threshold, does not rotate', async ($, on) => {
  const ctx = { value: 300_000 }
  const w = world(on, ctx)
  // its own threshold 350k
  w.files[`${DATA}/session/${OLD}.json`] = { text: JSON.stringify({ rotateK: 350 }), mtimeMs: 0 }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.submitted).toEqual([])

  // past it but switched off
  ctx.value = 400_000
  w.files[`${DATA}/session/${OLD}.json`] = { text: JSON.stringify({ rotateK: 350, auto: false }), mtimeMs: 0 }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.submitted).toEqual([])
})

test('no handoff file, or an interrupted handoff turn: no /clear, and no retry until 30k more', async ($, on) => {
  const ctx = { value: 260_000 }
  const w = world(on, ctx)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.submitted.length).toBe(1)

  // the person interrupts the handoff turn
  await $.turn.complete(turnEnd(true))
  await w.clock.advance(1000)
  expect(w.commands).toEqual([])

  // a few more turns, still under 290k: no new handoff request
  ctx.value = 280_000
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.submitted.length).toBe(1)

  // past 290k: asked again
  ctx.value = 291_000
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.submitted.length).toBe(2)
})

test('a long turn past its threshold: a tool result carries the handoff note once; the turn end rotates', async ($, on) => {
  const ctx = { value: 200_000 }
  const w = world(on, ctx)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // under the threshold: no note
  let r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(r.context).toBeUndefined()
  // past it, a subagent's call: no note
  ctx.value = 270_000
  r = await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
  expect(r.context).toBeUndefined()
  // the main loop's next call: the note, read after the tool's result
  r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(r.context?.[0]).toContain('ngay giữa lượt')
  const file = /`([^`]+[.]md)`/.exec(r.context?.[0] ?? '')?.[1] ?? ''
  expect(file.startsWith(`${DATA}/handoff/`)).toBe(true)
  // only once
  r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(r.context).toBeUndefined()
  expect(w.submitted).toEqual([])
  // the agent writes it and ends the turn: /clear, then the new chat starts on it
  w.files[file] = { text: '# bàn giao', mtimeMs: w.clock.now() }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual(['clear'])
  expect(w.submitted.length).toBe(1)
  expect(w.submitted[0]).toContain(file)
  expect(w.submitted[0]).toContain('đời 2')
})

test('a long turn that ends without the handoff the note asked for: it is asked as a prompt of its own', async ($, on) => {
  const ctx = { value: 270_000 }
  const w = world(on, ctx)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(r.context?.[0]).toContain('ngay giữa lượt')
  // the turn ends on a question to the person, no handoff written
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual([])
  expect(w.submitted.length).toBe(1)
  expect(w.submitted[0]).toContain('Chỉ viết file này')
  const file = /`([^`]+[.]md)`/.exec(w.submitted[0])?.[1] ?? ''
  w.files[file] = { text: '# bàn giao', mtimeMs: w.clock.now() }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual(['clear'])
})

test('the engine drops the handoff request (a Stop stands): nothing is left waiting, the next turn end asks again', async ($, on) => {
  const ctx = { value: 400_000 }
  const w = world(on, ctx, { n: 1 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.submitted).toEqual([])
  // the person's next turn ends: asked again, and this time it enters
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.submitted.length).toBe(1)
  expect(w.submitted[0]).toContain('chạm mốc 250k')
  const file = /`([^`]+[.]md)`/.exec(w.submitted[0])?.[1] ?? ''
  w.files[file] = { text: '# bàn giao', mtimeMs: w.clock.now() }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual(['clear'])
})

test('a turn the person queued ends first: the mod waits for the handoff turn', async ($, on) => {
  const ctx = { value: 260_000 }
  const w = world(on, ctx)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  const file = /`([^`]+[.]md)`/.exec(w.submitted[0])?.[1] ?? ''
  // the person's queued turn ends with no handoff yet
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual([])
  // then the handoff turn
  w.files[file] = { text: '# bàn giao', mtimeMs: w.clock.now() }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual(['clear'])
})

test('a handoff the agent wrote itself before waiting for the person: the turn end rotates on it', async ($, on) => {
  const ctx = { value: 150_000 }
  const w = world(on, ctx)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const req = `${DATA}/request/${OLD}.md`
  w.files[req] = { text: '# bàn giao\nCHỜ NGƯỜI DÙNG', mtimeMs: w.clock.now() }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual(['clear'])
  expect(w.files[req].text).toBe('')
  const file = /`([^`]+[.]md)`/.exec(w.submitted[0] ?? '')?.[1] ?? ''
  expect(file.startsWith(`${DATA}/handoff/`)).toBe(true)
  expect(w.files[file].text).toContain('CHỜ NGƯỜI DÙNG')
  expect(w.submitted[0]).toContain('tự đổi chat ở')
  expect(w.submitted[0]).toContain('đời 2')
  expect(w.submitted[0]).toContain('Tự đổi chat: khi vừa XONG một bước')
  expect(w.files[`${DATA}/rotate.log`].text).toContain('tự đổi chat ở')

  // the new chat's shell still carries the old id: its next request is found through `from`
  ctx.value = 130_000
  w.files[req] = { text: '# bàn giao 2', mtimeMs: w.clock.now() }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual(['clear', 'clear'])
  expect(w.files[req].text).toBe('')
})

test('a request from a small chat is dropped without a rotation', async ($, on) => {
  const ctx = { value: 90_000 }
  const w = world(on, ctx)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const req = `${DATA}/request/${OLD}.md`
  w.files[req] = { text: '# bàn giao', mtimeMs: w.clock.now() }
  await $.turn.complete(turnEnd())
  await w.clock.advance(1000)
  expect(w.commands).toEqual([])
  expect(w.submitted).toEqual([])
  expect(w.files[req].text).toBe('')
})
