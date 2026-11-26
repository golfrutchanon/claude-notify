// copvang-notify — เสียงแจ้งเตือนสไตล์ก๊อปวาง สำหรับ Claude Code (Terminal และแอป Claude Desktop)
//
// เสียงหลัก Glass ×4 แล้วปิดด้วย Hero ×1 ดังเมื่อ:
//   done  Claude ตอบจบจริง และไม่มีงานเบื้องหลัง/งานตั้งเวลาค้าง (classic.Stop)
//   ask   Claude ถามคำถามรอคุณตอบ (tool.call ของ AskUserQuestion)
//   perm  Claude ขออนุญาต (classic.PermissionRequest)
// เสียงสั้นดังครั้งเดียว:
//   fail     คำสั่งล้มเหลว → ตุ๊บ (Basso) ครั้งแรกของแต่ละรอบเท่านั้น
//   agent    Agent ย่อยเสร็จ → ติ๊ง (Tink) ค่าเริ่มต้นปิด
//   context  Context ข้าม 70% และ 90% → เตือนเกณฑ์ละครั้ง
//   quota    โควตา 5 ชม./7 วัน ข้าม 80% และ 95% → เกณฑ์ละ 1 ทีต่อรอบโควตา
//
// ไม่ใช้ afplay / ไม่เรียกโปรแกรมภายนอก: อ่านไฟล์เสียงมาตรฐานในเครื่อง
// (Mac /System/Library/Sounds · Windows C:\Windows\Media) แล้วเล่นผ่าน $.audio.play
// จึงทำงานได้ทั้งใน Terminal และแอป Claude Desktop · หาไฟล์ไม่เจอ = เงียบ ไม่ error
import type { EngineInterface, Register } from 'claude-code'

import {
  DEFAULTS, HELP, LABEL, MAC_DIR, QUOTA_KINDS, SEQUENCE, SOUND_NAME, TONES, WIN_DIR,
  CONTEXT_STEPS, apply, crossed, windowsPlayCommand, isOn, parseCommand, quotaAlerts, settingsOf, statusText,
} from './logic.ts'
import type { Part, QuotaSeen, Settings, Tone } from './logic.ts'
import { buildClips, fromBase64 } from './sound.ts'
import type { Clip } from './sound.ts'

// ความจำของ session นี้ (เริ่มใหม่ทุก session.start และหลัง reload)
let settings: Settings = DEFAULTS
let platform: 'mac' | 'win' | undefined
let mainBusyUntil = 0
let failRang = false
let contextSeen = 0
const tones = new Map<Tone, Promise<{ name: string; bytes: Uint8Array } | undefined>>()
type Ready = { clips: Clip[]; ms: number[]; paths: string[] }
const clips = new Map<string, Promise<Ready>>()

const quiet = (): undefined => undefined

async function loadSettings($: EngineInterface): Promise<Settings> {
  try {
    settings = settingsOf(await $.store.get('settings'))
  } catch {
    // อ่านไม่ได้ ใช้ค่าในความจำ
  }
  return settings
}

async function saveSettings($: EngineInterface, s: Settings): Promise<void> {
  settings = s
  await $.store.set('settings', s).catch(quiet)
}

async function detectPlatform($: EngineInterface): Promise<void> {
  try {
    const p = (await $.session.info()).platform
    platform = p === 'macos' ? 'mac' : p === 'windows' ? 'win' : undefined
  } catch {
    platform = undefined
  }
}

/** ไฟล์เสียงแรกที่มีจริงในเครื่อง · ไม่มี = undefined (เงียบ) */
function loadTone($: EngineInterface, tone: Tone): Promise<{ name: string; bytes: Uint8Array } | undefined> {
  let found = tones.get(tone)
  if (!found) {
    found = (async () => {
      const mac = [MAC_DIR + TONES[tone].mac]
      const win = TONES[tone].win.map(n => WIN_DIR + n)
      const order = platform === 'win' ? [...win, ...mac] : [...mac, ...win]
      for (const path of order) {
        try {
          if (!(await $.fs.exists(path))) continue
          const { base64 } = await $.fs.read(path, { as: 'bytes' })
          return { name: path, bytes: fromBase64(base64) }
        } catch {
          // ไฟล์นี้อ่านไม่ได้ ลองไฟล์ถัดไป
        }
      }
      return undefined
    })()
    tones.set(tone, found)
  }
  return found
}

function prepare($: EngineInterface, part: Part): Promise<Ready> {
  const key = SEQUENCE[part].join('+')
  let ready = clips.get(key)
  if (!ready) {
    ready = (async () => {
      const files = (await Promise.all(SEQUENCE[part].map(t => loadTone($, t)))).filter(
        (f): f is { name: string; bytes: Uint8Array } => f !== undefined,
      )
      return { ...buildClips(files), paths: files.map(f => f.name) }
    })().catch(() => ({ clips: [], ms: [], paths: [] }))
    clips.set(key, ready)
  }
  return ready
}

/** เล่นเสียงของจังหวะนั้นจนจบ (ไม่โยน error) */
async function playSequence($: EngineInterface, part: Part): Promise<void> {
  const { clips: list, ms, paths } = await prepare($, part)
  // Windows: เครื่องเล่นเสียงของ Claude Code ไม่มีบน Windows จึงให้ PowerShell เล่นไฟล์เอง
  if (paths.length > 0 && paths.every(p => p.startsWith(WIN_DIR)) && (await playOnWindows($, paths))) return
  for (let i = 0; i < list.length; i++) {
    const started = await $.clock.now()
    try {
      await $.audio.play(list[i]!)
    } catch {
      return // เครื่องนี้เล่นเสียงไม่ได้: เงียบ
    }
    // เครื่องเล่นบางที่ตอบกลับทันทีไม่รอจบ: รอให้ครบความยาวก่อนเล่นชิ้นถัดไป
    if (i < list.length - 1) {
      const left = ms[i]! - ((await $.clock.now()) - started)
      if (left > 50) await $.clock.sleep(left)
    }
  }
}

/** เล่นไฟล์ WAV ต่อกันด้วย PowerShell (มีในทุกเครื่อง Windows) · สำเร็จคืน true */
async function playOnWindows($: EngineInterface, paths: readonly string[]): Promise<boolean> {
  try {
    const r = await $.process.run(windowsPlayCommand(paths), { timeoutMs: 60_000 })
    return r.exitCode === 0
  } catch {
    return false // เรียก PowerShell ไม่ได้: ลองเครื่องเล่นของ Claude Code แทน
  }
}

/** เสียงตามค่าตั้ง · เสียงหลักไม่ซ้อนกัน (ถาม + ขออนุญาต พร้อมกันจะดังชุดเดียว) */
async function ring($: EngineInterface, part: Part): Promise<void> {
  try {
    if (!isOn(await loadSettings($), part)) return
    if (SEQUENCE[part].length > 1) {
      const now = await $.clock.now()
      if (now < mainBusyUntil) return
      const { ms } = await prepare($, part)
      mainBusyUntil = now + Math.max(1000, ms.reduce((a, b) => a + b, 0))
    }
    await playSequence($, part)
  } catch {
    // เสียงต้องไม่ทำให้งานของ Claude สะดุด
  }
}

async function test($: EngineInterface): Promise<void> {
  for (const part of ['done', 'fail', 'agent', 'context', 'quota'] as const) {
    await playSequence($, part).catch(quiet)
    await $.clock.sleep(700).catch(quiet)
  }
}

const isUserStop = (text: string | undefined): boolean =>
  /doesn't want to proceed|rejected|interrupted|user denied|ผู้ใช้ปฏิเสธ/i.test(text ?? '')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    failRang = false
    contextSeen = 0
    mainBusyUntil = 0
    await detectPlatform($)
    await loadSettings($)
    await $.command.register({
      name: 'notify',
      description: 'เสียงแจ้งเตือน: เปิด-ปิดทั้งหมด · /notify test ลองฟัง · /notify fail off ปิดทีละจังหวะ',
      argumentHint: '[test | status | on | off | <จังหวะ> on|off]',
      immediate: true,
    }).catch(quiet)
    // เตรียมเสียงหลักไว้ก่อน จะได้ดังทันทีตอนต้องใช้
    void prepare($, 'done')
    return started
  })

  on('command.run', { command: 'notify' }, async ($, e) => {
    const cmd = parseCommand(e.args)
    const now = await loadSettings($)
    if (cmd.kind === 'test') {
      void test($)
      const order = ['done', 'fail', 'agent', 'context', 'quota'] as const
      return {
        text: [
          '🔊 กำลังเล่นทุกเสียงตามลำดับ (ราว 15 วินาที):',
          ...order.map((p, i) => `  ${i + 1}. ${SOUND_NAME[p]} — ${LABEL[p]}${p === 'done' ? ' / ถามคำถาม / ขออนุญาต' : ''}`),
          now.enabled ? '' : '⚠️ ตอนนี้เสียงปิดอยู่ (ทดสอบดังได้) · พิมพ์ /notify เพื่อเปิดใช้งานจริง',
        ].filter(Boolean).join('\n'),
      }
    }
    if (cmd.kind === 'status') return { text: statusText(now) }
    if (cmd.kind === 'help') return { text: HELP }
    if (cmd.kind === 'unknown') return { text: `ไม่รู้จัก "${cmd.word}"\n${HELP}` }
    const s = apply(now, cmd)
    await saveSettings($, s)
    if (cmd.kind === 'part') {
      const isPartOn = s.parts[cmd.part]
      return { text: `${isPartOn ? '✅ เปิด' : '⬜ ปิด'}เสียง: ${LABEL[cmd.part]}${isPartOn && !now.enabled ? '\n(เปิดสวิตช์ใหญ่ให้แล้วด้วย)' : ''}` }
    }
    return {
      text: s.enabled
        ? '🔔 เปิดเสียงแจ้งเตือนแล้ว · /notify status ดูรายละเอียด'
        : '🔕 ปิดเสียงแจ้งเตือนทั้งหมดแล้ว · พิมพ์ /notify อีกครั้งเพื่อเปิด',
    }
  })

  // รอบใหม่ของการคุย (ไม่ใช่ Agent ย่อย): เสียงล้มเหลวกลับมาดังได้อีก 1 ครั้ง
  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) failRang = false
    return next(e)
  })

  // (ข) Claude ถามคำถาม: ดังก่อนกล่องคำถามขึ้น (next รอจนคุณตอบ)
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e, next) => {
    void ring($, 'ask')
    return next(e)
  })

  // คำสั่งล้มเหลว: ตุ๊บครั้งแรกของรอบ · คุณกดปฏิเสธ/หยุดเอง ไม่นับ
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.isError === true && !failRang && !isUserStop(ran.text)) {
      failRang = true
      void ring($, 'fail')
    }
    return ran
  })

  // (ค) ขออนุญาต
  on('classic.PermissionRequest', ($, e, next) => {
    void ring($, 'perm')
    return next(e)
  })

  // (ก) ตอบจบจริง: ไม่มีงานเบื้องหลัง ไม่มีงานตั้งเวลา และไม่มี hook อื่นสั่งให้ทำต่อ
  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    const isBlocked = (result as { decision?: unknown } | undefined)?.decision === 'block'
    const isWaiting = (e.background_tasks?.length ?? 0) > 0 || (e.session_crons?.length ?? 0) > 0
    if (!isBlocked && !isWaiting) void ring($, 'done')
    return result
  })

  // Agent ย่อยเสร็จ
  on('classic.SubagentStop', async ($, e, next) => {
    const result = await next(e)
    void ring($, 'agent')
    return result
  })

  // Context ใกล้เต็ม และโควตาใกล้หมด
  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    try {
      if (e.changed.includes('context') && e.context.percent !== undefined) {
        const r = crossed(CONTEXT_STEPS, contextSeen, e.context.percent)
        contextSeen = r.seen
        if (r.step !== undefined && isOn(await loadSettings($), 'context')) {
          void ring($, 'context')
          $.ui.toast(`⚠️ Context ใช้ไปแล้ว ${Math.round(e.context.percent)}% — ใกล้เต็ม ลองพิมพ์ /compact หรือเริ่มแชทใหม่`)
        }
      }
      if (e.changed.includes('rateLimits') && e.rateLimits.length > 0) {
        let seen: QuotaSeen = {}
        try {
          const raw = await $.store.get('quotaSeen')
          if (raw && typeof raw === 'object') seen = raw as QuotaSeen
        } catch {
          // ไม่มีค่าเดิม
        }
        const { alerts, seen: next2 } = quotaAlerts(seen, e.rateLimits)
        await $.store.set('quotaSeen', next2).catch(quiet)
        if (alerts.length > 0 && isOn(await loadSettings($), 'quota')) {
          void ring($, 'quota')
          const a = alerts[alerts.length - 1]!
          $.ui.toast(`⚠️ โควตา ${QUOTA_KINDS[a.kind] ?? a.kind} ใช้ไปแล้ว ${Math.round(a.percent)}% (เกิน ${a.step}%)`)
        }
      }
    } catch {
      // การเตือนต้องไม่ทำให้ session สะดุด
    }
    return measured
  })
}

