// copvang-notify — เสียงแจ้งเตือนสไตล์ก๊อปวาง สำหรับ Claude Code (Terminal และแอป Claude Desktop)
//
// เสียงหลัก Glass ×4 แล้วปิดด้วย Hero ×1 ดังเมื่อ:
//   done  Claude ตอบจบจริง และไม่มีงานเบื้องหลัง/งานตั้งเวลาค้าง (classic.Stop)
//   ask   Claude ถามคำถามรอคุณตอบ (tool.call ของ AskUserQuestion)
//   perm  Claude ขออนุญาต (classic.PermissionRequest)
// เสียงสั้นดังครั้งเดียว:
//   fail     คำสั่งล้มเหลว → ตุ๊บ (Basso) ครั้งแรกของแต่ละรอบเท่านั้น
//
// ไม่ใช้ afplay / ไม่เรียกโปรแกรมภายนอก: อ่านไฟล์เสียงมาตรฐานในเครื่อง
// (Mac /System/Library/Sounds · Windows C:\Windows\Media) แล้วเล่นผ่าน $.audio.play
// จึงทำงานได้ทั้งใน Terminal และแอป Claude Desktop · หาไฟล์ไม่เจอ = เงียบ ไม่ error
import type { EngineInterface, Register } from 'claude-code'

import {
  DEFAULTS, HELP, LABEL, MAC_DIR, SEQUENCE, SOUND_NAME, TONES, WIN_DIR,
  apply, isOn, parseCommand, settingsOf, statusText,
} from './logic.ts'
import type { Part, Settings, Tone } from './logic.ts'
import { buildClips, fromBase64 } from './sound.ts'
import type { Clip } from './sound.ts'

// ความจำของ session นี้ (เริ่มใหม่ทุก session.start และหลัง reload)
let settings: Settings = DEFAULTS
let platform: 'mac' | 'win' | undefined
let mainBusyUntil = 0
let failRang = false
const tones = new Map<Tone, Promise<{ name: string; bytes: Uint8Array } | undefined>>()
const clips = new Map<string, Promise<{ clips: Clip[]; ms: number[] }>>()

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
      const order = platform === 'win' ? [...win, ...mac] : platform === 'mac' ? mac : [...mac, ...win]
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

function prepare($: EngineInterface, part: Part): Promise<{ clips: Clip[]; ms: number[] }> {
  const key = SEQUENCE[part].join('+')
  let ready = clips.get(key)
  if (!ready) {
    ready = (async () => {
      const files = (await Promise.all(SEQUENCE[part].map(t => loadTone($, t)))).filter(
        (f): f is { name: string; bytes: Uint8Array } => f !== undefined,
      )
      return buildClips(files)
    })().catch(() => ({ clips: [], ms: [] }))
    clips.set(key, ready)
  }
  return ready
}

/** เล่นเสียงของจังหวะนั้นจนจบ (ไม่โยน error) */
async function playSequence($: EngineInterface, part: Part): Promise<void> {
  const { clips: list, ms } = await prepare($, part)
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
  for (const part of ['done', 'fail'] as const) {
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
      const order = ['done', 'fail'] as const
      return {
        text: [
          '🔊 กำลังเล่นทุกเสียงตามลำดับ (ราว 10 วินาที):',
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
}
