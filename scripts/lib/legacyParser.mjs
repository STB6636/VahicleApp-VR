/**
 * Pure Legacy Google Sheets -> Supabase `vehicleapp` Migration Parser & Mapper
 * Mirrors `Ex Project/Data.js` & `Ex Project/Domain.js` schemas.
 */

export const LEGACY_STATUS_MAP = {
  'ปกติ': { status_code: 'NORMAL', is_under_maintenance: false },
  'กำลังจะขาดต่ออายุ': { status_code: 'WARNING', is_under_maintenance: false },
  'ขาดต่ออายุ': { status_code: 'EXPIRED', is_under_maintenance: false },
  'ซ่อมบำรุง': { status_code: 'MAINTENANCE', is_under_maintenance: true },
  'ซ่อมบำรุง กำลังจะขาดต่ออายุ': { status_code: 'MAINTENANCE_WARNING', is_under_maintenance: true },
  'ซ่อมบำรุง ขาดต่ออายุ': { status_code: 'MAINTENANCE_EXPIRED', is_under_maintenance: true },
  'ยุบสภาพรอจำหน่าย': { status_code: 'DECOMMISSIONED', is_under_maintenance: false },
  'ยุบสภาพ': { status_code: 'DECOMMISSIONED', is_under_maintenance: false },
  'จำหน่าย': { status_code: 'DISPOSED', is_under_maintenance: false },
};

export const LEGACY_VEHICLE_TYPE_MAP = {
  'รถยนต์': 'CAR',
  'รถจักรยานยนต์': 'MOTORCYCLE',
  'รถบรรทุก': 'TRUCK',
  'เรือ': 'VESSEL',
};

export const LEGACY_ACTIVITY_TYPE_MAP = {
  'ต่ออายุภาษี': 'TAX_RENEWAL',
  'รายงานการซ่อมบำรุง (ส่งซ่อม)': 'MAINTENANCE_SEND',
  'ส่งซ่อม': 'MAINTENANCE_SEND',
  'รายงานการซ่อมบำรุง (รายงานผลการซ่อม)': 'MAINTENANCE_COMPLETE',
  'รายงานผลการซ่อม': 'MAINTENANCE_COMPLETE',
  'ยุบสภาพรอจำหน่าย': 'DECOMMISSION',
  'จำหน่าย': 'DISPOSE',
  'แก้ไขสถานะ (กลับเป็นปกติ)': 'RESTORE_NORMAL',
};

/**
 * RFC-4180 compliant CSV parser (handles BOM, quoted commas, escaped quotes, CRLF/LF).
 */
export function parseCsvRecords(csvText) {
  const clean = String(csvText || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].map((h) => String(h).trim());
  return nonEmpty.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, idx) => {
      if (header) obj[header] = cells[idx] !== undefined ? String(cells[idx]).trim() : '';
    });
    return obj;
  });
}

/**
 * Normalizes legacy Google Sheets dates (ISO, DD/MM/BBBB, DD/MM/YYYY, Excel serial) -> YYYY-MM-DD.
 */
export function normalizeLegacyDate(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const raw = String(rawValue).trim();
  if (!raw) return null;

  // Excel serial number (e.g. 46022)
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 10000 && serial < 70000) {
      const epoch = new Date((serial - 25569) * 86_400_000);
      if (!Number.isNaN(epoch.getTime())) {
        return epoch.toISOString().slice(0, 10);
      }
    }
  }

  // ISO YYYY-MM-DD (optionally with timestamp)
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    let year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 2400 && year <= 2700) year -= 543;
    return formatValidIso(year, month, day);
  }

  // DD/MM/YYYY or DD/MM/BBBB
  const dmyMatch = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);
    if (year >= 2400 && year <= 2700) year -= 543;
    return formatValidIso(year, month, day);
  }

  return null;
}

function formatValidIso(yearCe, month, day) {
  if (yearCe < 1900 || yearCe > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const d = new Date(Date.UTC(yearCe, month - 1, day));
  if (
    d.getUTCFullYear() !== yearCe ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${yearCe}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function mapLegacyStatus(rawStatus) {
  const key = String(rawStatus || '').trim();
  if (LEGACY_STATUS_MAP[key]) return LEGACY_STATUS_MAP[key];
  return { status_code: 'NORMAL', is_under_maintenance: false };
}

export function mapLegacyVehicleTypeCode(rawType) {
  const key = String(rawType || '').trim();
  return LEGACY_VEHICLE_TYPE_MAP[key] || 'CAR';
}

export function mapLegacyActivityType(rawType) {
  const key = String(rawType || '').trim();
  if (LEGACY_ACTIVITY_TYPE_MAP[key]) return LEGACY_ACTIVITY_TYPE_MAP[key];
  if (key.includes('ต่ออายุ')) return 'TAX_RENEWAL';
  if (key.includes('ส่งซ่อม')) return 'MAINTENANCE_SEND';
  if (key.includes('ผลการซ่อม')) return 'MAINTENANCE_COMPLETE';
  if (key.includes('ยุบสภาพ')) return 'DECOMMISSION';
  if (key.includes('จำหน่าย')) return 'DISPOSE';
  if (key.includes('กลับเป็นปกติ')) return 'RESTORE_NORMAL';
  return 'TAX_RENEWAL';
}

export function normalizeThaiName(str) {
  return String(str || '')
    .replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ว่าที่\s*ร\.ต\.|ร\.ต\.|ดร\.)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Joins `public.org_units` rows (which carry `level_id`, NOT `level_no`) with
 * `public.org_unit_levels` rows (`{ id, level_no }`) to attach `level_no` (1..4).
 */
export function normalizeOrgUnitsWithLevels(orgUnits, orgUnitLevels) {
  const levelById = new Map(
    (orgUnitLevels || []).map((lvl) => [lvl.id, Number(lvl.level_no)])
  );
  return (orgUnits || []).map((u) => ({
    ...u,
    level_no:
      (u.level_id ? levelById.get(u.level_id) : undefined) ??
      (Number.isFinite(Number(u.level_no)) ? Number(u.level_no) : 0),
  }));
}

/**
 * Preserves time-of-day (HH:mm[:ss]) if present on legacy `Recorded_At` strings.
 */
export function normalizeLegacyTimestamp(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const raw = String(rawValue).trim();
  if (!raw) return null;

  const dateIso = normalizeLegacyDate(raw);
  if (!dateIso) return null;

  const timeMatch = raw.match(/(?:[T\s])(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const hh = Number(timeMatch[1]);
    const mm = Number(timeMatch[2]);
    const ss = Number(timeMatch[3] ?? '0');
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59) {
      return `${dateIso}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+07:00`;
    }
  }

  return `${dateIso}T00:00:00+07:00`;
}

/**
 * Resolves legacy `Division` string (which stored Lv3 Department in Ex Project)
 * to Portal SSO `org_units` UUIDs (`office_id`, `department_id`, `division_id`).
 */
export function resolveOrgUnitMatch(divisionName, orgUnits) {
  const target = String(divisionName || '').trim();
  if (!target || !Array.isArray(orgUnits) || orgUnits.length === 0) {
    return { office_id: null, department_id: null, division_id: null };
  }

  const byId = new Map(orgUnits.map((u) => [u.id, u]));
  const exact = orgUnits.find((u) => String(u.name_th || '').trim() === target);
  const partial =
    exact ||
    orgUnits.find((u) => String(u.name_th || '').trim().includes(target) || target.includes(String(u.name_th || '').trim()));

  if (!partial) return { office_id: null, department_id: null, division_id: null };

  if (partial.level_no === 4) {
    const dept = partial.parent_id ? byId.get(partial.parent_id) : null;
    const office = dept?.parent_id ? byId.get(dept.parent_id) : null;
    return {
      office_id: office?.id ?? null,
      department_id: dept?.id ?? null,
      division_id: partial.id,
    };
  }
  if (partial.level_no === 3) {
    const office = partial.parent_id ? byId.get(partial.parent_id) : null;
    return {
      office_id: office?.id ?? null,
      department_id: partial.id,
      division_id: null,
    };
  }
  if (partial.level_no === 2) {
    return {
      office_id: partial.id,
      department_id: null,
      division_id: null,
    };
  }

  return { office_id: null, department_id: null, division_id: null };
}

/**
 * Maps a single legacy `Vehicles` row into a Supabase `vehicleapp.vehicles` insert object.
 */
export function transformLegacyVehicleRow(row, context) {
  const { vehicleTypesByCode, orgUnits, personnelDirectory, legacyPersonnelById } = context;
  const warnings = [];

  const vehicleCode = String(row.Vehicle_ID || '').trim();
  if (!vehicleCode) {
    return { ok: false, error: 'Missing Vehicle_ID' };
  }

  const typeCode = mapLegacyVehicleTypeCode(row.Vehicle_Type);
  const vt = vehicleTypesByCode.get(typeCode);
  if (!vt) {
    return { ok: false, error: `Unknown vehicle_type code: ${typeCode}` };
  }

  const expiryDate = normalizeLegacyDate(row.Current_Expiry_Date);
  if (!expiryDate) {
    return { ok: false, error: `Invalid Current_Expiry_Date for ${vehicleCode}: ${row.Current_Expiry_Date}` };
  }

  const { status_code, is_under_maintenance } = mapLegacyStatus(row.Status);
  const orgMatch = resolveOrgUnitMatch(row.Division || row.Department_Name, orgUnits);
  if ((row.Division || row.Department_Name) && !orgMatch.department_id && !orgMatch.office_id) {
    warnings.push(`Unmatched org unit: "${row.Division || row.Department_Name}"`);
  }

  // Match caretaker personnel via legacy Personnel sheet name -> Portal v_personnel_directory
  let caretakerId = null;
  const legacyPid = String(row.Personnel_ID || '').trim();
  if (legacyPid && legacyPersonnelById?.has(legacyPid)) {
    const legacyPerson = legacyPersonnelById.get(legacyPid);
    const fullNameNorm = normalizeThaiName(
      `${legacyPerson.Prefix || ''} ${legacyPerson.First_Name || ''} ${legacyPerson.Last_Name || ''}`
    );
    const match = (personnelDirectory || []).find(
      (p) => normalizeThaiName(p.full_name) === fullNameNorm
    );
    if (match) {
      caretakerId = match.id;
    } else {
      warnings.push(`Unmatched caretaker (${legacyPid}): "${fullNameNorm}"`);
    }
  }

  const isVessel = typeCode === 'VESSEL';
  const toInt = (v) => {
    const n = Number(String(v || '').replace(/,/g, '').trim());
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const toModelYear = (v) => {
    const n = toInt(v);
    if (n === null) return null;
    if (n < 1950 || n > 2650) {
      warnings.push(`Ignored out-of-range Model_Year: "${v}"`);
      return null;
    }
    return n;
  };
  const toNum = (v) => {
    const n = Number(String(v || '').replace(/,/g, '').trim());
    return Number.isFinite(n) && n >= 0 && String(v || '').trim() !== '' ? n : null;
  };

  return {
    ok: true,
    warnings,
    record: {
      vehicle_code: vehicleCode,
      vehicle_type_id: vt.id,
      license_plate: isVessel ? null : String(row.License_Plate || '').trim() || null,
      province: isVessel ? null : String(row.Province || '').trim() || null,
      vessel_name: isVessel ? String(row.Vessel_Name || '').trim() || null : null,
      vessel_license_no: isVessel ? String(row.Vessel_License_No || '').trim() || null : null,
      brand: isVessel ? null : String(row.Brand || '').trim() || null,
      model: isVessel ? null : String(row.Model || '').trim() || null,
      model_year: isVessel ? null : toModelYear(row.Model_Year),
      engine_cc: isVessel ? null : toInt(row.Engine_CC),
      price: isVessel ? null : toNum(row.Price),
      acquisition_date: normalizeLegacyDate(row.Acquisition_Date),
      disposal_date: status_code === 'DISPOSED' ? normalizeLegacyDate(row.Disposal_Date) : null,
      current_expiry_date: expiryDate,
      office_id: orgMatch.office_id,
      department_id: orgMatch.department_id,
      division_id: orgMatch.division_id,
      caretaker_personnel_id: caretakerId,
      status_code,
      is_under_maintenance,
      attachment_folder_id: String(row.Attachment_Folder_ID || '').trim() || null,
      latest_file_url: String(row.Latest_File_URL || '').trim() || null,
      remarks: String(row.Remarks || '').trim() || null,
    },
  };
}

/**
 * Maps a single legacy `Activity_History` row into `vehicleapp.vehicle_activities`.
 */
export function transformLegacyActivityRow(row, vehicleIdByCode) {
  const activityCode = String(row.Activity_ID || row.Renewal_ID || '').trim();
  const vehicleCode = String(row.Vehicle_ID || '').trim();
  if (!activityCode || !vehicleCode) {
    return { ok: false, error: 'Missing Activity_ID or Vehicle_ID' };
  }

  const vehicleId = vehicleIdByCode.get(vehicleCode);
  if (!vehicleId) {
    return { ok: false, error: `Referenced Vehicle_ID not found: ${vehicleCode}` };
  }

  const activityType = mapLegacyActivityType(row.Activity_Type);
  const rawRecordedBy = String(row.Recorded_By || 'ผู้ใช้งาน (นำเข้าข้อมูล)').trim();
  const recordedByName = rawRecordedBy.includes(' / ')
    ? rawRecordedBy.split(' / ')[0].trim()
    : rawRecordedBy;

  const recordedAt = normalizeLegacyTimestamp(row.Recorded_At);

  return {
    ok: true,
    record: {
      activity_code: activityCode,
      vehicle_id: vehicleId,
      activity_type: activityType,
      activity_label_th: String(row.Activity_Type || activityType).trim(),
      document_no: String(row.Document_No || row.Receipt_No || '').trim() || null,
      start_date: normalizeLegacyDate(row.Start_Date),
      expiry_date: normalizeLegacyDate(row.Expiry_Date),
      location: String(row.Location || '').trim() || null,
      details: String(row.Details || '').trim() || null,
      file_url: String(row.File_URL || '').trim() || null,
      recorded_by_name: recordedByName || 'ผู้ใช้งาน (นำเข้าข้อมูล)',
      ...(recordedAt ? { recorded_at: recordedAt } : {}),
    },
  };
}

export function extractMaxSequenceNumber(codes, prefix) {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`, 'i');
  for (const code of codes) {
    const m = String(code || '').trim().match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return max;
}
