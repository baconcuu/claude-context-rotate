// Tiếng Việt: the same keys as en.mjs, in the same order.
export default {
  // the pane, its slash command, the status line
  title: 'Đài Chỉ Huy',
  cmdDescription: 'Mở pane Đài Chỉ Huy: đội hình phiên, cảnh báo, dọn dẹp hội thoại cũ',
  cmdOpened: 'Đã mở pane Đài Chỉ Huy.',
  statusLine: 'Đài Chỉ Huy ⚠ {crit} nguy cấp · {warn} chú ý',

  // session states
  stStopped: 'ĐÃ TẮT',
  stDead: 'CHẾT',
  stBusy: 'BẬN',
  stShell: 'JOB',
  stWaiting: 'CHỜ',
  stIdle: 'RẢNH',

  // the quota bars above the chat box
  quota5h: 'Quota 5h',
  quotaWeek: 'Quota tuần',
  quotaWaiting: 'chờ lượt chat đầu tiên',
  quotaReset: 'reset sau {t}',

  // the work card the agent writes before a rotation
  cardIntro: 'Bàn giao là PHIẾU VIỆC cho bước tiếp theo, tối đa ~4 KB, để agent mới (không có lịch sử chat) bắt tay làm ngay trong 1–2 phút:',
  cardNext: '1. Việc tiếp: bước tiếp theo cụ thể (mục tiêu, file sẽ tạo/sửa, xong khi nào: lệnh kiểm tra + tiêu chí đạt). Đang chờ người dùng thì ghi rõ "CHỜ NGƯỜI DÙNG" và câu đang hỏi.',
  cardRead: '2. Đọc gì: đúng những file / hàm / dòng (offset–limit) bước đó cần, file tóm tắt API nếu có. Ghi rõ "Không cần đọc": những gì đã nắm qua phiếu này (bàn giao cũ, mã nguồn không liên quan).',
  cardState: '3. Trạng thái: đã xong gì ở bước trước (1–3 dòng), việc đang dở, tiến trình nền đang chạy (PID, lệnh, log).',
  cardNotes: '4. Lưu ý: luật người dùng còn hiệu lực và cạm bẫy liên quan đến bước này, đường dẫn đầy đủ. Không chép lại lịch sử các đời trước (đã có trong PROGRESS của dự án).',

  // asking for the handoff at the end of a turn
  rotateHead: '[Đài Chỉ Huy · tự rotate] Context phiên này đã tới {ctx}, chạm mốc {k}k.',
  rotateWrite: 'Trước khi mở cuộc chat mới, hãy viết bản bàn giao vào file `{file}` (tạo thư mục nếu chưa có). Chỉ viết file này, không làm việc khác trong lượt này.',
  rotateDone: 'Viết xong thì trả lời đúng một dòng: ĐÃ VIẾT BÀN GIAO.',

  // asking for it after a tool result, in the middle of a long turn
  midHead: '[Đài Chỉ Huy · tự rotate] Context phiên này đã tới {ctx} ngay giữa lượt, quá mốc {k}k.',
  midStop: 'Đưa việc đang làm tới một điểm dừng an toàn: không bỏ dở file đang sửa; build/test đang chạy thì chờ xong hoặc ghi lại trạng thái; tiến trình nền cần giữ thì để chạy và ghi lại PID, lệnh.',
  midWrite: 'Rồi viết bản bàn giao vào file `{file}` (tạo thư mục nếu chưa có).',
  midDone: 'Viết xong thì kết thúc lượt bằng đúng một dòng: ĐÃ VIẾT BÀN GIAO. Không bắt đầu việc mới: cuộc chat mới sẽ tự mở, đọc file đó và làm tiếp.',

  // the first prompt of the new chat
  resumeHead: '[Đài Chỉ Huy · tự rotate] Đây là cuộc chat tiếp nối của phiên "{name}" (đời {life}), mở tự động sau khi cuộc chat trước {why}.',
  resumeRead: 'Đọc bản bàn giao `{file}` rồi làm tiếp từ mục "Việc tiếp". Chỉ đọc những gì mục "Đọc gì" liệt kê; không đọc bàn giao cũ.',
  resumeWait: 'Nếu bàn giao ghi CHỜ NGƯỜI DÙNG, hoặc không còn việc dở, chỉ tóm tắt ngắn tình hình và chờ người dùng.',
  selfRotate: 'Tự đổi chat: khi vừa XONG một bước và context đã ≥ ~200k (hoặc bước sau cần đọc nhiều thứ khác hẳn), ghi phiếu việc cho bước sau (theo mẫu: Việc tiếp / Đọc gì / Trạng thái / Lưu ý) vào `~/.claude/dai-chi-huy/request/$CLAUDE_CODE_SESSION_ID.md` rồi kết thúc lượt bằng một dòng; hết lượt mod tự mở chat mới làm tiếp (cần context ≥ 120k). Đừng chờ tới mốc rotate cứng giữa chừng một bước.',
  whyMark: 'chạm mốc {k}k',
  whySelf: 'tự đổi chat ở {ctx}',
  logLife: 'đời {from} → {to}',

  // toasts about rotation
  toastRotate: 'Context {ctx} chạm mốc {k}k: agent viết bàn giao, xong sẽ tự mở cuộc chat mới.',
  toastRotateMid: 'Context {ctx} chạm mốc {k}k: agent dừng ở điểm an toàn rồi viết bàn giao, xong sẽ tự mở cuộc chat mới.',
  blocked: 'Chưa rotate được: Claude Code đang chặn mod tự gửi tin (thường do bạn vừa bấm dừng). Gửi một tin bất kỳ, hết lượt đó mod sẽ thử lại.',
  toastAborted: 'Đã dừng tự rotate (lượt viết bàn giao bị ngắt).',
  toastNoFile: 'Agent chưa viết file bàn giao: chưa rotate, sẽ thử lại khi context tăng thêm 30k.',
  toastPressEnter: 'Đã mở cuộc chat mới; Claude Code chưa cho mod tự gửi lời nhắc: bấm Enter để gửi lời nhắc đọc bàn giao.',
  toastSmall: 'Không đổi chat: context mới {ctx}, dưới {min}k.',

  // the rule against subagents
  noAgents: 'Đài Chỉ Huy chặn subagent/agent (Agent, Workflow). Tự làm hết trong phiên chính; việc chạy lâu thì dùng lệnh nền (run_in_background).',

  // alert levels
  sevCrit: 'NGUY CẤP',
  sevWarn: 'CHÚ Ý',
  sevInfo: 'THÔNG TIN',

  // reading, scanning, deleting
  errRead: 'Lỗi đọc dữ liệu: {err}',
  scanning: 'Đang quét ~/.claude/projects…',
  errScan: 'Quét lỗi: {err}',
  deleting: 'Đang xoá {n} hội thoại…',
  deleted: 'Đã xoá {n} hội thoại, lấy lại {size}.',
  skipped: 'Bỏ qua: {list}',
  logAt: 'Log: {path}',
  errDelete: 'Xoá lỗi: {err}',

  // ⏻ stop, and opening a session
  stopNotIdle: 'Không tắt: {name} không còn rảnh.',
  stopChanged: 'Không tắt: phiên đã đổi.',
  stopFailed: 'Không tắt được {name}: {err}',
  stopped: 'Đã tắt {name}, lấy lại ~{mem}.',
  stoppedApp: 'Gửi tin vào phiên đó là app mở lại.',
  stoppedTerm: 'Bấm tên phiên để mở lại trong cửa sổ terminal mới.',
  jumpSelf: 'Đây là phiên bạn đang mở.',
  jumpAppFail: 'Không mở được phiên {name}.',
  jumpOtherWindow: '{name} đang mở ở một cửa sổ terminal khác (pid {pid}).',
  jumpReopened: 'Đã mở lại {name} trong một cửa sổ terminal mới.',
  jumpCopied: 'Không mở được cửa sổ terminal cho {name}: đã copy lệnh claude --resume.',

  // the pane's top bar and tabs
  nBusy: '{n} bận',
  nJob: '{n} job',
  nWaiting: '{n} chờ',
  nIdle: '{n} rảnh',
  nStopped: '{n} đã tắt',
  nDead: '{n} chết',
  diskFree: 'trống {free} / {total}',
  updatedAgo: 'cập nhật {t} trước',
  reading: 'đang đọc…',
  tabTeam: 'Đội hình',
  tabAlerts: 'Cảnh báo',
  tabClean: '🧹 Dọn dẹp',
  refresh: 'Làm mới',

  // the Sessions tab
  noSessions: 'Không có phiên nào đang đăng ký.',
  readingSessions: 'Đang đọc ~/.claude/sessions…',
  life: 'đời {n}',
  thisSession: 'phiên này',
  modDead: 'mod không chạy',
  collapse: '▴ thu',
  details: 'ⓘ chi tiết',
  stop: '⏻ tắt',
  stopAsk: 'Tắt phiên này, lấy lại ~{mem} RAM?',
  stopAskApp: 'Chat vẫn giữ, gửi tin vào là app mở lại.',
  stopAskTerm: 'Chat vẫn giữ: bấm tên phiên để mở lại trong cửa sổ terminal mới. Tab terminal cũ của nó sẽ đứng lại, cứ đóng đi.',
  stopAskJobs: '{n} job nền vẫn chạy tiếp.',
  yesStop: 'Có, tắt',
  cancel: 'Huỷ',
  ownMark: 'mốc riêng',
  autoOn: '🔄 tự rotate',
  autoOff: 'tự rotate tắt',
  nBgJobs: '{n} job nền',
  active: 'hoạt động {t}',
  ago: '{t} trước',
  request: 'Yêu cầu:',
  report: 'Báo cáo:',
  jobLine: 'job {name} · pid {pid} · {mem} · chạy {t}',
  markLabel: 'Mốc rotate của phiên này:',
  autoLabel: 'Tự rotate khi chạm mốc:',
  on: 'Bật',
  off: 'Tắt',
  lastHandoff: 'Bàn giao gần nhất ({t} trước):',
  copiedResume: 'Đã copy lệnh claude --resume',
  copyResume: 'Copy lệnh resume',
  rotateLog: 'Nhật ký tự rotate',

  // the Alerts tab
  noAlerts: 'Không có cảnh báo nào. ✓',
  thresholds: 'Ngưỡng: rotate {rotate}k · cảnh báo {warn}k · RAM {mem} MB · im lặng {quiet}′ (mốc riêng từng phiên: ⓘ chi tiết ở tab Đội hình)',

  // the Cleanup tab
  scanningShort: 'Đang quét…',
  convs: 'Hội thoại:',
  total: 'tổng',
  olderThan: 'Cũ hơn {n} ngày (xoá được):',
  picked: 'Đã chọn:',
  autoDelete: 'Claude Code tự xoá sau {d} ngày (cleanupPeriodDays{def}). 🟢 = đang chạy, 🛡 = ghi trong {h} giờ qua: không bao giờ xoá.',
  isDefault: ', mặc định',
  pickOlder: 'Chọn cũ hơn {n} ngày',
  pickNone: 'Bỏ chọn',
  sortBy: 'Sắp xếp: {by}',
  sortSize: 'dung lượng',
  sortOld: 'cũ nhất',
  sortProject: 'dự án',
  deleteN: 'Xoá {n} đã chọn',
  confirmDelete: 'Xoá vĩnh viễn {n} hội thoại ({size})?',
  confirmNote: 'Không vào Thùng rác; `claude --resume` các phiên đó sẽ không mở lại được. Phiên đang chạy và file ghi trong {h} giờ qua được kiểm tra lại trên đĩa và bỏ qua.',
  yesDelete: 'Có, xoá',
  empty: '(trống)',
  more: '… và {n} hội thoại nữa (sắp xếp lại để xem)',

  // scripts/collect.mjs: what a session is doing, alerts, cleanup
  bg: '[nền]',
  disk: 'ổ đĩa',
  diskCrit: 'chỉ còn trống {free} — vào tab 🧹 Dọn dẹp xoá hội thoại cũ',
  diskLow: 'còn trống {free} (< 10%) — tab 🧹 Dọn dẹp',
  aDead: 'phiên đã chết nhưng còn đăng ký (pid {pid})',
  aModDead: 'mod Đài Chỉ Huy không chạy trong phiên này: sẽ không tự rotate. Lúc phiên rảnh: ⏻ tắt rồi gửi một tin để mod nạp lại',
  aCtxOver: 'context {ctx} ≥ ngưỡng rotate {rotate}',
  aCtxNear: 'context {ctx} — sắp rotate (cảnh báo {warn})',
  aRam: 'RAM {mem} — nên /clear hoặc rotate',
  aLongTool: 'tool chạy lâu {mins}′: {tool} {text}',
  aQuiet: 'báo bận nhưng im lặng {mins}′ (kẹt? chờ quyền?)',
  aErrors: '{n} lỗi tool trong 30′ gần nhất',
  aIdle: 'rảnh {t} — có thể giao việc',
  aSameFile: 'cùng sửa 1 file trong 60′: {path}',
  subOnly: '(chỉ còn thư mục phụ: subagents / tool-results)',
  delRunning: '{id} đang chạy — bỏ qua',
  delRecent: '{id} vừa được ghi — bỏ qua',
}
