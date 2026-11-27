# แผนตรวจสอบและปรับปรุงระบบเว็บแอป Vehicle App โดยละเอียด (v2.0 Improvement Plan)

> **โปรเจกต์เป้าหมาย:** `f:\STB System\Vehicle App` (`https://vehicle-stb.pages.dev`, commit `a1d7f21`)  
> **ฐานข้อมูล:** Supabase `Portal SSO-STB` (`aburwjfaeutgbzfdvefe`) · Schema `vehicleapp` (Zero DDL on `public`)  
> **อ้างอิงต้นแบบ:** `Ex Project` (GAS 17 ไฟล์) และ `Portal SSO-VR`  
> **Interactive HTML Plan:** `docs/pipeline/PIPE-20261127-vehicle-app-improvement-plan/interactive_plan.html`

---

## 0. สรุปผลการตรวจสอบเชิงลึก (Live Production + Codebase Audit)

1. **สาเหตุจริงที่หน้าเพิ่มยานพาหนะแสดง `"ทั้งหมด 0 คน"` ในฐานข้อมูลตอนนี้:**
   - จากการ query `public.v_personnel_directory` บน Supabase จริง พบว่าทั้งระบบตอนนี้มีข้อมูลบุคลากรเพียง **1 คน** (สังกัด `ฝ่ายบริหารงานทั่วไป`) และมี **`0 คน`** ใน `ส่วนตรวจและบังคับการ 1` — แต่ UI ปัจจุบันไม่แจ้งบริบทว่าฐานข้อมูลยังไม่มีบุคลากรในส่วนราชการนี้
2. **สาเหตุเชิงระบบที่จะพังเมื่อนำเข้าบุคลากรจริง (> 500 คน / Multi-Role):**
   - `GET /portal-api/personnel` ติด Hard `.limit(500)` ไม่มี server-side filter (`office_id`/`department_id`)
   - `GET /portal-api/personnel` ไม่รู้จักสิทธิ์ `APP_ADMIN` / `FLEET_ADMIN` ที่มี Portal Role เป็น `USER` และกลืน error เป็น `[]`
   - `VehicleFormModal` ไม่ดัก `isError` จาก query บุคลากร จึงกลืน error เป็น `0 คน`

---

## 1. หน้าตั้งค่าระบบ (`/settings`)

1. **แยกหน้าตั้งค่าเป็น 5 แท็บมาตรฐาน Portal SSO:**
   - `1. ตั้งค่าทั่วไป & แจ้งเตือน` (`general` + `report` + thresholds/limits)
   - `2. Google Drive Bridge` — ช่อง **`ลิงก์ Google Apps Script Web App (ลงท้ายด้วย /exec)`** + Regex validation `/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i` + ปุ่มทดสอบการเชื่อมต่อและทดสอบโฟลเดอร์ + Pre-Save Verification Guard + รองรับ Protocol v2.7.0 เดียวกับ Portal SSO `DriveStorageBridge.gs`
   - `3. ประเภทยานพาหนะ (Dropdown)` — CRUD + Batch Add + ปุ่มสลับลำดับ `▲/▼` (`sort_order`) + `is_default` + `is_active` + `default_caretaker_position` เหมือน `SettingsLookupsTab` ใน Portal SSO
   - `4. สุขภาพฐานข้อมูล & Cron` — `fn_schema_health`, ปุ่มรีเฟรชสถานะทั้งระบบ, สถานะ `pg_cron` รายวัน
   - `5. บันทึกการใช้งาน (Audit Logs)`
2. **Zero-Hardcode (`useAppSettings()`):** เชื่อม `warning_days_before`, `app_display_name`, `report_header_org`, `report_header_sub`, `default_theme`, `default_province`, `dashboard_tracking_limit`, `dashboard_recent_limit`, `activities_page_size`, `notification_max_items`, `notify_maintenance_status` ทุกจุด และสั่งรีเฟรชสถานะอัตโนมัติหลังแก้ `warning_days_before`
3. **RBAC 4 ระดับ:**
   - `SuperAdmin` (`SUPERADMIN` / `APP_ADMIN ≥ 90`): จัดการทุกสังกัด + `/settings` + `RESTORE_NORMAL` + `audit_logs`
   - `Admin Lv2 (สำนักงาน/กอง)` และ `Admin Lv3 (ส่วน/ฝ่าย)`: ล็อก dropdown ขอบเขตสังกัด + `<ScopeBadge />` + ดึง `admin_scope` ทันทีหลัง `verifyOtp()` + ล็อก `vapp_read_audit_logs` & `fn_refresh_vehicle_statuses` เฉพาะ SuperAdmin
   - `User` (`USER` / `DEPT_OFFICER` — ข้อ 4.1): บล็อกการเข้าใช้งานแอปในระยะนี้พร้อมหน้าแจ้งเตือนชัดเจน + จำกัด `DECOMMISSION`/`DISPOSE` ใน DB เฉพาะ Admin+

---

## 2. หน้าเพิ่มยานพาหนะใหม่ & สถานะยานพาหนะ 8 สถานะ

1. **PDPA-Safe RPC `vehicleapp.fn_list_caretaker_candidates(p_office_id, p_department_id)`:**
   - Admin-only (`fn_is_vehicle_admin()`), กรอง `allows_account_provision = true` และบังคับขอบเขตผ่าน `fn_can_access_vehicle`, ไร้ปัญหา 500-row cap
2. **รูปแบบผู้ดูแล `[คำนำหน้า+ชื่อ+นามสกุล, ตำแหน่ง+ระดับ]` & กติกาตัวกรองระดับ `ส่วน/ฝ่าย (Lv3)`:**
   - สร้าง `caretakerFormatter.ts` ใช้ทุกหน้า, ปิด Checkbox ผู้ดูแลจนกว่าจะเลือก `ฝ่าย/ส่วน (Lv3)`, โหมดปกติกรอง `default_caretaker_position` (`พนักงานขับรถยนต์` / `นายท้ายเรือ`), โหมดปลดล็อกแสดงบุคลากรทุกตำแหน่งในส่วน/ฝ่าย (Lv3) นั้น
   - แก้ลำดับอัปโหลดใบอนุญาตเรือให้ `createVehicle` ออก `vehicle_code` (`VHxxxx`) ก่อนอัปโหลดไฟล์
3. **สถานะยานพาหนะ 8 สถานะ:**
   - ปรับช่องสถานะใน `VehicleFormModal` เป็น **4 สถานะการปฏิบัติงานตั้งต้น** (`ใช้งานปกติ`, `อยู่ระหว่างซ่อมบำรุง`, `ยุบสภาพรอจำหน่าย`, `จำหน่าย`) + **Live Preview Badge** แสดงสถานะจริงที่คำนวณได้ (`NORMAL`/`WARNING`/`EXPIRED`/`MAINTENANCE*`)
   - แก้ `previous_status` ใน `fn_record_vehicle_activity` ให้คำนวณสด + ติดตั้ง `pg_cron` รายวัน `00:00 น. เวลาไทย` (`0 17 * * *` UTC)

---

## 3. การเทียบและยกระดับจาก `Ex Project`

- เพิ่ม `pg_cron` รายวัน, Dashboard คิวติดตามแยก 5 กลุ่มพร้อม `[ตำแหน่ง+ระดับ]`, Notification Bell รองรับ `MAINTENANCE` + ปุ่มอ่านรายแถว, Settings Pre-Save Guard, Read-only Profile Modal + `<ScopeBadge />`, Dynamic Branding & `default_theme`, Report/Table sort ตาม `vehicle_types.sort_order`, และแก้ลำดับสร้างโฟลเดอร์เรือด้วย `VHxxxx`
