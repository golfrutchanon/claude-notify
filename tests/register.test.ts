import { describe, expect, mock, test } from 'claude-code/testing'

import { DEFAULTS, apply, parseCommand, settingsOf, windowsPlayCommand } from '../hooks/logic.ts'
import { buildClips, fromBase64, parseAiff, parseWav, toBase64 } from '../hooks/sound.ts'

const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } }

/** AIFF จำลอง: 2 ช่อง 48 kHz 24 บิต big-endian เหมือนเสียงระบบของ Mac */
function fakeAiff(frames: number, fill = 0x12): Uint8Array {
  const data = frames * 2 * 3
  const commSize = 18, ssndSize = 8 + data
  const total = 4 + (8 + commSize) + (8 + ssndSize)
  const b = new Uint8Array(8 + total)
  const v = new DataView(b.buffer)
  const tag = (at: number, s: string) => { for (let i = 0; i < 4; i++) b[at + i] = s.charCodeAt(i) }
  tag(0, 'FORM'); v.setUint32(4, total); tag(8, 'AIFF')
  tag(12, 'COMM'); v.setUint32(16, commSize)
  v.setUint16(20, 2); v.setUint32(22, frames); v.setUint16(26, 24)
  // 48000 เป็นเลข 80 บิต: exponent 16383+15, mantissa 48000 << 48
  v.setUint16(28, 16383 + 15); v.setUint32(30, 48000 << 16 >>> 0); v.setUint32(34, 0)
  tag(38, 'SSND'); v.setUint32(42, ssndSize); v.setUint32(46, 0); v.setUint32(50, 0)
  for (let i = 0; i < data; i += 3) { b[54 + i] = fill; b[55 + i] = 0x34; b[56 + i] = 0x56 }
  return b
}

describe('sound', () => {
  test('AIFF 24 บิตกลับเป็น little-endian แล้วต่อเป็น WAV ก้อนเดียว', async () => {
    const pcm = parseAiff(fakeAiff(480))!
    expect(pcm).toEqual({ channels: 2, rate: 48000, bits: 24, data: pcm.data })
    expect(pcm.data.length).toBe(480 * 6)
    expect([pcm.data[0], pcm.data[1], pcm.data[2]]).toEqual([0x56, 0x34, 0x12])

    const files = [1, 2, 3, 4].map(() => ({ name: 'Glass.aiff', bytes: fakeAiff(480) }))
    files.push({ name: 'Hero.aiff', bytes: fakeAiff(960) })
    const { clips, ms } = buildClips(files)
    expect(clips).toHaveLength(1)
    expect(clips[0]!.mime).toBe('audio/wav')
    expect(ms[0]).toBe(60) // 4×10 ms + 20 ms
    const wav = parseWav(fromBase64(clips[0]!.base64))!
    expect(wav.data.length).toBe((4 * 480 + 960) * 6)
  })

  test('base64 ไป-กลับได้ทุกความยาว', async () => {
    for (const n of [0, 1, 2, 3, 4, 5, 1000, 12289]) {
      const b = new Uint8Array(n).map((_, i) => (i * 37) & 0xff)
      expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b))
    }
    expect(toBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu')
  })

  test('ไฟล์ที่ถอดไม่ได้ ส่งทีละไฟล์ตามเดิม', async () => {
    const { clips } = buildClips([{ name: 'x.wav', bytes: new Uint8Array([1, 2, 3]) }])
    expect(clips).toEqual([{ base64: 'AQID', mime: 'audio/wav' }])
    expect(buildClips([]).clips).toEqual([])
  })
})

describe('logic', () => {
  test('คำสั่ง /notify ภาษาไทยและอังกฤษ', async () => {
    expect(parseCommand('')).toEqual({ kind: 'toggle' })
    expect(parseCommand('test')).toEqual({ kind: 'test' })
    expect(parseCommand('fail off')).toEqual({ kind: 'part', part: 'fail', value: false })
    expect(parseCommand('done on')).toEqual({ kind: 'part', part: 'done', value: true })
    expect(parseCommand('ถาม ปิด')).toEqual({ kind: 'part', part: 'ask', value: false })
    expect(parseCommand('agent on').kind).toBe('unknown')
    expect(parseCommand('ปิด')).toEqual({ kind: 'all', value: false })
    expect(parseCommand('blah').kind).toBe('unknown')

    let s = apply(DEFAULTS, { kind: 'toggle' })
    expect(s.enabled).toBe(false)
    s = apply(s, { kind: 'part', part: 'fail', value: true })
    expect(s.enabled).toBe(true)
    expect(s.parts.fail).toBe(true)
    expect(settingsOf({ parts: { fail: false, bogus: 1 } }).parts).toEqual({ ...DEFAULTS.parts, fail: false })
    expect(settingsOf('junk')).toEqual(DEFAULTS)
  })
})

describe('register', () => {
  test('แต่ละจังหวะดังถูกเสียง ถูกเงื่อนไข และ /notify เปิด-ปิดได้', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on, {})
    const played: string[] = []
    const sizes: number[] = []
    const files: Record<string, number> = {
      '/System/Library/Sounds/Glass.aiff': 4800, // 100 ms
      '/System/Library/Sounds/Hero.aiff': 4800,
      '/System/Library/Sounds/Basso.aiff': 480,
    }
    on('fs.exists', ($, e) => ({ value: e.path in files }))
    on('fs.read', ($, e) => {
      const frames = files[e.path]
      if (frames === undefined) throw new Error('ENOENT')
      // แยกเสียงด้วยค่าที่ใส่ในไบต์แรก
      return { value: { base64: toBase64(fakeAiff(frames, frames === 480 ? Object.keys(files).indexOf(e.path) : 1)) } }
    })
    on('audio.play', ($, e) => {
      const bytes = fromBase64(e.clip.base64 ?? '')
      const wav = parseWav(bytes)
      sizes.push(wav ? wav.data.length / 6 : -1)
      played.push(wav ? `frames:${wav.data.length / 6}` : '?')
      return { value: undefined }
    })
    on('ui.toast', () => ({ value: undefined }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('tool.call', ($, e) => (e.tool === 'Bash' && e.command === 'false' ? { isError: true as const, result: 'exit 1', text: 'exit 1' } : { result: 'ok' }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('classic.Stop', () => ({}))

    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/w' })
    await clock.settle()

    // (ก) ตอบจบ ไม่มีงานค้าง → Glass×4 + Hero เป็นก้อนเดียว 5×4800 เฟรม
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [] })
    await clock.settle()
    expect(played).toEqual(['frames:24000'])

    // ตอบจบแต่มีงานตั้งเวลาค้าง → เงียบ
    await clock.advance(5000)
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [{ id: 'c', schedule: '* * * * *', recurring: true, prompt: 'x' }] })
    await clock.settle()
    expect(played).toHaveLength(1)

    // คำสั่งล้มเหลว 2 ครั้งในรอบเดียว → ตุ๊บครั้งเดียว · รอบใหม่ดังได้อีก
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await clock.settle()
    expect(played).toEqual(['frames:24000', 'frames:480'])
    await $.turn.start({ text: 'ต่อ', turnId: 't2' })
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await clock.settle()
    expect(played).toHaveLength(3)

    // Agent ย่อยเสร็จ ไม่มีเสียงแล้ว (ตัดออก 0.2.0)
    expect((await $.command.run({ command: 'notify', args: 'agent on', ...RUN })).text).toContain('ไม่รู้จัก')

    // /notify ปิดทั้งหมด → เงียบ
    const off = await $.command.run({ command: 'notify', args: '', ...RUN })
    expect(off.text).toContain('ปิด')
    await clock.advance(60_000)
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [] })
    await clock.settle()
    expect(played).toHaveLength(3)

    const status = await $.command.run({ command: 'notify', args: 'status', ...RUN })
    expect(status.text).toContain('ปิดทั้งหมด')

    // /notify test ดังแม้ปิดอยู่: เสียงหลัก + 4 เสียงสั้น
    const t = await $.command.run({ command: 'notify', args: 'test', ...RUN })
    expect(t.text).toContain('ลำดับ')
    await clock.advance(20_000)
    await clock.settle()
    expect(played).toHaveLength(5)
    expect(sizes.filter(n => n === -1)).toHaveLength(0)
  })

  test('ถามคำถามและขออนุญาตพร้อมกัน ดังชุดเดียว', async ($, on) => {
    const clock = mock.clock(on, { now: 5_000_000 })
    mock.store(on, {})
    let plays = 0
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({ value: { base64: toBase64(fakeAiff(4800)) } }))
    on('audio.play', () => { plays++; return { value: undefined } })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('tool.call', () => ({ result: { answers: {} } }))
    on('classic.PermissionRequest', () => ({}))

    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/w' })
    await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: {} })
    await clock.settle()
    expect(plays).toBe(1)
  })

  test('ไม่มีไฟล์เสียงในเครื่อง → เงียบ ไม่ error', async ($, on) => {
    const clock = mock.clock(on, { now: 1 })
    mock.store(on, {})
    let plays = 0
    on('fs.exists', () => ({ value: false }))
    on('audio.play', () => { plays++; return { value: undefined } })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('classic.Stop', () => ({}))

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w' })
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [] })
    const t = await $.command.run({ command: 'notify', args: 'test', ...RUN })
    expect(t.text).toContain('🔊')
    await clock.advance(20_000)
    await clock.settle()
    expect(plays).toBe(0)
  })

  test('Windows: ให้ PowerShell เล่นไฟล์ใน C:\\Windows\\Media ต่อกัน', async ($, on) => {
    const clock = mock.clock(on, { now: 1 })
    mock.store(on, {})
    const runs: (readonly string[])[] = []
    let plays = 0
    const exists = new Set(['C:\\Windows\\Media\\chimes.wav', 'C:\\Windows\\Media\\tada.wav', 'C:\\Windows\\Media\\chord.wav'])
    // เครื่องทดสอบเป็น Mac จึงต่อ C:\\ ท้ายโฟลเดอร์งาน · บน Windows จริงเป็น path เต็ม
    const isThere = (path: string) => [...exists].some(f => path.endsWith(f))
    on('fs.exists', ($, e) => ({ value: isThere(e.path) }))
    on('fs.read', () => ({ value: { base64: '' } }))
    on('process.run', ($, e) => { runs.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
    on('audio.play', () => { plays++; return { value: undefined } })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('classic.Stop', () => ({}))
    on('tool.call', () => ({ isError: true as const, result: 'exit 1', text: 'exit 1' }))

    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: 'C:\\w' })
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [] })
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await clock.settle()
    expect(plays).toBe(0)
    expect(runs).toHaveLength(2)
    expect(runs[0]![0]).toBe('powershell.exe')
    const script = runs[0]![runs[0]!.length - 1]!
    expect(script.split('chimes.wav').length - 1).toBe(4)
    expect(script).toContain('tada.wav')
    expect(runs[1]![runs[1]!.length - 1]).toContain('chord.wav')
  })

  test('คำสั่ง PowerShell กันเครื่องหมาย \' ในชื่อไฟล์', async () => {
    const argv = windowsPlayCommand(["C:\\it's.wav"])
    expect(argv[argv.length - 1]).toContain("'C:\\it''s.wav'")
  })
})
