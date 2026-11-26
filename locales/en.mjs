// English: the reference every other language copies. A test checks that each language has
// exactly these keys and keeps the same {placeholders} in each text; the code fills them in.
export default {
  // the pane, its slash command, the status line
  title: 'Đài Chỉ Huy',
  cmdDescription: 'Open the Đài Chỉ Huy pane: sessions, alerts, cleanup of old conversations',
  cmdOpened: 'Opened the Đài Chỉ Huy pane.',
  statusLine: 'Đài Chỉ Huy ⚠ critical {crit} · warning {warn}',

  // session states
  stStopped: 'STOPPED',
  stDead: 'DEAD',
  stBusy: 'BUSY',
  stShell: 'JOB',
  stWaiting: 'WAITING',
  stIdle: 'IDLE',

  // the quota bars above the chat box
  quota5h: '5h quota',
  quotaWeek: 'Weekly quota',
  quotaWaiting: 'waiting for the first turn',
  quotaReset: 'resets in {t}',

  // the work card the agent writes before a rotation
  cardIntro: 'The handoff is a WORK CARD for the next step, at most ~4 KB, so that a new agent (with no chat history) can start working within 1–2 minutes:',
  cardNext: '1. Next: the concrete next step (goal, files to create or edit, when it is done: check command + pass criteria). If waiting for the user, write "WAITING FOR USER" and the question being asked.',
  cardRead: '2. Read: exactly the files / functions / lines (offset–limit) that step needs, plus the API summary file if there is one. Write "No need to read": what this card already covers (old handoffs, unrelated source code).',
  cardState: '3. State: what the previous step finished (1–3 lines), work in progress, background processes still running (PID, command, log).',
  cardNotes: '4. Notes: user rules still in force and pitfalls for this step, with full paths. Do not copy the history of earlier lives (it is already in the project notes).',

  // asking for the handoff at the end of a turn
  rotateHead: '[Đài Chỉ Huy · auto-rotate] The context of this session has reached {ctx}, at the {k}k mark.',
  rotateWrite: 'Before a new chat opens, write the handoff to the file `{file}` (create the folder if needed). Write only this file and do nothing else in this turn.',
  rotateDone: 'When done, reply with exactly one line: HANDOFF WRITTEN.',

  // asking for it after a tool result, in the middle of a long turn
  midHead: '[Đài Chỉ Huy · auto-rotate] The context of this session has reached {ctx} in the middle of a turn, past the {k}k mark.',
  midStop: 'Bring the current work to a safe stopping point: do not leave a file half-edited; let a running build or test finish, or note its state; leave background processes that must keep running, and note their PID and command.',
  midWrite: 'Then write the handoff to the file `{file}` (create the folder if needed).',
  midDone: 'When done, end the turn with exactly one line: HANDOFF WRITTEN. Do not start new work: a new chat opens by itself, reads that file and carries on.',

  // the first prompt of the new chat
  resumeHead: '[Đài Chỉ Huy · auto-rotate] This chat continues the session "{name}" (life {life}), opened automatically after the previous chat {why}.',
  resumeRead: 'Read the handoff `{file}`, then carry on from its "Next" section. Read only what its "Read" section lists; do not read older handoffs.',
  resumeWait: 'If the handoff says WAITING FOR USER, or no work is left, sum up where things stand in a few lines and wait for the user.',
  selfRotate: 'Switching chats yourself: when you have just FINISHED a step and the context is ≥ ~200k (or the next step needs very different reading), write the work card for the next step (sections: Next / Read / State / Notes) to `~/.claude/dai-chi-huy/request/$CLAUDE_CODE_SESSION_ID.md`, then end the turn with one line; when the turn ends the mod opens a new chat that carries on (needs context ≥ 120k). Do not wait for the hard rotation mark in the middle of a step.',
  whyMark: 'reached the {k}k mark',
  whySelf: 'handed over by itself at {ctx}',
  logLife: 'life {from} → {to}',

  // toasts about rotation
  toastRotate: 'Context {ctx} reached the {k}k mark: the agent writes a handoff, then a new chat opens by itself.',
  toastRotateMid: 'Context {ctx} reached the {k}k mark: the agent stops at a safe point and writes a handoff, then a new chat opens by itself.',
  blocked: 'Could not rotate yet: Claude Code is blocking the mod from sending messages (usually because you just pressed Stop). Send any message; when that turn ends, the mod tries again.',
  toastAborted: 'Auto-rotate stopped (the handoff turn was interrupted).',
  toastNoFile: 'The agent did not write the handoff file: no rotation; the mod tries again after 30k more context.',
  toastPressEnter: 'Opened the new chat; Claude Code did not let the mod send the prompt: press Enter to send the prompt that reads the handoff.',
  toastSmall: 'No chat switch: the context is only {ctx}, under {min}k.',

  // the rule against subagents
  noAgents: 'Đài Chỉ Huy blocks subagents and agents (Agent, Workflow). Do all the work in the main session; for long-running work use a background command (run_in_background).',

  // alert levels
  sevCrit: 'CRITICAL',
  sevWarn: 'WARNING',
  sevInfo: 'INFO',

  // reading, scanning, deleting
  errRead: 'Could not read the data: {err}',
  scanning: 'Scanning ~/.claude/projects…',
  errScan: 'Scan failed: {err}',
  deleting: 'Deleting {n} conversation(s)…',
  deleted: 'Deleted {n} conversation(s), freed {size}.',
  skipped: 'Skipped: {list}',
  logAt: 'Log: {path}',
  errDelete: 'Delete failed: {err}',

  // ⏻ stop, and opening a session
  stopNotIdle: 'Not stopped: {name} is no longer idle.',
  stopChanged: 'Not stopped: the session changed.',
  stopFailed: 'Could not stop {name}: {err}',
  stopped: 'Stopped {name}, freed ~{mem}.',
  stoppedApp: 'Send that session a message and the app opens it again.',
  stoppedTerm: 'Click the session name to open it again in a new terminal window.',
  jumpSelf: 'This is the session you have open.',
  jumpAppFail: 'Could not open the session {name}.',
  jumpOtherWindow: '{name} is open in another terminal window (pid {pid}).',
  jumpReopened: 'Opened {name} again in a new terminal window.',
  jumpCopied: 'Could not open a terminal window for {name}: copied the claude --resume command.',

  // the pane's top bar and tabs
  nBusy: '{n} busy',
  nJob: '{n} job',
  nWaiting: '{n} waiting',
  nIdle: '{n} idle',
  nStopped: '{n} stopped',
  nDead: '{n} dead',
  diskFree: '{free} free / {total}',
  updatedAgo: 'updated {t} ago',
  reading: 'reading…',
  tabTeam: 'Sessions',
  tabAlerts: 'Alerts',
  tabClean: '🧹 Cleanup',
  refresh: 'Refresh',

  // the Sessions tab
  noSessions: 'No registered sessions.',
  readingSessions: 'Reading ~/.claude/sessions…',
  life: 'life {n}',
  thisSession: 'this session',
  modDead: 'mod not running',
  collapse: '▴ less',
  details: 'ⓘ details',
  stop: '⏻ stop',
  stopAsk: 'Stop this session and free ~{mem} of RAM?',
  stopAskApp: 'The chat is kept: send it a message and the app opens it again.',
  stopAskTerm: 'The chat is kept: click the session name to open it again in a new terminal window. Its old terminal tab will freeze; just close it.',
  stopAskJobs: '{n} background job(s) keep running.',
  yesStop: 'Yes, stop',
  cancel: 'Cancel',
  ownMark: 'own mark',
  autoOn: '🔄 auto-rotate',
  autoOff: 'auto-rotate off',
  nBgJobs: '{n} background job(s)',
  active: 'active {t}',
  ago: '{t} ago',
  request: 'Request:',
  report: 'Report:',
  jobLine: 'job {name} · pid {pid} · {mem} · running {t}',
  markLabel: 'Rotation mark of this session:',
  autoLabel: 'Auto-rotate at the mark:',
  on: 'On',
  off: 'Off',
  lastHandoff: 'Last handoff ({t} ago):',
  copiedResume: 'Copied the claude --resume command',
  copyResume: 'Copy resume command',
  rotateLog: 'Rotation log',

  // the Alerts tab
  noAlerts: 'No alerts. ✓',
  thresholds: 'Thresholds: rotate {rotate}k · warn {warn}k · RAM {mem} MB · silent {quiet}′ (per-session marks: ⓘ details in the Sessions tab)',

  // the Cleanup tab
  scanningShort: 'Scanning…',
  convs: 'Conversations:',
  total: 'total',
  olderThan: 'Older than {n} days (deletable):',
  picked: 'Selected:',
  autoDelete: 'Claude Code deletes them by itself after {d} days (cleanupPeriodDays{def}). 🟢 = running, 🛡 = written in the last {h} hours: never deleted.',
  isDefault: ', the default',
  pickOlder: 'Select older than {n} days',
  pickNone: 'Clear selection',
  sortBy: 'Sort: {by}',
  sortSize: 'size',
  sortOld: 'oldest',
  sortProject: 'project',
  deleteN: 'Delete {n} selected',
  confirmDelete: 'Permanently delete {n} conversation(s) ({size})?',
  confirmNote: 'Nothing goes to the Recycle Bin; `claude --resume` can no longer open those sessions. Running sessions and files written in the last {h} hours are checked again on disk and skipped.',
  yesDelete: 'Yes, delete',
  empty: '(empty)',
  more: '… and {n} more conversations (sort differently to see them)',

  // scripts/collect.mjs: what a session is doing, alerts, cleanup
  bg: '[background]',
  disk: 'disk',
  diskCrit: 'only {free} free — delete old conversations in the 🧹 Cleanup tab',
  diskLow: '{free} free (< 10%) — 🧹 Cleanup tab',
  aDead: 'the session is dead but still registered (pid {pid})',
  aModDead: 'the Đài Chỉ Huy mod is not running in this session: it will not rotate by itself. When the session is idle: ⏻ stop it, then send it a message so the mod loads again',
  aCtxOver: 'context {ctx} ≥ rotation mark {rotate}',
  aCtxNear: 'context {ctx} — rotation soon (warning at {warn})',
  aRam: 'RAM {mem} — time to /clear or rotate',
  aLongTool: 'tool running for {mins}′: {tool} {text}',
  aQuiet: 'busy but silent for {mins}′ (stuck? waiting for a permission?)',
  aErrors: '{n} tool errors in the last 30′',
  aIdle: 'idle for {t} — free for new work',
  aSameFile: 'same file edited within 60′: {path}',
  subOnly: '(only side folders left: subagents / tool-results)',
  delRunning: '{id} is running — skipped',
  delRecent: '{id} was just written — skipped',
}
