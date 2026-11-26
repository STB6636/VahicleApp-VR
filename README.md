# Vehicle App — ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ (Vite + React + Supabase Multi-Schema)

เว็บแอปพลิเคชันบริหารจัดการทะเบียนรถและเรือราชการ ติดตามวันสิ้นอายุภาษี/ใบอนุญาตเรือ บันทึกประวัติการต่ออายุและซ่อมบำรุง ออกรายงาน PDF/Excel และเชื่อมต่อการยืนยันตัวตนแบบ **Single Sign-On (SSO)** กับ **Portal SSO-VR** ภายใต้มาตรฐาน **BMA Enterprise Design System V2.5**

## สถาปัตยกรรมหลัก (Architecture Overview)

- **Frontend:** Vite 6 + React 18 + TypeScript 5 (Strict) + Tailwind CSS v4 + Font Awesome 6 Free + Google Font `Sarabun` (ธีม Light / Eye-Care Dark Mode แบบเดียวกับ Portal SSO-VR)
- **State & Data:** TanStack Query v5 + Zustand + React Hook Form + Zod
- **Database:** Supabase PostgreSQL Multi-Schema (ใช้โปรเจกต์เดียวกับ Portal SSO-VR แต่แยกทุกตาราง/วิว/RPC ไว้ใน Schema **`vehicleapp`** พร้อม Cross-Schema FK ไปที่ `public.org_units`, `public.personnel`, `public.users`)
- **Security (Portal-Only Access Policy):**
  - **ไม่มีหน้าล็อกอินภายในแอป** — ไม่อนุญาตให้เข้าใช้งานผ่านลิงก์โดยตรง
  - รับ One-Time `?sso_token=...` ที่ `/sso-callback` → แลกผ่าน `PortalSsoClient.exchangeSsoToken()` → ยืนยันเซสชันด้วย `supabase.auth.verifyOtp()` โดยเก็บเซสชันใน `sessionStorage` เท่านั้น
  - การเปิดลิงก์ตรงในแท็บใหม่หรือบุ๊กมาร์กจะถูกบล็อกที่ `PortalOnlyGuard` และแสดงหน้า `PortalAccessBlockedPage` ทันที
  - บังคับสิทธิ์ระดับฐานข้อมูล (RLS) ผ่าน `vehicleapp.fn_can_access_vehicle()` และ `vehicleapp.fn_my_app_role_level()`

## โครงสร้างฐานข้อมูล Schema `vehicleapp`

ไฟล์ Migration: [`supabase/migrations/001_vehicleapp_schema.sql`](./supabase/migrations/001_vehicleapp_schema.sql)

| ตาราง / วิว | หน้าที่ |
| :--- | :--- |
| `vehicleapp.vehicle_types` | ประเภทยานพาหนะ (`CAR`, `MOTORCYCLE`, `TRUCK`, `VESSEL`) |
| `vehicleapp.vehicles` | ทะเบียนรถ/เรือราชการ ผูก FK หน่วยงาน 4 ระดับ และผู้ดูแลจาก Core HR |
| `vehicleapp.vehicle_activities` | ประวัติต่ออายุภาษี ซ่อมบำรุง ยุบสภาพ จำหน่าย และคืนสถานะ |
| `vehicleapp.app_settings` | ค่าตั้งค่าระบบ (วันแจ้งเตือน, ลิงก์ GAS Drive Bridge, หัวรายงาน) |
| `vehicleapp.notification_reads` | บันทึกสถานะการอ่านแจ้งเตือนรายผู้ใช้ |
| `vehicleapp.audit_logs` | บันทึกการเปลี่ยนแปลงสำคัญของระบบยานพาหนะ |
| `vehicleapp.v_vehicles_enriched` | วิวรวมข้อมูลยานพาหนะ + สังกัด + ผู้ดูแล + สถานะคำนวณแบบเรียลไทม์ |

## การตั้งค่าและเริ่มต้นใช้งาน

1. **เปิด PostgREST Exposed Schema ใน Supabase Dashboard:**
   - ไปที่ **Project Settings → Data API → Exposed schemas**
   - เพิ่ม `vehicleapp` ต่อท้าย (เช่น `public, graphql_public, vehicleapp`) แล้วกด **Save**
2. **ลงทะเบียนแอปใน Portal SSO-VR (`/admin/webapps`):**
   - `app_code`: `VEHICLE_APP`
   - `url`: `https://<your-domain>/sso-callback` (หรือ `http://localhost:5174/#/sso-callback` ช่วงพัฒนา)
   - `scopes`: `permission:read`, `reference:read`, `position:read`, `personnel:read`
   - `roles`: `APP_ADMIN` (Lv 90), `FLEET_ADMIN` (Lv 50), `DEPT_OFFICER` (Lv 10)
3. **ตั้งค่า `.env.local` จาก `.env.example` และรัน:**

```bash
npm install
npm run typecheck
npm test
npm run dev
```

## เอกสารแผนวางระบบฉบับเต็ม

- ดูรายละเอียดการวิเคราะห์ระบบเดิม (GAS) และแผนการสร้างใหม่ฉบับสมบูรณ์ได้ที่ [`docs/VEHICLE_APP_ARCHITECTURE_PLAN.md`](./docs/VEHICLE_APP_ARCHITECTURE_PLAN.md)
