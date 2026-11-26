# แผนวางระบบและสร้างเว็บแอป Vehicle App ใหม่โดยละเอียด (Architecture & Rebuild Plan)

> **ชื่อระบบ:** ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ (`Vehicle App` / `VEHICLE_APP`)  
> **Repository:** `https://github.com/STB6636/VahicleApp-VR`  
> **Database Schema:** `vehicleapp` (Multi-Schema บน Supabase โปรเจกต์เดียวกับ Portal SSO-VR)  
> **Frontend Stack:** Vite 6 + React 18 + TypeScript 5 (Strict) + Tailwind CSS v4 + BMA Enterprise Design System V2.5  
> **Access Policy:** **Portal-Only Entry** — ต้องเข้าใช้งานผ่าน Portal SSO-VR เท่านั้น ห้ามเข้าลิงก์โดยตรง

---

## 1. สรุปผลการวิเคราะห์โปรเจกต์ตัวอย่างเดิม (Ex Project — Google Apps Script Deep Analysis)

จากการโคลนไฟล์ต้นฉบับทั้ง 17 ไฟล์จาก Google Apps Script (`Auth.js`, `Code.js`, `Data.js`, `Domain.js`, `Migration.js`, `checkSettings.js`, `appsscript.json`, `Index.html`, `css.html`, `js-main.html`, `view-auth.html`, `view-app.html`, `view-dashboard.html`, `view-vehicles.html`, `view-renewals.html`, `view-reports.html`, `view-settings.html`) สามารถสรุปโครงสร้างธุรกิจ ฟังก์ชัน และจุดอ่อนที่ต้องปรับปรุงได้ดังนี้:

### 1.1 ขอบเขตธุรกิจและโครงสร้างข้อมูลเดิม (7 Google Sheets → 6 ตาราง 3NF ใน `vehicleapp`)

| ชีตเดิมใน GAS | คอลัมน์สำคัญเดิม | การออกแบบใหม่ใน `vehicleapp` (Supabase) | เหตุผลการปรับปรุง |
| :--- | :--- | :--- | :--- |
| `Users` (21 คอลัมน์) | `User_ID`, `Prefix`, `First_Name`, `Role`, `Department`, `Personnel_ID` | **ตัดออก — ใช้ `public.users` + `public.v_personnel_directory` จาก Portal SSO-VR โดยตรง** | ลดการซ้ำซ้อนข้อมูลบุคลากร ยึด Portal SSO เป็น Single Source of Truth (SSOT) |
| `Security_Tokens` (7 คอลัมน์) | `Token_String`, `Expiry_Date`, `Is_Used` | **ตัดออก — ใช้ Supabase Auth JWT + One-Time SSO Handshake ของ Portal SSO-VR** | ปลอดภัยกว่า ไม่ต้องมี Cron ล้าง Token ขยะทุกวันอาทิตย์ |
| `Departments` & `Reference_Data` | `Department_ID`, `Type`, `Value`, `Parent_Value` | **ใช้ `public.org_units` (4 ระดับ UUID) + `vehicleapp.vehicle_types`** | ป้องกันปัญหาชื่อฟิลด์เยื้องกัน (ใน GAS เดิม `Vehicles.Division` เก็บค่า `Department`/ฝ่าย-ส่วน) |
| `Vehicles` (22 คอลัมน์) | `Vehicle_ID` (`VHxxxx`), `Vehicle_Type`, `License_Plate`, `Province`, `Vessel_License_No`, `Vessel_Name`, `Current_Expiry_Date`, `Division`, `Personnel_ID`, `Status`, `Attachment_Folder_ID`, `Brand`, `Model`, `Model_Year`, `Engine_CC`, `Price`, `Acquisition_Date`, `Disposal_Date`, `Remarks` | **`vehicleapp.vehicles` + `vehicleapp.v_vehicles_enriched`** | เก็บครบทุกฟิลด์เดิม + แยก FK ชัดเจน (`office_id`, `department_id`, `division_id`, `caretaker_personnel_id`, `vehicle_type_id`) + แยก flag `is_under_maintenance` |
| `Activity_History` (11 คอลัมน์) | `Activity_ID` (`ACTxxxx`), `Vehicle_ID`, `Activity_Type`, `Document_No`, `Start_Date`, `Expiry_Date`, `Location`, `Details`, `File_URL`, `Recorded_By`, `Recorded_At` | **`vehicleapp.vehicle_activities`** | เก็บ `previous_status`, `new_status`, `recorded_by_user_id`, `updated_by_user_id` แยกชัดเจน ไม่ปนชื่อ+วันที่ในสตริงเดียว |
| `System_Settings` (3 คอลัมน์) | `App_Display_Name`, `Warning_Days_Before` (45), `Max_File_MB` (10), `Activity_Folder_ID`, `Vessel_License_Folder_ID`, `Report_Doc_Template_ID`, `Default_Theme` | **`vehicleapp.app_settings`** | จัดกลุ่ม `general` / `storage` / `report` และรองรับ `gas_drive_bridge_url` แบบ Portal SSO-VR |
| *(ใหม่ — เดิมอยู่ใน `localStorage`)* | `dismissedNotifications` | **`vehicleapp.notification_reads` + `vehicleapp.audit_logs`** | แจ้งเตือนซิงค์ข้ามอุปกรณ์ได้จริง + มี Audit Trail สมบูรณ์ |

### 1.2 กฎธุรกิจหลัก (Business Rules) ที่ต้องคงไว้ครบ 100%

1. **ระบบสถานะยานพาหนะ 8 สถานะ (8-Status State Machine):**
   - `NORMAL` (`ปกติ`): วันสิ้นอายุมากกว่า `warning_days_before` (ค่าเริ่มต้น 45 วัน) และไม่ได้ซ่อมบำรุง
   - `WARNING` (`กำลังจะขาดต่ออายุ`): คงเหลือ `0` ถึง `45` วัน
   - `EXPIRED` (`ขาดต่ออายุ`): วันสิ้นอายุน้อยกว่าวันนี้ (`diff < 0`, เขตเวลา `Asia/Bangkok`)
   - `MAINTENANCE` (`ซ่อมบำรุง`): อยู่ระหว่างส่งซ่อม และวันสิ้นอายุ > 45 วัน
   - `MAINTENANCE_WARNING` (`ซ่อมบำรุง กำลังจะขาดต่ออายุ`): อยู่ระหว่างส่งซ่อม + คงเหลือ `0..45` วัน
   - `MAINTENANCE_EXPIRED` (`ซ่อมบำรุง ขาดต่ออายุ`): อยู่ระหว่างส่งซ่อม + เลยวันหมดอายุแล้ว
   - `DECOMMISSIONED` (`ยุบสภาพรอจำหน่าย`): สถานะสิ้นสุด (Terminal) — หยุดแจ้งเตือนวันหมดอายุ
   - `DISPOSED` (`จำหน่าย`): สถานะสิ้นสุด (Terminal) — บังคับกรอก `disposal_date` และหยุดแจ้งเตือน
2. **ประเภทยานพาหนะและกฎเฉพาะรถ vs เรือ:**
   - **กลุ่มรถ (`รถยนต์`, `รถจักรยานยนต์`, `รถบรรทุก`):** บังคับ `license_plate`, เก็บ `province`, `brand`, `model`, `model_year`, `engine_cc`, `price`, `acquisition_date`, `disposal_date` (เมื่อสถานะเป็นจำหน่าย)
   - **กลุ่มเรือ (`เรือ`):** บังคับ `vessel_name`, เก็บ `vessel_license_no`, แนบไฟล์ใบอนุญาตเรือ (PDF/JPG/PNG ≤ `max_file_mb`)
   - **ระบบคัดกรองผู้ดูแลอัตโนมัติ (Smart Caretaker Filter):**
     - โหมดปกติ: กรองบุคลากรในฝ่าย/ส่วนเดียวกับรถ — หากเป็น **เรือ** แสดงตำแหน่ง `นายท้ายเรือ`, หากเป็น **รถ** แสดงตำแหน่ง `พนักงานขับรถยนต์`
     - โหมดปลดล็อก (Toggle "แสดงบุคลากรทั้งหมดในส่วนราชการ"): แสดงบุคลากรทุกคนในฝ่าย/ส่วนนั้น
3. **เวิร์กโฟลว์บันทึกกิจกรรม 5 ประเภท (รองรับเลือก 1 คัน หรือเลือกหลายคันพร้อมกันแบบ Batch):**
   - **ต่ออายุภาษี (`TAX_RENEWAL`):** กรองเฉพาะสถานะ `WARNING`, `EXPIRED`, `MAINTENANCE_WARNING`, `MAINTENANCE_EXPIRED`; บังคับวันสิ้นอายุใหม่; หากมี **เรือ** บังคับเลขที่ใบอนุญาตเรือ + แนบไฟล์หลักฐาน; คำนวณสถานะใหม่โดยคงสถานะซ่อมบำรุงถ้ายังซ่อมอยู่
   - **รายงานการซ่อมบำรุง — ส่งซ่อม (`MAINTENANCE_SEND`):** เปลี่ยนเป็น `MAINTENANCE` / `MAINTENANCE_WARNING` / `MAINTENANCE_EXPIRED` ตามวันหมดอายุ + บันทึกสถานที่/อู่ซ่อม
   - **รายงานการซ่อมบำรุง — รายงานผลการซ่อม (`MAINTENANCE_COMPLETE`):** ปลดสถานะซ่อมบำรุงและคำนวณวันหมดอายุใหม่เป็น `NORMAL` / `WARNING` / `EXPIRED`
   - **ยุบสภาพรอจำหน่าย (`DECOMMISSION`):** เปลี่ยนเป็น `DECOMMISSIONED`
   - **จำหน่าย (`DISPOSE`):** เปลี่ยนเป็น `DISPOSED` พร้อมบันทึกวันที่จำหน่าย
   - **แก้ไขสถานะกลับเป็นปกติ (`RESTORE_NORMAL`):** สงวนสิทธิ์เฉพาะ `SUPERADMIN` / `APP_ADMIN` เท่านั้น (ใช้คืนสถานะจาก `DECOMMISSIONED` / `DISPOSED`)
4. **ระบบรายงานรถและเรือราชการ:**
   - แยกกลุ่มรายงาน **รถราชการ** (จัดกลุ่ม `ส่วนราชการ → ประเภท → สถานะ`, คอลัมน์: ลำดับ, ทะเบียน, จังหวัด, ผู้ดูแล, สิ้นอายุภาษี) และ **เรือราชการ** (จัดกลุ่ม `ส่วนราชการ → สถานะ`, คอลัมน์: ลำดับ, ชื่อเรือ, ทะเบียนเรือ, ผู้ดูแล, สิ้นอายุภาษี)
   - รองรับการกรองตามประเภท (`all`/`car`/`vessel`), สถานะ, ส่วนราชการ
   - แทนที่ Google Doc Template เดิมด้วย **Client-side Print/PDF Template (A4 + ตรา กทม. + ฟอนต์ Sarabun + สรุปยอด 9 สถานะ)** พร้อมตัวเลือกส่งออก **Excel (.xlsx)** ที่เร็วกว่า 10–15 วินาทีของ GAS และไม่ติด Quota Google Docs!
5. **External API สำหรับแอปใบขอใช้รถในอนาคต (`Car Request App`):**
   - ใน GAS เดิมมี `apiGetVehicles()` และ `apiGetMaintenanceLogs(vehicleId)` สำหรับแอปขอใช้รถ
   - ในสถาปัตยกรรมใหม่ แอปขอใช้รถสามารถอ่านจาก `vehicleapp.v_vehicles_enriched` และ `vehicleapp.vehicle_activities` ผ่าน Supabase Multi-Schema โดยตรงแบบ Read-Only ได้ทันที!

### 1.3 จุดบกพร่องในโปรเจกต์เดิมที่ค้นพบและแก้ไขในเวอร์ชันใหม่

| # | จุดบกพร่องใน Ex Project (GAS) | แนวทางแก้ไขในเวอร์ชันใหม่ |
| :--- | :--- | :--- |
| 1 | `findTokenRow_` ใน `Auth.js` พ่น prefix ของ Token ผู้ใช้คนอื่นทุกคนลงใน Error Debug Message | ตัดตาราง Token ทิ้ง ใช้ Supabase Auth + Portal SSO One-Time Handshake |
| 2 | `AppState.invalidateCaches()` ใน `js-main.html` นับสถานะพลาด (ขาด `maintenance_warning`, `maintenance_expired`, `disposed` แยกจาก `decommissioned`) | ใช้ `computeVehicleStatus()` + TanStack Query Invalidation เป็น Single Source of Truth |
| 3 | `VehicleController.openForm()` ผูก `divInput.addEventListener('change', ...)` ซ้ำ 2 รอบ และเก็บชื่อฝ่าย/ส่วนลงคอลัมน์ `Division` | ใช้ React Hook Form + Zod + UUID Foreign Keys (`office_id`, `department_id`, `division_id`) |
| 4 | `createRenewal_` เขียนทีละแถวลง Google Sheets ไม่มี Transaction — หากล้มเหลวกลางทางข้อมูลไม่สอดคล้อง | ใช้ PostgreSQL Transactional RPC `vehicleapp.fn_record_vehicle_activity()` แบบ Atomic (All-or-Nothing) |
| 5 | `VehicleController` แสดงปุ่มแก้ไขให้ Admin ทุกฝ่ายเห็นและแก้ข้ามฝ่ายได้หากไม่เช็คสิทธิ์ฝั่งเซิร์ฟเวอร์ | บังคับ **Scoped RLS** ใน PostgreSQL ทั้ง `SELECT`, `INSERT`, `UPDATE`, `DELETE` ตามขอบเขตสังกัด |
| 6 | หน้า `view-auth.html` เก็บ Token ใน `localStorage` ทำให้เปิดลิงก์ตรงแล้วยังค้างเซสชันเก่าได้ | เก็บ Auth Session ใน **`sessionStorage`** + `PortalOnlyGuard` บล็อกการเข้าลิงก์ตรง 100% |

---

## 2. สถาปัตยกรรมความปลอดภัย: เข้าใช้งานผ่าน Portal SSO-VR เท่านั้น (Requirement 8)

```text
[ผู้ใช้] ──► ล็อกอินที่ Portal SSO-VR (/apps)
                │ กดเปิดการ์ด "ระบบยานพาหนะราชการ (VEHICLE_APP)"
                ▼
[Edge Function: portal-sso/generate]
  - ตรวจ user_app_permissions + webapp_roles + allows_account_provision
  - สร้าง One-Time sso_token (อายุ 5 นาที, เก็บ SHA-256 hash ใน security_tokens)
  - Redirect ไปยัง https://<vehicle-app>/sso-callback?sso_token=<one-time-token>
                │
                ▼
[Vehicle App: /sso-callback]
  1. เรียก PortalSsoClient.exchangeSsoToken(ssoToken) (Mode B: x-app-code=VEHICLE_APP)
  2. รับ { user, personnel, app_permission, otp_hash } (Token ถูก mark used_at ทันที)
  3. เรียก supabase.auth.verifyOtp({ token_hash: otp_hash, type: 'magiclink' })
     * บันทึก Session ใน window.sessionStorage เท่านั้น (ไม่ลง localStorage) *
  4. ตั้งค่า flag `vehicleapp_portal_sso_verified = '1'` ใน sessionStorage
  5. ลบ ?sso_token ออกจาก URL Bar ทันที (history.replaceState) → เข้า /dashboard

[กรณีเปิดลิงก์ตรง / บุ๊กมาร์ก / แท็บใหม่โดยไม่ผ่าน Portal SSO-VR]
  - sessionStorage ว่างเปล่า → PortalOnlyGuard บล็อกทันที → แสดง /portal-required
  - ไม่มีฟอร์ม Login ภายในแอป มีเฉพาะปุ่มกลับไปยัง Portal SSO-VR
  - หากกด F5 ในแท็บเดิมที่มาจาก Portal: ยืนยันซ้ำผ่าน GET /portal-api/me ทุกครั้ง
  - ระดับ DB (PostgreSQL RLS): หากผู้ใช้ถูกถอดสิทธิ์ VEHICLE_APP จะถูกปฏิเสธทุก Query
```

---

## 3. การตั้งค่าเชื่อมต่อ Portal SSO-VR และ Supabase

### 3.1 การลงทะเบียนใน Portal SSO-VR (`/admin/webapps`)

| ฟิลด์ | ค่าที่แนะนำ |
| :--- | :--- |
| `app_code` | `VEHICLE_APP` |
| `name` | ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ |
| `url` | `https://<cloudflare-pages-domain>/sso-callback` (Dev: `http://localhost:5174/#/sso-callback`) |
| `allowed_origins` | `https://<cloudflare-pages-domain>`, `https://stb6636.github.io`, `http://localhost:5174` |
| `scopes` (PDPA Least Privilege) | `permission:read`, `reference:read`, `position:read`, `personnel:read` |
| `webapp_roles` | `APP_ADMIN` (ระดับ 90, `is_app_admin=true`), `FLEET_ADMIN` (ระดับ 50, จัดการรถในขอบเขต), `DEPT_OFFICER` (ระดับ 10, `is_default_on_grant=true`, ดู/บันทึกต่อภาษีและแจ้งซ่อมในฝ่ายตน) |

### 3.2 การเปิด Schema `vehicleapp` บน Supabase

1. รัน Migration `supabase/migrations/001_vehicleapp_schema.sql` (ดำเนินการสร้างจริงบนโปรเจกต์ `Portal SSO-STB` เรียบร้อยแล้ว — 6 ตาราง, 1 วิว, 14 RLS Policies, 4 ประเภทยานพาหนะ, 9 ค่าตั้งต้น)
2. ไปที่ **Supabase Dashboard → Project Settings → Data API → Exposed schemas** เพิ่ม `vehicleapp` (เป็น `public, graphql_public, vehicleapp`) แล้วกด **Save**

---

## 4. แผนการออกแบบ UI/UX และธีมตาม Portal SSO-VR (Requirement 7.1 & 7.2)

- **Design System:** BMA Enterprise Design System V2.5 (`src/styles/bma-theme.css` + `src/styles/index.css`)
- **Typography & Icons:** Google Font `Sarabun` + Font Awesome 6 Free 100%
- **Color Palette:** BMA Emerald `#00744B` / `#005B2E` / `#00A368` + BMA Gold `#F6DE51` + Canvas `#E7ECE9` (Light) และ `#0B132B` / `#11231B` (Eye-Care Dark Mode Zero-FOUC)
- **Layout Shell (`VehicleShell.tsx`):** ถอดแบบจาก `AdminShell.tsx` ของ Portal SSO-VR — Sidebar สีเข้ม `w-72` + Capsule User Card + เมนู 5 หน้าจัดกลุ่ม + Topbar Breadcrumb + Theme Pill + Mobile Drawer & Bottom Nav + ปุ่มกลับ Portal SSO-VR
- **โครงสร้างหน้าจอ 5 โมดูลหลัก:**
  1. `/dashboard` — การ์ดสรุป 9 สถานะ + ตารางรายการเร่งด่วนจัดกลุ่มตามสถานะ (ขาดต่ออายุ → ซ่อมฯ ขาดต่ออายุ → กำลังจะขาดต่ออายุ → ซ่อมฯ กำลังจะขาดต่ออายุ → ซ่อมบำรุง) + ประวัติกิจกรรมล่าสุด 5 รายการ
  2. `/vehicles` — ตัวกรองค้นหา/ประเภท/สถานะ/ส่วนราชการ/จัดเรียง + ตารางจัดกลุ่มตามส่วนราชการ→ประเภท + Modal ดูรายละเอียด + Modal เพิ่ม/แก้ไข (React Hook Form + Zod + ThaiDatePicker พ.ศ. + Smart Caretaker Combobox + อัปโหลดใบอนุญาตเรือผ่าน GAS Drive Bridge)
  3. `/activities` — ปุ่มเพิ่มรายงาน 5 ประเภท + สวิตช์เลือก 1 คัน/หลายคันพร้อมกัน + Picker Modal ค้นหารถตามสังกัดและประเภท + ประวัติกิจกรรมแบบแบ่งหน้า + Modal ดูรายละเอียด/แก้ไข (Admin)
  4. `/reports` — ตัวกรองรถ/เรือ + สถานะ + ส่วนราชการ + ตารางจัดกลุ่ม + ปุ่มพิมพ์/ส่งออก PDF (A4 ตรา กทม. ครบสรุป 9 สถานะ) และส่งออก Excel (.xlsx)
  5. `/settings` (เฉพาะ `SUPERADMIN` / `APP_ADMIN`) — ตั้งค่าวันแจ้งเตือน ขนาดไฟล์ ลิงก์ GAS Google Drive Bridge พร้อมปุ่มทดสอบการเชื่อมต่อโฟลเดอร์ + แผงตรวจสอบสุขภาพ Schema `vehicleapp` + ปุ่มรีเฟรชสถานะยานพาหนะทั้งระบบ

---

## 5. แผนการพัฒนาแบบแบ่งระยะ (Phased Implementation Roadmap)

| ระยะ (Phase) | ขอบเขตงานหลัก | สถานะ |
| :--- | :--- | :--- |
| **Phase 1: Foundation, Schema, SSO & AI Workflow** | โคลน Ex Project, ติดตั้ง AI-Brain, สร้าง Schema `vehicleapp` จริงบน Supabase (6 ตาราง + วิว + RPC + 14 RLS), วางโครง Vite 6 + React 18 + TS + BMA Theme, เชื่อม Portal SSO SDK, บล็อกการเข้าลิงก์ตรง (`PortalOnlyGuard` + `sessionStorage`), Unit Tests + Push GitHub | **✅ ดำเนินการเสร็จสมบูรณ์** |
| **Phase 2: Core Vehicle CRUD & Activity Engine** | สร้าง `VehicleFormModal` (รถ/เรือ + Smart Caretaker Combobox จาก `portal-api /personnel` + `ThaiDatePicker` พ.ศ.), `VehicleDetailModal`, `ActivityRecordModal` (Single & Multi-Vehicle Batch + Picker), `ActivityEditModal`, และ Notification Bell เชื่อม `vehicleapp.notification_reads` | ⏳ รออนุมัติเริ่มพัฒนา |
| **Phase 3: Reports (PDF/Excel), Drive Storage Bridge & Settings UI** | สร้างหน้าพิมพ์รายงาน A4 (ตรา กทม. + สรุปยอด 9 สถานะ), ส่งออก ExcelJS, เชื่อม GAS Google Drive Bridge สำหรับไฟล์ใบอนุญาตเรือ/หลักฐานต่อภาษี, หน้าตั้งค่าแบบตรวจสอบลิงก์และ Audit Log viewer | ⏳ รออนุมัติเริ่มพัฒนา |
| **Phase 4: Data Migration, E2E SSO Verification & Production Rollout** | สคริปต์นำเข้าข้อมูลจาก Google Sheets เดิม (`Vehicles`, `Activity_History`) จับคู่ `org_units` และ `personnel` บน Supabase, ทดสอบ E2E จาก Portal SSO-VR จริง (3 บทบาท), Deploy Cloudflare Pages + GitHub Pages | ⏳ รออนุมัติเริ่มพัฒนา |

---

## 6. แผนการทดสอบและการตรวจสอบคุณภาพ (QA & Verification Matrix)

1. **Unit Tests (Vitest):** ทดสอบสมการสถานะ 8 สถานะ (ขอบเขต 45 วัน, 0 วัน, -1 วัน, สถานะควบซ่อมบำรุง, สถานะ Terminal), ทดสอบ `PortalOnlyGuard` (บล็อกลิงก์ตรง, ดึง `sso_token` ทั้ง Browser/Hash mode, ลำดับสิทธิ์), ทดสอบ `resolveRouterConfig`
2. **Database & RLS Verification:** ทดสอบ `vehicleapp.fn_schema_health()`, ทดสอบ RLS แยกสิทธิ์ `SUPERADMIN` / `ADMIN` Lv2-Lv3 / `DEPT_OFFICER` / ผู้ใช้ที่ไม่มีสิทธิ์ `VEHICLE_APP`
3. **Security Audit:** ยืนยันว่าไม่มีการเก็บความลับใน Git, ยืนยันว่าเปิดลิงก์ตรงใน Incognito/แท็บใหม่ถูกบล็อก 100%, ยืนยันว่า `sso_token` ใช้ซ้ำไม่ได้ (replay returns 401)
