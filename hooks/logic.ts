// copvang-notify — การตัดสินใจล้วนๆ: ค่าตั้ง, คำสั่ง /notify, เกณฑ์เตือน, ไฟล์เสียงที่ใช้

/** จังหวะที่มีเสียง */
export const PARTS = ['done', 'ask', 'perm', 'fail', 'agent', 'context', 'quota'] as const
export type Part = (typeof PARTS)[number]

export const LABEL: Record<Part, string> = {
  done: 'Claude ตอบจบ (ไม่มีงานเบื้องหลังค้าง)',
  ask: 'Claude ถามคำถามรอคุณตอบ',
  perm: 'Claude ขออนุญาต',
  fail: 'คำสั่งล้มเหลว (ดังครั้งแรกของแต่ละรอบ)',
  agent: 'Agent ย่อยเสร็จ',
  context: 'Context ใกล้เต็ม (70% และ 90%)',
  quota: 'โควตา 5 ชม. / 7 วัน ใกล้หมด (80% และ 95%)',
}

/** ชื่อเสียงที่ผู้ใช้ได้ยินในแต่ละจังหวะ */
export const SOUND_NAME: Record<Part, string> = {
  done: 'Glass ×4 + Hero',
  ask: 'Glass ×4 + Hero',
  perm: 'Glass ×4 + Hero',
  fail: 'ตุ๊บ (Basso)',
  agent: 'ติ๊ง (Tink)',
  context: 'Funk',
  quota: 'Sosumi',
}

export type Settings = { enabled: boolean; parts: Record<Part, boolean> }

export const DEFAULTS: Settings = {
  enabled: true,
  parts: { done: true, ask: true, perm: true, fail: true, agent: false, context: true, quota: true },
}

/** อ่านค่าที่เก็บไว้ (อาจมาจากเวอร์ชันเก่าหรือเสีย) ให้เป็นค่าตั้งที่ใช้ได้เสมอ */
export function settingsOf(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { enabled?: unknown; parts?: unknown }
  const p = (r.parts && typeof r.parts === 'object' ? r.parts : {}) as Record<string, unknown>
  const parts = { ...DEFAULTS.parts }
  for (const k of PARTS) if (typeof p[k] === 'boolean') parts[k] = p[k] as boolean
  return { enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULTS.enabled, parts }
}

export const isOn = (s: Settings, part: Part): boolean => s.enabled && s.parts[part]

// ---------------------------------------------------------------------------
// คำสั่ง /notify

const ALIAS: Record<string, Part> = {
  done: 'done', stop: 'done', end: 'done', finish: 'done', จบ: 'done', ตอบจบ: 'done', เสร็จ: 'done',
  ask: 'ask', question: 'ask', ถาม: 'ask', คำถาม: 'ask',
  perm: 'perm', permission: 'perm', allow: 'perm', อนุญาต: 'perm', ขออนุญาต: 'perm',
  fail: 'fail', error: 'fail', ล้มเหลว: 'fail', พัง: 'fail', ผิดพลาด: 'fail',
  agent: 'agent', subagent: 'agent', เอเจนต์: 'agent', เอเจ้นท์: 'agent',
  context: 'context', ctx: 'context', บริบท: 'context', คอนเท็กซ์: 'context',
  quota: 'quota', limit: 'quota', usage: 'quota', โควตา: 'quota', โควต้า: 'quota',
}
const ON = new Set(['on', 'เปิด', '1', 'true', 'yes'])
const OFF = new Set(['off', 'ปิด', '0', 'false', 'no'])

export type Command =
  | { kind: 'toggle' }
  | { kind: 'all'; value: boolean }
  | { kind: 'test' }
  | { kind: 'status' }
  | { kind: 'help' }
  | { kind: 'part'; part: Part; value?: boolean }
  | { kind: 'unknown'; word: string }

export function parseCommand(args: string): Command {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const [a, b] = words
  if (a === undefined) return { kind: 'toggle' }
  if (ON.has(a)) return { kind: 'all', value: true }
  if (OFF.has(a)) return { kind: 'all', value: false }
  if (a === 'test' || a === 'ทดสอบ' || a === 'ลอง' || a === 'ฟัง') return { kind: 'test' }
  if (a === 'status' || a === 'สถานะ' || a === 'list') return { kind: 'status' }
  if (a === 'help' || a === 'ช่วย' || a === 'วิธีใช้' || a === '?') return { kind: 'help' }
  const part = ALIAS[a]
  if (!part) return { kind: 'unknown', word: a }
  if (b !== undefined && ON.has(b)) return { kind: 'part', part, value: true }
  if (b !== undefined && OFF.has(b)) return { kind: 'part', part, value: false }
  return { kind: 'part', part }
}

/** ใช้คำสั่งกับค่าตั้ง ได้ค่าตั้งใหม่ (ไม่แก้ของเดิม) */
export function apply(s: Settings, c: Command): Settings {
  if (c.kind === 'toggle') return { ...s, enabled: !s.enabled }
  if (c.kind === 'all') return { ...s, enabled: c.value }
  if (c.kind === 'part') {
    const value = c.value ?? !s.parts[c.part]
    // เปิดจังหวะใดจังหวะหนึ่ง = ตั้งใจอยากได้ยิน จึงเปิดสวิตช์ใหญ่ให้ด้วย
    return { enabled: value ? true : s.enabled, parts: { ...s.parts, [c.part]: value } }
  }
  return s
}

export function statusText(s: Settings): string {
  const head = s.enabled ? '🔔 เสียงแจ้งเตือน: เปิด' : '🔕 เสียงแจ้งเตือน: ปิดทั้งหมด (พิมพ์ /notify เพื่อเปิด)'
  const rows = PARTS.map(p => `  ${s.parts[p] ? '✅' : '⬜'} ${p.padEnd(7)} ${LABEL[p]} — ${SOUND_NAME[p]}`)
  return [head, ...rows].join('\n')
}

export const HELP = [
  '🔔 copvang-notify — วิธีใช้',
  '  /notify              เปิด-ปิดเสียงทั้งหมด',
  '  /notify test         ลองฟังทุกเสียง',
  '  /notify status       ดูว่าจังหวะไหนเปิดอยู่',
  '  /notify <จังหวะ> on|off   เปิด-ปิดทีละจังหวะ เช่น /notify fail off · /notify agent on',
  `  จังหวะ: ${PARTS.join(' · ')}`,
].join('\n')

// ---------------------------------------------------------------------------
// เกณฑ์เตือน context และโควตา

export const CONTEXT_STEPS = [70, 90] as const
export const QUOTA_STEPS = [80, 95] as const
export const QUOTA_KINDS: Record<string, string> = { five_hour: '5 ชม.', seven_day: '7 วัน' }

/**
 * เกณฑ์สูงสุดที่เพิ่งข้าม (ยังไม่เคยเตือน) หรือ undefined
 * `seen` = เกณฑ์สูงสุดที่เตือนไปแล้ว · ตกต่ำกว่าเกณฑ์แรก (เช่นหลัง /compact) = เริ่มนับใหม่
 */
export function crossed(steps: readonly number[], seen: number, percent: number): { step?: number; seen: number } {
  if (percent < steps[0]!) return { seen: 0 }
  const top = steps.filter(t => percent >= t).pop() ?? 0
  return top > seen ? { step: top, seen: top } : { seen }
}

export type QuotaSeen = Record<string, { resetsAt?: string; seen: number }>

/** โควตาแต่ละหน้าต่าง: เตือน 1 ทีต่อเกณฑ์ต่อรอบโควตา (รอบใหม่ = resetsAt เปลี่ยน) */
export function quotaAlerts(
  seen: QuotaSeen,
  limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
): { alerts: { kind: string; step: number; percent: number }[]; seen: QuotaSeen } {
  const next: QuotaSeen = { ...seen }
  const alerts: { kind: string; step: number; percent: number }[] = []
  for (const l of limits) {
    if (!(l.kind in QUOTA_KINDS)) continue
    const had = next[l.kind]
    const sameRound = had !== undefined && (had.resetsAt === undefined || l.resetsAt === undefined || had.resetsAt === l.resetsAt)
    const r = crossed(QUOTA_STEPS, sameRound ? had.seen : 0, l.percentUsed)
    if (r.step !== undefined) alerts.push({ kind: l.kind, step: r.step, percent: l.percentUsed })
    next[l.kind] = { resetsAt: l.resetsAt ?? had?.resetsAt, seen: r.seen }
  }
  return { alerts, seen: next }
}

// ---------------------------------------------------------------------------
// ไฟล์เสียงมาตรฐานในเครื่อง (ไม่แจกไปกับ Mod)

export const MAC_DIR = '/System/Library/Sounds/'
export const WIN_DIR = 'C:\\Windows\\Media\\'

export type Tone = 'glass' | 'hero' | 'basso' | 'tink' | 'funk' | 'sosumi'

/** ไฟล์ของแต่ละเสียง: Mac 1 ไฟล์ · Windows ไล่หาไฟล์แรกที่มี */
export const TONES: Record<Tone, { mac: string; win: readonly string[] }> = {
  glass: { mac: 'Glass.aiff', win: ['Windows Notify System Generic.wav', 'chimes.wav', 'notify.wav'] },
  hero: { mac: 'Hero.aiff', win: ['tada.wav', 'Windows Logon.wav'] },
  basso: { mac: 'Basso.aiff', win: ['Windows Background.wav', 'chord.wav', 'Windows Critical Stop.wav'] },
  tink: { mac: 'Tink.aiff', win: ['Windows Ding.wav', 'ding.wav'] },
  funk: { mac: 'Funk.aiff', win: ['Windows Exclamation.wav', 'Windows Notify Calendar.wav'] },
  sosumi: { mac: 'Sosumi.aiff', win: ['Windows Battery Low.wav', 'Windows Exclamation.wav'] },
}

/**
 * คำสั่ง PowerShell ที่เล่นไฟล์ WAV ต่อกันจนจบ (System.Media.SoundPlayer มีในทุก Windows)
 * ชื่อไฟล์อยู่ในเครื่องหมาย ' จึงต้องเปลี่ยน ' ในชื่อเป็น ''
 */
export function windowsPlayCommand(paths: readonly string[]): string[] {
  const list = paths.map(p => `'${p.replace(/'/g, "''")}'`).join(',')
  const script = `$ErrorActionPreference='Stop'; foreach ($f in @(${list})) { (New-Object System.Media.SoundPlayer $f).PlaySync() }`
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]
}

/** ลำดับเสียงของแต่ละจังหวะ */
export const SEQUENCE: Record<Part, readonly Tone[]> = {
  done: ['glass', 'glass', 'glass', 'glass', 'hero'],
  ask: ['glass', 'glass', 'glass', 'glass', 'hero'],
  perm: ['glass', 'glass', 'glass', 'glass', 'hero'],
  fail: ['basso'],
  agent: ['tink'],
  context: ['funk'],
  quota: ['sosumi'],
}
