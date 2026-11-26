import { expect, mock, test } from 'claude-code/testing'
import { LOCALES } from '../locales/index.mjs'

// A new language file must have every text of en.mjs, each with the same {placeholders}.
const holes = (s = '') => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

test('every language has every text of en.mjs, with the same {placeholders}', async () => {
  const en = LOCALES.en ?? {}
  for (const [code, L] of Object.entries(LOCALES)) {
    expect([code, Object.keys(L).sort()]).toEqual([code, Object.keys(en).sort()])
    for (const k of Object.keys(en)) expect([code, k, holes(L[k])]).toEqual([code, k, holes(en[k])])
  }
})

test('with language en the rule and the band are in English', { options: { language: 'en' } }, async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))

  const agent = await $.tool.call({ tool: 'Agent', description: 'make sounds', prompt: 'make the sound effects', subagent_type: 'general-purpose' })
  expect(agent.deny ?? agent.text).toContain('blocks subagents')

  const band = await $.ui.mount({ plugin: 'dai-chi-huy', component: 'AbovePrompt', requestId: 'band', surface: 'terminal',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} } })
  expect((await band.find({ type: 'Text', text: /Weekly quota/ }))?.text).toMatch(/waiting for the first turn/)
  await band.unmount()
})
