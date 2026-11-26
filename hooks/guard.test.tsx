import { expect, test } from 'claude-code/testing'

// With blockAgents on: no subagents or workflows in any session. Every other tool runs.
test('Agent and Workflow calls are refused with the rule; other tools run', { options: { language: 'vi', blockAgents: true } }, async ($, on) => {
  const ran: string[] = []
  on('tool.call', (_, e) => { ran.push(e.tool); return { result: 'ok', text: 'ok' } })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))

  const agent = await $.tool.call({ tool: 'Agent', description: 'make sounds', prompt: 'make the sound effects', subagent_type: 'general-purpose' })
  expect(agent.deny ?? agent.text).toContain('chặn subagent')
  const flow = await $.tool.call({ tool: 'Workflow', script: 'export const meta = { name: "x", description: "x" }' })
  expect(flow.deny ?? flow.text).toContain('chặn subagent')
  const bash = await $.tool.call({ tool: 'Bash', command: 'npm run build', run_in_background: true })
  expect(bash.deny).toBeUndefined()
  expect(ran).toEqual(['Bash'])
})

test('blockAgents is off by default: Agent and Workflow calls run', async ($, on) => {
  const ran: string[] = []
  on('tool.call', (_, e) => { ran.push(e.tool); return { result: 'ok', text: 'ok' } })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))

  const agent = await $.tool.call({ tool: 'Agent', description: 'make sounds', prompt: 'make the sound effects', subagent_type: 'general-purpose' })
  expect(agent.deny).toBeUndefined()
  const flow = await $.tool.call({ tool: 'Workflow', script: 'export const meta = { name: "x", description: "x" }' })
  expect(flow.deny).toBeUndefined()
  expect(ran).toEqual(['Agent', 'Workflow'])
})
