<p align="center">
  <img src="docs/hero.en.png" alt="Đài Chỉ Huy (command post), a Claude Code mod: long sessions, short context. 27% fewer tokens re-read, 15% lower cost per call, half the hourly burn of subagents." width="880">
</p>

<p align="center">
  <b>English</b> · <a href="README.vi.md">Tiếng Việt</a>
  <br><br>
  <img src="https://img.shields.io/badge/Claude_Code-mod-3987e5?style=flat-square" alt="Claude Code mod">
  <img src="https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square" alt="Windows">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square" alt="MIT license"></a>
</p>

Every Claude Code call re-reads the whole context, yet auto-compact can wait until 370–600k and then keeps only a lossy summary. Đài Chỉ Huy rotates the chat at 250k instead: the agent writes a 4 KB work card, the mod runs `/clear`, and a fresh chat carries on from the card.

<img src="docs/showcase.en.png" alt="The pane: every session with its context against the rotation mark, RAM and background jobs, then the rotation log. Beside it, the 5-hour and weekly quota bars." width="880">

## How it works

<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/flow.en.dark.png">
  <img src="docs/flow.en.light.png" alt="1. Context hits 250k, or the agent finishes a step near 200k. 2. It writes a work card of at most 4 KB. 3. The mod runs /clear in the same session. 4. A fresh chat starts near 50k and carries on." width="880">
</picture></p>

## The numbers

<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/trace.en.dark.png">
  <img src="docs/trace.en.light.png" alt="Context per call over 1,800 calls of one long task. Auto-compact: average 241k, peak 566k. Đài Chỉ Huy: average 176k, peak 286k. 27% fewer tokens re-read." width="880">
</picture></p>

<p><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/subagents.en.dark.png">
  <img src="docs/subagents.en.light.png" alt="Subagents vs one solo session with rotation: $10.3 vs $5.2 per active hour, $83 vs $37 in the busiest hour, 592k vs 251k context per call at p90, $0.047 vs $0.062 per 1k output tokens." width="880">
</picture></p>

That is why the mod blocks the `Agent` and `Workflow` tools in every session. Background shell commands still run.

## Install

Windows with Node on `PATH`, in the desktop app or the terminal. The interface is in Vietnamese.

```powershell
git clone https://github.com/baconcuu/claude-context-rotate "$HOME\.claude\mods\dai-chi-huy"
```

Add this to `~/.claude/settings.json`, then start a new session. The pane opens on its own, or run `/chihuy`.

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<you>\\.claude\\mods\\dai-chi-huy" } }
```

Remove the line to uninstall.

<details>
<summary><b>Settings</b></summary>
<br>

Plugin config for `dai-chi-huy`. Defaults live in `.claude-plugin/plugin.json`.

| Setting | Default | Meaning |
|---|---|---|
| `rotateK` | 250 | Rotation mark, k tokens |
| `warnK` | 230 | Context warning, k tokens |
| `memWarnMb` | 1500 | RAM warning per session, MB |
| `quietBusyMin` | 15 | Warn when a busy session stays silent this many minutes |
| `cleanupDays` | 7 | Cleanup preselects transcripts older than this many days |
| `cleanupProtectHours` | 24 | Cleanup never deletes anything written in this many hours |

Each session can turn rotation off or pick its own mark (250, 350 or 500k) under `ⓘ chi tiết` in the pane. Every rotation goes to `~/.claude/dai-chi-huy/rotate.log`, every deletion to `cleanup.log`.

`scripts/collect.mjs` only reads files and never calls an API. Only the Cleanup tab deletes, after you confirm, and deletion is permanent.

Tests: `claude plugin test .`

</details>

<details>
<summary><b>All numbers</b></summary>
<br>

About 550 sessions of one heavy user over a month. Costs use API prices as a relative proxy, not plan limits.

| | Auto-compact only | Rotate at 250k | Rotate + ≤ 4 KB work card |
|---|---|---|---|
| Context per call, median | 216k | 172k | **160k** |
| Context per call, p90 | 373k | 251k | **239k** |
| Largest context before a reset | 370–600k | ~260k | ~260k |
| Cost per call | $0.091 | **$0.076** | $0.080 |
| What survives a reset | an automatic summary, often missing details | a work card with the exact next step and files to read | same, shorter |

| | Subagents | Solo + rotation |
|---|---|---|
| $ per active hour (median) | $10.3 | **$5.2** |
| $ in the busiest hour | $83 | **$37** |
| $ per call | $0.088 | **$0.077** |
| Context p90 | 592k | **251k** |
| $ per 1k output tokens | **$0.047** | $0.062 |
| $ per working day | ~$110 | ~$103 |
| Cache re-writes after long agent waits | ~$205 | ~$63 |

</details>

<p align="center"><sub><a href="LICENSE">MIT</a> · Not affiliated with Anthropic</sub></p>
