# CHANGELOG — copvang-notify

## 0.2.0 — 2026-11-26
- ตัดเสียง Agent ย่อยเสร็จ, Context ใกล้เต็ม และโควตาใกล้หมด ออกทั้งหมด เหลือแค่ ตอบจบ · ถามคำถาม · ขออนุญาต (Glass ×4 + Hero) และคำสั่งล้มเหลว (Basso) · เจ้าของบอกเสียงพวกนั้นได้ยินบ่อยใน Mac จะสับสน และไม่จำเป็น (ใหม่ 2026-11-26 · claude-notify · ตัดเสียงที่ไม่ใช้)
- ค่าที่ตั้งไว้เดิมของ 3 จังหวะนั้นถูกข้ามไปเอง ไม่ error

## 0.1.0 — 2026-11-26
- เริ่มต้น Mod จาก hook เสียงส่วนตัวของก๊อปวาง (afplay ใน settings.json) ทำเป็น Mod ให้ลูกค้าติดตั้งคลิกเดียว (ใหม่ 2026-11-26 · cv-notify · สร้าง Mod)
- เสียงหลัก Glass ×4 + Hero ×1 เมื่อ: ตอบจบและไม่มีงานเบื้องหลัง/งานตั้งเวลาค้าง (`classic.Stop`) · ถามคำถาม (`AskUserQuestion`) · ขออนุญาต (`classic.PermissionRequest`) · ดังพร้อมกันไม่ซ้อน
- เสียงสั้น: คำสั่งล้มเหลว Basso (ครั้งแรกของรอบ) · Agent ย่อยเสร็จ Tink (ค่าเริ่มต้นปิด) · Context 70%/90% Funk (0.1.1 เปลี่ยนเป็น Submarine) · โควตา 5 ชม./7 วัน 80%/95% Sosumi (ครั้งละ 1 ทีต่อรอบโควตา) พร้อมข้อความเตือน
- เล่นผ่าน `$.audio.play` จากไฟล์เสียงในเครื่อง (Mac `/System/Library/Sounds` · Windows `C:\Windows\Media`) ไม่ใช้ afplay จึงใช้ได้ในแอป Claude Desktop · ไม่มีไฟล์ = เงียบ
- คำสั่ง `/notify` · `/notify test` · `/notify status` · `/notify <จังหวะ> on|off` รับคำไทยด้วย · ค่าตั้งจำข้ามแชท
- README ภาษาไทย · เทสต์ 8 ข้อ (`claude plugin test .`)

## 0.1.1 — 2026-11-26
- เปลี่ยนชื่อ repo และร้าน (marketplace) จาก `cv-notify` เป็น `claude-notify` · ติดตั้งใหม่ด้วย `/plugin marketplace add golfrutchanon/claude-notify` แล้ว `/plugin install copvang-notify@claude-notify` (ใหม่ 2026-11-26 · claude-notify · เปลี่ยนชื่อ repo)
- เปลี่ยนเสียง Agent ย่อยเสร็จจาก Tink เป็น Ping (ติ๊งสำเร็จ) เพราะ Tink เหมือนเสียงคลิกทั่วไปของ Mac จนสับสน (ใหม่ 2026-11-26 · claude-notify · เปลี่ยนเสียง agent)
- เปลี่ยนเสียง Context ใกล้เต็มจาก Funk เป็น Submarine (โซนาร์) เพราะ Funk ได้ยินบ่อยใน Mac (ใหม่ 2026-11-26 · claude-notify · เปลี่ยนเสียง context)
