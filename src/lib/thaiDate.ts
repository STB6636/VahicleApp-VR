/**
 * Single Source of Truth for Buddhist Era (พ.ศ.) dates & Asia/Bangkok timezone utilities.
 * Zero external dependencies — safe to reuse in sub-apps (e.g. decoration_app).
 *
 * Storage Layer: ISO-8601 CE (YYYY-MM-DD for DATE, UTC ISO for TIMESTAMPTZ)
 * Presentation & Input Layer: Thai Buddhist Era (พ.ศ., BE = CE + 543) in Asia/Bangkok (+07:00)
 */

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
] as const;

export const THAI_MONTHS_LONG = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const;

export const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;

const THAI_DIGITS_MAP: Record<string, string> = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9',
};

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ParsedThaiDate {
  isoCe: string;
  displayBe: string;
  yearBe: number;
  yearCe: number;
  month: number;
  day: number;
  convertedCeToBe: boolean;
  convertedThaiDigits: boolean;
}

export interface RetirementDateInfo {
  fiscalYearBe: number;
  retirementDateIso: string;
  retirementDateShort: string;
}

function convertThaiDigits(input: string): { value: string; converted: boolean } {
  let converted = false;
  const value = String(input || '').replace(/[๐-๙]/g, (ch) => {
    converted = true;
    return THAI_DIGITS_MAP[ch] ?? ch;
  });
  return { value, converted };
}

function isValidCalendarDate(yearCe: number, month: number, day: number): boolean {
  if (!Number.isInteger(yearCe) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(yearCe, month - 1, day));
  return (
    d.getUTCFullYear() === yearCe &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function getBangkokDateTimeParts(date: Date): {
  yearCe: number;
  month: number;
  day: number;
  hour: string;
  minute: string;
  second: string;
} | null {
  if (Number.isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const yearCe = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  if (!isValidCalendarDate(yearCe, month, day)) return null;
  const hour = map.hour === '24' ? '00' : (map.hour || '00').padStart(2, '0');
  const minute = (map.minute || '00').padStart(2, '0');
  const second = (map.second || '00').padStart(2, '0');
  return { yearCe, month, day, hour, minute, second };
}

function extractDateParts(value: string | Date | null | undefined): {
  yearCe: number;
  month: number;
  day: number;
} | null {
  if (!value) return null;
  if (value instanceof Date) {
    const p = getBangkokDateTimeParts(value);
    return p ? { yearCe: p.yearCe, month: p.month, day: p.day } : null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(ISO_DATE_RE);
  if (isoMatch) {
    const yearCe = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return isValidCalendarDate(yearCe, month, day) ? { yearCe, month, day } : null;
  }

  const parsedDate = new Date(trimmed);
  if (Number.isNaN(parsedDate.getTime())) return null;
  const p = getBangkokDateTimeParts(parsedDate);
  return p ? { yearCe: p.yearCe, month: p.month, day: p.day } : null;
}

/**
 * Format an ISO date (YYYY-MM-DD), TIMESTAMPTZ, or Date into Buddhist Era (พ.ศ.) string.
 * - 'numeric': 01/10/2569
 * - 'short':   1 ต.ค. 2569
 * - 'long':    1 ตุลาคม 2569
 */
export function formatThaiDate(
  value: string | Date | null | undefined,
  style: 'numeric' | 'short' | 'long' = 'short'
): string {
  const parts = extractDateParts(value);
  if (!parts) return '';
  const { yearCe, month, day } = parts;
  const yearBe = yearCe + 543;
  if (style === 'numeric') {
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    return `${dd}/${mm}/${yearBe}`;
  }
  if (style === 'long') {
    return `${day} ${THAI_MONTHS_LONG[month - 1]} ${yearBe}`;
  }
  return `${day} ${THAI_MONTHS_SHORT[month - 1]} ${yearBe}`;
}

/**
 * Format a TIMESTAMPTZ or Date into Thai Buddhist Era date & time locked to Asia/Bangkok (+07:00).
 * Example: '24 พ.ย. 2569 13:45 น.'
 */
export function formatThaiDateTime(
  value: string | Date | null | undefined,
  options?: { showSeconds?: boolean; style?: 'short' | 'long' }
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value).trim());
  const parts = getBangkokDateTimeParts(date);
  if (!parts) return '';
  const yearBe = parts.yearCe + 543;
  const monthLabel =
    options?.style === 'long'
      ? THAI_MONTHS_LONG[parts.month - 1]
      : THAI_MONTHS_SHORT[parts.month - 1];
  const timeStr = options?.showSeconds
    ? `${parts.hour}:${parts.minute}:${parts.second}`
    : `${parts.hour}:${parts.minute}`;
  return `${parts.day} ${monthLabel} ${yearBe} ${timeStr} น.`;
}

/**
 * Parse user-typed or imported date string in Thai BE or ISO CE format.
 * Supports:
 * - DD/MM/BBBB, DD-MM-BBBB, DD.MM.BBBB (or DD/MM/YYYY CE -> auto-converted to BE)
 * - YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD (CE or BE)
 * - Thai digits (๐-๙) automatically converted to Arabic digits
 * - Full calendar validation including leap years (29 Feb)
 */
export function parseThaiDateInput(rawInput: string): ParsedThaiDate | null {
  const { value: arabic, converted: convertedThaiDigits } = convertThaiDigits(
    String(rawInput || '').trim()
  );
  if (!arabic) return null;

  let day = 0;
  let month = 0;
  let year = 0;

  // Format DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = arabic.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    // Format YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    const ymd = arabic.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
    if (!ymd) return null;
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let convertedCeToBe = false;
  let yearCe = year;
  let yearBe = year;
  if (year >= 1900 && year <= 2200) {
    yearCe = year;
    yearBe = year + 543;
    convertedCeToBe = true;
  } else if (year >= 2400 && year <= 2700) {
    yearBe = year;
    yearCe = year - 543;
  } else {
    return null;
  }

  if (!isValidCalendarDate(yearCe, month, day)) {
    return null;
  }

  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return {
    isoCe: `${yearCe}-${mm}-${dd}`,
    displayBe: `${dd}/${mm}/${yearBe}`,
    yearBe,
    yearCe,
    month,
    day,
    convertedCeToBe,
    convertedThaiDigits,
  };
}

/**
 * Current date in YYYY-MM-DD (CE) locked to Asia/Bangkok timezone.
 */
export function getTodayIsoBangkok(now: Date = new Date()): string {
  const parts = getBangkokDateTimeParts(now);
  if (!parts) return '';
  return `${parts.yearCe}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Current Buddhist Era year (e.g. 2569) locked to Asia/Bangkok timezone.
 */
export function getCurrentYearBeBangkok(now: Date = new Date()): number {
  const parts = getBangkokDateTimeParts(now);
  return parts ? parts.yearCe + 543 : new Date().getFullYear() + 543;
}

/**
 * Buddhist Era date tag for exported filenames (e.g. '2569-11-24') locked to Asia/Bangkok.
 */
export function getTodayBeFileTag(now: Date = new Date()): string {
  const parts = getBangkokDateTimeParts(now);
  if (!parts) return '';
  const yearBe = parts.yearCe + 543;
  return `${yearBe}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Extract YYYY-MM-DD (CE) from a TIMESTAMPTZ in Asia/Bangkok timezone.
 * Prevents off-by-one UTC date bugs caused by `.slice(0, 10)` on UTC timestamps.
 */
export function extractBangkokIsoDate(timestamptz: string | Date | null | undefined): string {
  if (!timestamptz) return '';
  if (typeof timestamptz === 'string') {
    const trimmed = timestamptz.trim();
    if (!trimmed) return '';
    const isoMatch = trimmed.match(ISO_DATE_RE);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]);
      const d = Number(isoMatch[3]);
      return isValidCalendarDate(y, m, d) ? trimmed : '';
    }
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return '';
    return getTodayIsoBangkok(d);
  }
  return getTodayIsoBangkok(timestamptz);
}

/**
 * Convert a YYYY-MM-DD date string to end-of-day UTC ISO timestamp in Asia/Bangkok (+07:00).
 * Example: '2026-09-30' -> '2026-09-30T16:59:59.000Z' (which is 2026-09-30 23:59:59+07:00).
 */
export function isoDateToBangkokEndOfDayIso(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const trimmed = String(isoDate).trim();
  const match = trimmed.match(ISO_DATE_RE);
  if (!match) return null;
  const yearCe = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(yearCe, month, day)) return null;
  const dt = new Date(`${trimmed}T23:59:59+07:00`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/**
 * BMA Civil Servant October 1st Retirement Rule (Section 5.3 of decoration spec):
 * - Born Jan 1 – Oct 1 (inclusive!) -> retires on Sep 30 of fiscal year (birthYearBE + 60)
 * - Born Oct 2 – Dec 31             -> retires on Sep 30 of fiscal year (birthYearBE + 61)
 */
export function getRetirementFiscalYearBE(
  birthDateIso: string | Date | null | undefined
): number | null {
  const parts = extractDateParts(birthDateIso);
  if (!parts) return null;
  const birthYearBe = parts.yearCe + 543;
  if ((parts.month === 10 && parts.day >= 2) || parts.month > 10) {
    return birthYearBe + 61;
  }
  return birthYearBe + 60;
}

/**
 * Full retirement summary for HR birth_date display.
 */
export function getRetirementDateInfo(
  birthDateIso: string | Date | null | undefined
): RetirementDateInfo | null {
  const fiscalYearBe = getRetirementFiscalYearBE(birthDateIso);
  if (fiscalYearBe === null) return null;
  const retirementYearCe = fiscalYearBe - 543;
  return {
    fiscalYearBe,
    retirementDateIso: `${retirementYearCe}-09-30`,
    retirementDateShort: `30 ก.ย. ${fiscalYearBe}`,
  };
}
