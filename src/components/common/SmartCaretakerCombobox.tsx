import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCaretakerFullLabel,
  formatCaretakerName,
  formatCaretakerPositionLevel,
} from '@/lib/caretakerFormatter';
import type { PortalPersonnelDirectoryRow } from '@/types/vehicle.types';

export interface SmartCaretakerFilterParams {
  personnel: PortalPersonnelDirectoryRow[];
  officeId?: string | null;
  departmentId?: string | null;
  defaultPosition?: string | null;
  showAllInOrg: boolean;
}

/**
 * Pure Smart Caretaker Filter (Level 3 Department-scoped):
 * - Excludes inactive/deprovisioned personnel (`allows_account_provision === false`).
 * - Scopes to selected departmentId (Lv3 ส่วน/ฝ่าย) — or officeId only if no department selected.
 * - Normal mode (`showAllInOrg = false`): filters by `defaultPosition` (e.g., "พนักงานขับรถยนต์", "นายท้ายเรือ").
 * - Unlocked mode (`showAllInOrg = true`): displays ALL personnel in that ส่วน/ฝ่าย regardless of position.
 */
export function filterCaretakerCandidates(
  params: SmartCaretakerFilterParams
): PortalPersonnelDirectoryRow[] {
  const { personnel, officeId, departmentId, defaultPosition, showAllInOrg } = params;
  const targetPos = (defaultPosition || '').trim();

  return personnel.filter((p) => {
    if (p.allows_account_provision === false) return false;

    if (departmentId) {
      if (p.department_id !== departmentId) return false;
    } else if (officeId) {
      if (p.office_id !== officeId) return false;
    }

    if (showAllInOrg || !targetPos) return true;

    const pos = String(p.position_name || '').trim();
    const display = String(p.position_display || '').trim();
    return pos === targetPos || pos.includes(targetPos) || display.includes(targetPos);
  });
}

export function formatCaretakerLabel(p: PortalPersonnelDirectoryRow): string {
  return formatCaretakerFullLabel(p);
}

export interface SmartCaretakerComboboxProps {
  personnel: PortalPersonnelDirectoryRow[];
  value: string | null;
  onChange: (personnelId: string | null) => void;
  officeId?: string | null;
  departmentId?: string | null;
  defaultPosition?: string | null;
  showAllInOrg: boolean;
  onToggleShowAll: (showAll: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  fallbackLabel?: string | null;
  selectedOrgName?: string | null;
}

export function SmartCaretakerCombobox({
  personnel,
  value,
  onChange,
  officeId,
  departmentId,
  defaultPosition,
  showAllInOrg,
  onToggleShowAll,
  disabled = false,
  loading = false,
  errorMessage = null,
  onRetry,
  fallbackLabel,
  selectedOrgName,
}: SmartCaretakerComboboxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const allActiveInOrgCount = useMemo(
    () =>
      filterCaretakerCandidates({
        personnel,
        officeId,
        departmentId,
        defaultPosition: null,
        showAllInOrg: true,
      }).length,
    [personnel, officeId, departmentId]
  );

  const candidates = useMemo(
    () =>
      filterCaretakerCandidates({
        personnel,
        officeId,
        departmentId,
        defaultPosition,
        showAllInOrg,
      }),
    [personnel, officeId, departmentId, defaultPosition, showAllInOrg]
  );

  const selectedPerson = useMemo(
    () => personnel.find((p) => p.id === value) ?? null,
    [personnel, value]
  );

  useEffect(() => {
    if (selectedPerson) {
      setQuery(formatCaretakerLabel(selectedPerson));
    } else if (!value) {
      setQuery('');
    } else if (fallbackLabel) {
      setQuery(fallbackLabel);
    }
  }, [selectedPerson, value, fallbackLabel]);

  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (selectedPerson && query === formatCaretakerLabel(selectedPerson)) {
      return candidates;
    }
    if (!selectedPerson && value && fallbackLabel && query === fallbackLabel) {
      return candidates;
    }
    if (!q) return candidates;
    return candidates.filter((p) => {
      const hay = [
        formatCaretakerName(p),
        formatCaretakerPositionLevel(p),
        p.position_name,
        p.position_level_name,
        p.position_display,
        p.department_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, query, selectedPerson, value, fallbackLabel]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (selectedPerson) {
          setQuery(formatCaretakerLabel(selectedPerson));
        } else if (!value) {
          setQuery('');
        } else if (fallbackLabel) {
          setQuery(fallbackLabel);
        }
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [selectedPerson, value, fallbackLabel]);

  const handleSelect = (person: PortalPersonnelDirectoryRow) => {
    onChange(person.id);
    setQuery(formatCaretakerLabel(person));
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAllInOrg}
            onChange={(e) => onToggleShowAll(e.target.checked)}
            disabled={disabled}
            className="rounded border-slate-300 text-[#00744B] focus:ring-emerald-500"
          />
          <span>แสดงบุคลากรทั้งหมดในส่วนราชการนี้ (รวมตำแหน่งอื่นนอกเหนือจาก {defaultPosition || 'ตำแหน่งหลัก'})</span>
        </label>
        <span className="text-[11px] text-slate-400">
          {loading
            ? 'กำลังโหลดรายชื่อ...'
            : showAllInOrg
              ? `ทั้งหมด ${candidates.length} คน`
              : `เฉพาะตำแหน่ง "${defaultPosition || 'ทั้งหมด'}" (${candidates.length} / ${allActiveInOrgCount} คน)`}
        </span>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-200 flex items-center justify-between gap-2">
          <span>
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />
            โหลดรายชื่อบุคลากรไม่สำเร็จ: {errorMessage}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shrink-0"
            >
              ลองใหม่
            </button>
          )}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            setOpen(true);
            setActiveIndex(-1);
            if (!val.trim()) {
              onChange(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((prev) => (prev < visibleOptions.length - 1 ? prev + 1 : 0));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((prev) => (prev > 0 ? prev - 1 : visibleOptions.length - 1));
            } else if (e.key === 'Enter' && open && activeIndex >= 0 && visibleOptions[activeIndex]) {
              e.preventDefault();
              handleSelect(visibleOptions[activeIndex]);
            } else if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={
            loading
              ? 'กำลังดึงรายชื่อบุคลากรจาก Portal SSO...'
              : 'พิมพ์ชื่อ-นามสกุล หรือตำแหน่งเพื่อค้นหาผู้ดูแล...'
          }
          className="bma-input pr-16"
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {(value || query) && !disabled && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setQuery('');
                setOpen(false);
              }}
              aria-label="ล้างผู้ดูแล"
              className="w-6 h-6 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((prev) => !prev)}
            aria-label="เปิดรายชื่อผู้ดูแล"
            className="w-6 h-6 rounded-md text-slate-400 hover:text-emerald-600 flex items-center justify-center"
          >
            <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-xs`} />
          </button>
        </div>

        {open && (
          <ul
            role="listbox"
            className="absolute z-40 mt-1 w-full max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl py-1 text-sm"
          >
            {visibleOptions.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-slate-400 space-y-1">
                {allActiveInOrgCount === 0 && !loading ? (
                  <p>
                    ยังไม่พบข้อมูลบุคลากรใน{' '}
                    <strong className="text-slate-600 dark:text-slate-300">
                      {selectedOrgName || 'ส่วนราชการที่เลือก'}
                    </strong>{' '}
                    ในฐานข้อมูล Portal SSO
                  </p>
                ) : (
                  <p>ไม่พบรายชื่อบุคลากรที่ตรงเงื่อนไข</p>
                )}
                {!showAllInOrg && defaultPosition && allActiveInOrgCount > 0 && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onToggleShowAll(true);
                    }}
                    className="block mx-auto mt-1.5 text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                  >
                    ปลดล็อกแสดงบุคลากรทั้งหมดในส่วนราชการนี้ ({allActiveInOrgCount} คน)
                  </button>
                )}
              </li>
            ) : (
              visibleOptions.map((p, idx) => {
                const isSelected = p.id === value;
                const isActive = idx === activeIndex;
                const fullName = formatCaretakerName(p);
                const posLevel = formatCaretakerPositionLevel(p);
                return (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(p);
                    }}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 transition ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-bold'
                        : isActive
                          ? 'bg-slate-100 dark:bg-slate-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{fullName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {posLevel || '-'}
                        {p.department_name ? ` · ${p.department_name}` : ''}
                      </p>
                    </div>
                    {isSelected && <i className="fa-solid fa-check text-emerald-600 text-xs shrink-0" />}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
