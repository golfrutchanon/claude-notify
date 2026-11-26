# CHANGELOG — copvang-notify

## 0.1.0 — 2026-11-26
- เริ่มต้น Mod จาก hook เสียงส่วนตัวของก๊อปวาง (afplay ใน settings.json) ทำเป็น Mod ให้ลูกค้าติดตั้งคลิกเดียว (ใหม่ 2026-11-26 · cv-notify · สร้าง Mod)
- เสียงหลัก Glass ×4 + Hero ×1 เมื่อ: ตอบจบและไม่มีงานเบื้องหลัง/งานตั้งเวลาค้าง (`classic.Stop`) · ถามคำถาม (`AskUserQuestion`) · ขออนุญาต (`classic.PermissionRequest`) · ดังพร้อมกันไม่ซ้อน
- เสียงสั้น: คำสั่งล้มเหลว Basso (ครั้งแรกของรอบ) · Agent ย่อยเสร็จ Tink (ค่าเริ่มต้นปิด) · Context 70%/90% Funk · โควตา 5 ชม./7 วัน 80%/95% Sosumi (ครั้งละ 1 ทีต่อรอบโควตา) พร้อมข้อความเตือน
- เล่นผ่าน `$.audio.play` จากไฟล์เสียงในเครื่อง (Mac `/System/Library/Sounds` · Windows `C:\Windows\Media`) ไม่ใช้ afplay จึงใช้ได้ในแอป Claude Desktop · ไม่มีไฟล์ = เงียบ
- คำสั่ง `/notify` · `/notify test` · `/notify status` · `/notify <จังหวะ> on|off` รับคำไทยด้วย · ค่าตั้งจำข้ามแชท
- README ภาษาไทย · เทสต์ 8 ข้อ (`claude plugin test .`)
