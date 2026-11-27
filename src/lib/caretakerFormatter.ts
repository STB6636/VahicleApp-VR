import type { VehicleEnrichedRow } from '@/types/vehicle.types';

const MEANINGLESS_SEGMENTS = new Set(['', '-', '—', 'ไม่มี', 'ไม่มีระดับ', 'ไม่ระบุ', 'null', 'undefined']);

export function cleanDisplaySegment(value?: string | null): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (MEANINGLESS_SEGMENTS.has(s.toLowerCase()) || MEANINGLESS_SEGMENTS.has(s)) {
    return '';
  }
  return s;
}

/**
 * Formats caretaker name as [คำนำหน้า+ชื่อ+นามสกุล].
 */
export function formatCaretakerName(
  person:
    | {
        full_name?: string | null;
        prefix_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
      }
    | null
    | undefined
): string {
  if (!person) return '-';
  const full = cleanDisplaySegment(person.full_name);
  if (full) return full;

  const prefix = cleanDisplaySegment(person.prefix_name);
  const first = cleanDisplaySegment(person.first_name);
  const last = cleanDisplaySegment(person.last_name);
  const composed = `${prefix}${first}${last ? ` ${last}` : ''}`.trim();
  return composed || '-';
}

/**
 * Formats caretaker position + level as [ตำแหน่ง+ระดับ].
 * Cleans meaningless level tokens ("ไม่มีระดับ", "-", "ไม่ระบุ") and avoids duplicating
 * the level if `position_display` already embeds it.
 */
export function formatCaretakerPositionLevel(
  person:
    | {
        position_display?: string | null;
        position_name?: string | null;
        position_level_name?: string | null;
      }
    | null
    | undefined
): string {
  if (!person) return '';
  const posDisplay = cleanDisplaySegment(person.position_display);
  const posName = cleanDisplaySegment(person.position_name);
  const level = cleanDisplaySegment(person.position_level_name);

  if (posName && level) {
    if (posDisplay && posDisplay.includes(level)) {
      return posDisplay;
    }
    return `${posName} ${level}`;
  }
  if (posDisplay) {
    if (level && !posDisplay.includes(level)) {
      return `${posDisplay} ${level}`;
    }
    return posDisplay;
  }
  return posName || level || '';
}

/**
 * Combines [คำนำหน้า+ชื่อ+นามสกุล, ตำแหน่ง+ระดับ] for combobox display & search.
 */
export function formatCaretakerFullLabel(
  person: {
    full_name?: string | null;
    prefix_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    position_display?: string | null;
    position_name?: string | null;
    position_level_name?: string | null;
  }
): string {
  const name = formatCaretakerName(person);
  const posLevel = formatCaretakerPositionLevel(person);
  return posLevel ? `${name}, ${posLevel}` : name;
}

/**
 * Formats caretaker position + level for a VehicleEnrichedRow across tables, modals, and reports.
 */
export function formatVehicleCaretakerPositionLevel(
  vehicle: Pick<
    VehicleEnrichedRow,
    'caretaker_position_display' | 'caretaker_position' | 'caretaker_level'
  > | null | undefined
): string {
  if (!vehicle) return '';
  return formatCaretakerPositionLevel({
    position_display: vehicle.caretaker_position_display,
    position_name: vehicle.caretaker_position,
    position_level_name: vehicle.caretaker_level,
  });
}
