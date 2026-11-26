# MEMORY — ความจำการทำงาน (agent จดเองระหว่างทำงาน)
> แชทใหม่อ่านไฟล์นี้ก่อน แล้วทำต่อจาก "ขั้นต่อไป" ได้ทันที

# สถานะปัจจุบัน
**อัปเดตล่าสุด** 2026-11-26
### กำลังทำ / ขั้นต่อไป
- v0.1.0 เสร็จ เทสต์ผ่าน 8/8 · ติดตั้งบนเครื่องจาก GitHub `golfrutchanon/claude-notify` (public) · รอเจ้าของลอง `/reload-plugins` แล้ว `/notify test` ในแอป Desktop
### branch
- `main` = เวอร์ชันที่ลูกค้าติดตั้ง · `dev` = ที่ทำงาน
### ค้างอยู่ (รอผู้ใช้)
- ยังไม่ได้ฟังจริงในแอป Desktop และยังไม่ได้ทดสอบบน Windows

# ล็อกตามเวลา
## 2026-11-26
- เจ้าของสั่งทำ Mod copvang-notify จาก hook เสียงส่วนตัว (Glass ×4 + Hero) ตามสเปกที่อนุมัติ → สร้าง hooks/register.ts, logic.ts, sound.ts · เสร็จ
- ตัดสินใจอ่านไฟล์เสียงระบบแล้วเล่นผ่าน `$.audio.play` base64 แทน afplay (เหตุผลใน DISCUSSION) · เสร็จ
- validate ผ่าน · tsc ผ่าน · `claude plugin test .` 8/8 · ทดสอบถอดไฟล์จริง Glass×4+Hero ได้ WAV 7.66 วินาที · เสร็จ
- เจ้าของสั่ง: สร้าง git + repo GitHub public ชื่อ cv-notify · เปลี่ยนชื่อโฟลเดอร์เป็น cv-notify · เสร็จ
- ติดตั้งจาก GitHub (`claude plugin marketplace add golfrutchanon/cv-notify` + `install copvang-notify@cv-notify`) · `claude -p "/notify status"` ตอบภาษาไทยถูก · ตอบจบจริงแล้วเครื่องยนต์เล่น clip.wav ด้วย afplay ราว 8 วินาที (ตรวจด้วย ps) · เสร็จ
- เปลี่ยนชื่อโฟลเดอร์ dev-copvang-notify → cv-notify · เสร็จ
- เจ้าของสั่งปิดเสียงเดิม + เปิดทุกเสียง → ตรวจแล้ว hook afplay เดิมไม่มีใน settings.json แล้ว · สั่ง `/notify on` + `/notify agent on` บนเครื่องเจ้าของ ตอนนี้เปิดครบ 7 จังหวะ · เสร็จ
- เริ่มทำเสียง Windows (PowerShell) แล้วเจ้าของสั่งพัก "เอา Mac ก่อน" → เก็บโค้ดไว้ที่กิ่ง `feat/windows-sound` (ยังไม่เทสต์ ยังไม่ push) · dev/main ยังเป็น v0.1.0 · ค้าง
- เจ้าของสั่งเปลี่ยนชื่อ repo เป็น claude-notify (ตัวเล็กหมด) + ร้านใน marketplace.json + โฟลเดอร์ ให้เหมือนกัน · ติดตั้งใหม่เป็น copvang-notify@claude-notify · เสร็จ
- เจ้าของขอเปลี่ยนเสียง Agent ย่อยจาก Tink (เหมือนคลิกเมาส์ Mac) → เปลี่ยนเป็น Ping (เสียงเชิงสำเร็จ ตามที่เจ้าของขอ) · ยังไม่ commit/push รอเจ้าของสั่ง · เสร็จ
- เปลี่ยนเสียง agent เป็น Ping (เชิงสำเร็จ) · ตอบเรื่อง /notify: ไม่ชน ใช้ต่อ · เจ้าของตอบ "ยังไม่ push" → ค้าง: การเปลี่ยนชื่อ claude-notify + เสียง Ping ยังไม่ commit/push/ติดตั้งใหม่
- เจ้าของขอเปลี่ยนเสียง Context (Funk ได้ยินบ่อยใน Mac) → Submarine · ถามเรื่องตัดโควตาออก รอคำตอบ · ยังไม่ push
- เจ้าของสั่งตัดเสียง Agent ย่อย / Context / โควตา ออกทั้งหมด เหลือ done·ask·perm·fail → v0.2.0 เทสต์ 7/7 · ยังไม่ commit/push (รอสั่ง) · เสร็จ
- เจ้าของสั่งทำเสียง Windows ด้วยเลย (ลูกค้าใช้ Bypass) → merge กิ่ง feat/windows-sound เข้า dev, เทสต์ Windows เพิ่ม รวม 9/9, แก้กฎ CLAUDE.md ให้ Windows ใช้ PowerShell ได้ · ยังไม่ push · เสร็จ
- เจ้าของขอปิด Mod lot-map (Work Map ขึ้นตลอด) → คำสั่ง `claude plugin disable lot-map@lot-map` ถูกระบบความปลอดภัยบล็อก ให้เจ้าของปิดเอง · ค้าง
