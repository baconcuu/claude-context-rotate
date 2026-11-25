import { expect, test } from 'claude-code/testing'

const SNAP = {
  updated: 0,
  disk: { free: 57e9, total: 510e9 },
  sessions: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Game đối kháng', host: 'local_d8958d24-7216-486e-8d14-fedaeb39e9ab', pid: 1, alive: true,
      status: 'busy', statusSince: 0, cwd: 'C:\\Game', entry: 'claude-desktop', version: '2',
      model: 'claude-opus-5-5', ctx: 393_000, lastTs: 0,
      running: { id: 't1', ts: 0, tool: 'Bash', text: 'Build the game' },
      mem: 300e6, jobs: [], errors30: 0, lastPrompt: 'làm tiếp', lastSay: '',
      rotateK: 250, custom: false, auto: true, life: 1, handoff: '', rotatedAt: 0,
    },
  ],
  alerts: [{ sev: 0, sid: 'a', who: 'Game đối kháng', text: 'context 393k ≥ ngưỡng rotate 250k' }],
  rotations: ['2025-01-01 02:10 | Dự án mẫu | đời 1 → 2 | 260k ≥ 250k | C:/x.md'],
}
const SCAN = {
  when: 0, total: 3e9, periodDays: null, protectHours: 24, disk: SNAP.disk,
  convs: [
    { id: 'old-1', project: 'C--Game', dir: 'C:\\x', bytes: 2e9, mtime: 1, live: false, recent: false, title: 'việc cũ', name: '' },
    { id: 'live-1', project: 'C--Game', dir: 'C:\\x', bytes: 1e9, mtime: 1, live: true, recent: false, title: 'đang chạy', name: '' },
  ],
}

const PANE = {
  plugin: 'dai-chi-huy',
  component: 'Pane',
  requestId: 'dai-chi-huy',
  props: { title: 'Đài Chỉ Huy', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('the pane shows sessions, alerts and the cleanup list on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'chihuy' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'self-session' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: new Date(60_000 + 2 * 3600_000 + 600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 91.5, resetsAt: new Date(60_000 + 3 * 86_400_000).toISOString() },
  ] } }))
  on('ui.toast', () => ({ value: undefined }))
  const opened: string[] = []
  // the per-session settings files, and a collector that reads them as the real one does
  const files: Record<string, string> = {}
  const SETTINGS = 'C:/Users/u/.claude/dai-chi-huy/session/aaaaaaaa-0000-0000-0000-000000000001.json'
  const settings = () => JSON.parse(files[SETTINGS] ?? '{}')
  const snapNow = () => ({ ...SNAP, sessions: SNAP.sessions.map(s => ({ ...s, rotateK: settings().rotateK ?? 250, custom: !!settings().rotateK, auto: settings().auto !== false })) })
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/u' : undefined }))
  on('fs.read', (_, e) => { const f = files[e.path.split(String.fromCharCode(92)).join('/')]; return f !== undefined ? { value: f } : Promise.reject(new Error('ENOENT')) })
  on('fs.write', (_, e) => { files[e.path.split(String.fromCharCode(92)).join('/')] = e.text; return { value: undefined } })
  on('process.run', (_, e) => (e.argv[0] === 'cmd.exe' ? (opened.push(e.argv.at(-1) ?? ''), { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) : {
    value: { exitCode: 0, stdout: JSON.stringify(e.argv[2] === 'scan' ? SCAN : snapNow()), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'chihuy', args: '' })

  // the band above the prompt: the quota bars alone
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'dai-chi-huy', component: 'AbovePrompt', requestId: 'band', surface,
      props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} } })
    expect((await band.find({ type: 'Button', text: /Game đối kháng/ }))).toBeUndefined()
    expect((await band.find({ type: 'Text', text: /Quota 5h/ }))?.text).toMatch(/42%.*reset sau 2h10/)
    expect((await band.find({ type: 'Text', text: /Quota tuần/ }))?.text).toMatch(/91[.]5%.*reset sau 3d0h/)
    await band.unmount()
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Game đối kháng/ }))?.text).toContain('Game đối kháng')
    expect((await ui.find({ type: 'Text', text: /Build the game/ }))?.text).toContain('Bash')
    await ui.press({ key: 'row-aaaaaaaa-0000-0000-0000-000000000001' })
    await ui.press({ key: 'info-aaaaaaaa-0000-0000-0000-000000000001' })
    expect((await ui.find({ type: 'Text', text: /làm tiếp/ }))).toBeTruthy()
    // per-session threshold: 393k is past 250k (NGUY CẤP) but under 350k
    await ui.press({ key: 'mk-350-aaaaaaaa-0000-0000-0000-000000000001' })
    expect((await ui.find({ type: 'Text', text: /393k\/350k \(mốc riêng\)/ }))).toBeTruthy()
    expect(settings()).toEqual({ rotateK: 350 })
    await ui.press({ key: 'mk-500-aaaaaaaa-0000-0000-0000-000000000001' })
    expect(settings()).toEqual({ rotateK: 500 })
    await ui.press({ key: 'mk-250-aaaaaaaa-0000-0000-0000-000000000001' })
    expect(settings()).toEqual({})
    // tự rotate off and on again
    await ui.press({ key: 'auto-off-aaaaaaaa-0000-0000-0000-000000000001' })
    expect(settings()).toEqual({ auto: false })
    expect((await ui.find({ type: 'Text', text: /tự rotate tắt/ }))).toBeTruthy()
    await ui.press({ key: 'auto-on-aaaaaaaa-0000-0000-0000-000000000001' })
    expect(settings()).toEqual({})
    expect((await ui.find({ type: 'Text', text: /đời 1 → 2/ }))).toBeTruthy()
    await ui.press({ key: 'info-aaaaaaaa-0000-0000-0000-000000000001' })

    await ui.press({ key: 'tab-alerts' })
    expect((await ui.find({ type: 'Text', text: /NGUY CẤP/ }))?.text).toContain('Game đối kháng')

    await ui.press({ key: 'tab-clean' })
    expect((await ui.find({ type: 'Text', text: /Hội thoại:/ }))).toBeTruthy()
    // a live session is never selectable
    await ui.press({ key: 'pick-C--Game/live-1' })
    await ui.press({ key: 'pick-C--Game/old-1' })
    expect((await ui.find({ type: 'Button', text: /Xoá 1 đã chọn/ }))).toBeTruthy()
    await ui.press({ key: 'pick-none' })
    await ui.press({ key: 'tab-team' })
    await ui.unmount()
  }
  // a click on a session's name in the pane opens that session's app link
  expect(opened).toEqual(['claude://claude.ai/epitaxy/local_d8958d24-7216-486e-8d14-fedaeb39e9ab', 'claude://claude.ai/epitaxy/local_d8958d24-7216-486e-8d14-fedaeb39e9ab'])
})
