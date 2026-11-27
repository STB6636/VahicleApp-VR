import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  THAI_MONTHS_LONG,
  THAI_WEEKDAYS_SHORT,
  formatThaiDate,
  getCurrentYearBeBangkok,
  getTodayIsoBangkok,
  parseThaiDateInput,
} from '@/lib/thaiDate';

export interface ThaiDatePickerProps {
  value: string;
  onChange: (isoDate: string) => void;
  onInvalidChange?: (invalid: boolean, errorMessage: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minYearBe?: number;
  maxYearBe?: number;
  showThaiPreview?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  compact?: boolean;
}

export const THAI_DATE_REVEAL_ERROR_EVENT = 'thai-date-reveal-error';

export function findInvalidThaiDateInput(
  root: ParentNode | null | undefined
): HTMLInputElement | null {
  if (!root) return null;
  return root.querySelector<HTMLInputElement>('input[data-thai-date-invalid="true"]');
}

export function focusInvalidThaiDateInput(
  root: ParentNode | null | undefined
): HTMLInputElement | null {
  const invalidInput = findInvalidThaiDateInput(root);
  if (!invalidInput) return null;
  invalidInput.dispatchEvent(new CustomEvent(THAI_DATE_REVEAL_ERROR_EVENT));
  invalidInput.focus();
  invalidInput.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  return invalidInput;
}

const POPOVER_WIDTH = 296;
const POPOVER_HEIGHT_EST = 336;
const VIEWPORT_PAD = 8;

function normalizeTypedDateText(raw: string): string {
  const thaiToArabic = raw.trim().replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
  if (/^\d{8}$/.test(thaiToArabic)) {
    const first4 = Number(thaiToArabic.slice(0, 4));
    const last4 = Number(thaiToArabic.slice(4, 8));
    if ((last4 >= 2400 && last4 <= 2700) || (last4 >= 1900 && last4 <= 2200)) {
      return `${thaiToArabic.slice(0, 2)}/${thaiToArabic.slice(2, 4)}/${thaiToArabic.slice(4, 8)}`;
    }
    if ((first4 >= 1900 && first4 <= 2200) || (first4 >= 2400 && first4 <= 2700)) {
      return `${thaiToArabic.slice(0, 4)}-${thaiToArabic.slice(4, 6)}-${thaiToArabic.slice(6, 8)}`;
    }
  }
  return thaiToArabic;
}

function validateTypedThaiDate(
  rawText: string,
  minYearBe: number,
  maxYearBe: number
): { valid: boolean; error: string; parsed: ReturnType<typeof parseThaiDateInput> } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { valid: true, error: '', parsed: null };
  }
  const normalized = normalizeTypedDateText(trimmed);
  const parsed = parseThaiDateInput(normalized);
  if (!parsed) {
    return {
      valid: false,
      error: 'กรุณาระบุวันที่ พ.ศ. ให้ถูกต้อง เช่น 01/10/2569',
      parsed: null,
    };
  }
  if (parsed.yearBe < minYearBe || parsed.yearBe > maxYearBe) {
    return {
      valid: false,
      error: `ปี พ.ศ. ต้องอยู่ระหว่าง ${minYearBe}–${maxYearBe}`,
      parsed: null,
    };
  }
  return { valid: true, error: '', parsed };
}

function getDaysInMonthCe(yearCe: number, monthIndex0: number): number {
  return new Date(Date.UTC(yearCe, monthIndex0 + 1, 0)).getUTCDate();
}

function getFirstWeekdayCe(yearCe: number, monthIndex0: number): number {
  return new Date(Date.UTC(yearCe, monthIndex0, 1)).getUTCDay();
}

export function ThaiDatePicker({
  value,
  onChange,
  onInvalidChange,
  placeholder = 'วว/ดด/พ.ศ.',
  disabled = false,
  minYearBe = 2450,
  maxYearBe = 2620,
  showThaiPreview = false,
  className = '',
  id,
  ariaLabel,
  compact = false,
}: ThaiDatePickerProps) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const onInvalidChangeRef = useRef(onInvalidChange);
  onInvalidChangeRef.current = onInvalidChange;
  const lastInvalidRef = useRef<{ invalid: boolean; error: string }>({ invalid: false, error: '' });

  const [inputText, setInputText] = useState<string>(() => (value ? formatThaiDate(value, 'numeric') : ''));
  const inputTextRef = useRef<string>(inputText);
  inputTextRef.current = inputText;
  const [inputError, setInputError] = useState<string>('');
  const [open, setOpen] = useState<boolean>(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: POPOVER_WIDTH,
  });

  const todayIso = useMemo(() => getTodayIsoBangkok(), []);
  const currentYearBe = useMemo(() => getCurrentYearBeBangkok(), []);

  const initialView = useMemo(() => {
    const parsed = value ? parseThaiDateInput(value) : parseThaiDateInput(todayIso);
    if (parsed) {
      return { yearBe: parsed.yearBe, monthIndex: parsed.month - 1 };
    }
    return { yearBe: currentYearBe, monthIndex: 0 };
  }, [value, todayIso, currentYearBe]);

  const [viewYearBe, setViewYearBe] = useState<number>(initialView.yearBe);
  const [viewMonthIndex, setViewMonthIndex] = useState<number>(initialView.monthIndex);

  const validation = useMemo(
    () => validateTypedThaiDate(inputText, minYearBe, maxYearBe),
    [inputText, minYearBe, maxYearBe]
  );
  const isInvalid = !disabled && (Boolean(inputError) || !validation.valid);
  const activeError = inputError || validation.error;

  useEffect(() => {
    const currentParsed = validateTypedThaiDate(inputTextRef.current, minYearBe, maxYearBe);
    if (value && currentParsed.valid && currentParsed.parsed?.isoCe === value) {
      setInputError('');
      return;
    }
    setInputText(value ? formatThaiDate(value, 'numeric') : '');
    setInputError('');
  }, [value, minYearBe, maxYearBe]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    const handleReveal = () => {
      if (disabled) return;
      const check = validateTypedThaiDate(inputTextRef.current, minYearBe, maxYearBe);
      if (!check.valid && check.error) {
        setInputError(check.error);
      }
    };
    el.addEventListener(THAI_DATE_REVEAL_ERROR_EVENT, handleReveal);
    return () => el.removeEventListener(THAI_DATE_REVEAL_ERROR_EVENT, handleReveal);
  }, [disabled, minYearBe, maxYearBe]);

  useEffect(() => {
    const nextError = isInvalid ? activeError : '';
    if (
      lastInvalidRef.current.invalid !== isInvalid ||
      lastInvalidRef.current.error !== nextError
    ) {
      lastInvalidRef.current = { invalid: isInvalid, error: nextError };
      onInvalidChangeRef.current?.(isInvalid, nextError);
    }
  }, [isInvalid, activeError]);

  useEffect(() => {
    return () => {
      if (lastInvalidRef.current.invalid) {
        lastInvalidRef.current = { invalid: false, error: '' };
        onInvalidChangeRef.current?.(false, '');
      }
    };
  }, []);

  const updatePopoverPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.width > 0 && rect.height > 0 && (rect.bottom < 0 || rect.top > vh)) {
      setOpen(false);
      return;
    }

    const popWidth = Math.min(POPOVER_WIDTH, Math.max(220, vw - VIEWPORT_PAD * 2));
    const popHeight = Math.min(popoverRef.current?.offsetHeight || POPOVER_HEIGHT_EST, vh - VIEWPORT_PAD * 2);

    const spaceBelow = vh - rect.bottom - VIEWPORT_PAD;
    const spaceAbove = rect.top - VIEWPORT_PAD;
    let top = rect.bottom + 6;
    if (spaceBelow < popHeight && spaceAbove > spaceBelow) {
      top = rect.top - popHeight - 6;
    }
    const maxTop = Math.max(VIEWPORT_PAD, vh - popHeight - VIEWPORT_PAD);
    top = Math.min(maxTop, Math.max(VIEWPORT_PAD, top));

    let left = rect.left;
    if (left + popWidth > vw - VIEWPORT_PAD) {
      left = rect.right - popWidth;
    }
    const maxLeft = Math.max(VIEWPORT_PAD, vw - popWidth - VIEWPORT_PAD);
    left = Math.min(maxLeft, Math.max(VIEWPORT_PAD, left));

    setCoords({ top, left, width: popWidth });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
  }, [open, updatePopoverPosition, viewYearBe, viewMonthIndex]);

  useEffect(() => {
    if (!open) return undefined;

    const handleScrollOrResize = () => updatePopoverPosition();
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      if (
        target instanceof HTMLElement &&
        target.getAttribute('role') === 'dialog' &&
        target.getAttribute('aria-modal') === 'true'
      ) {
        e.stopPropagation();
      }
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, updatePopoverPosition]);

  const openPopover = () => {
    if (disabled) return;
    const parsed = value ? parseThaiDateInput(value) : parseThaiDateInput(todayIso);
    if (parsed) {
      setViewYearBe(Math.min(maxYearBe, Math.max(minYearBe, parsed.yearBe)));
      setViewMonthIndex(parsed.month - 1);
    } else {
      setViewYearBe(Math.min(maxYearBe, Math.max(minYearBe, currentYearBe)));
      setViewMonthIndex(0);
    }
    setOpen((prev) => !prev);
  };

  const commitTypedValue = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      setInputError('');
      setInputText('');
      if (value) onChange('');
      return;
    }
    const check = validateTypedThaiDate(trimmed, minYearBe, maxYearBe);
    if (!check.valid || !check.parsed) {
      setInputError(check.error);
      return;
    }
    setInputError('');
    setInputText(check.parsed.displayBe);
    onChange(check.parsed.isoCe);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setInputError('');
      if (value) onChange('');
      return;
    }
    const maybeFormatted = normalizeTypedDateText(trimmed);
    const check = validateTypedThaiDate(trimmed, minYearBe, maxYearBe);
    if (check.valid && check.parsed) {
      setInputError('');
      const arabicTrimmed = trimmed.replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
      const shouldAutoFormat =
        check.parsed.convertedThaiDigits ||
        /^\d{8}$/.test(arabicTrimmed) ||
        /^\d{2}\/\d{2}\/\d{4}$/.test(arabicTrimmed) ||
        /^\d{4}-\d{2}-\d{2}$/.test(arabicTrimmed);
      if (shouldAutoFormat) {
        setInputText(check.parsed.displayBe);
      }
      if (check.parsed.isoCe !== value) {
        onChange(check.parsed.isoCe);
      }
      return;
    }
    const looksComplete =
      /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(maybeFormatted) ||
      /^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(maybeFormatted);
    if (looksComplete) {
      setInputError(check.error);
    } else if (inputError) {
      setInputError('');
    }
  };

  const handleSelectDay = (dayNum: number) => {
    const yearCe = viewYearBe - 543;
    const mm = String(viewMonthIndex + 1).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    const iso = `${yearCe}-${mm}-${dd}`;
    setInputError('');
    setInputText(`${dd}/${mm}/${viewYearBe}`);
    onChange(iso);
    setOpen(false);
  };

  const handlePrevMonth = () => {
    if (viewMonthIndex === 0) {
      if (viewYearBe > minYearBe) {
        setViewYearBe(viewYearBe - 1);
        setViewMonthIndex(11);
      }
    } else {
      setViewMonthIndex(viewMonthIndex - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonthIndex === 11) {
      if (viewYearBe < maxYearBe) {
        setViewYearBe(viewYearBe + 1);
        setViewMonthIndex(0);
      }
    } else {
      setViewMonthIndex(viewMonthIndex + 1);
    }
  };

  const handlePickToday = () => {
    const today = getTodayIsoBangkok();
    const parsed = parseThaiDateInput(today);
    if (!parsed || parsed.yearBe < minYearBe || parsed.yearBe > maxYearBe) {
      setInputError(`วันนี้ (พ.ศ. ${parsed?.yearBe ?? currentYearBe}) อยู่นอกช่วงปี ${minYearBe}–${maxYearBe}`);
      setOpen(false);
      return;
    }
    setInputError('');
    setInputText(parsed.displayBe);
    onChange(today);
    setOpen(false);
  };

  const handleClear = () => {
    setInputError('');
    setInputText('');
    onChange('');
    setOpen(false);
  };

  const yearOptions = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYearBe; y >= minYearBe; y -= 1) {
      list.push(y);
    }
    return list;
  }, [minYearBe, maxYearBe]);

  const calendarCells = useMemo(() => {
    const yearCe = viewYearBe - 543;
    const firstWeekday = getFirstWeekdayCe(yearCe, viewMonthIndex);
    const totalDays = getDaysInMonthCe(yearCe, viewMonthIndex);
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= totalDays; d += 1) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYearBe, viewMonthIndex]);

  const selectedIso = value || '';

  const popoverNode =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="ปฏิทินพุทธศักราช"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
            }}
            className="z-[9998] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-3 text-slate-800 dark:text-slate-100 select-none"
          >
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="เดือนก่อนหน้า"
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center justify-center transition shrink-0"
              >
                <i className="fa-solid fa-chevron-left text-xs" />
              </button>

              <div className="flex items-center gap-1 flex-1 min-w-0">
                <select
                  aria-label="เลือกเดือน"
                  value={viewMonthIndex}
                  onChange={(e) => setViewMonthIndex(Number(e.target.value))}
                  className="flex-1 min-w-0 px-1.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {THAI_MONTHS_LONG.map((mName, idx) => (
                    <option key={mName} value={idx}>
                      {mName}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="เลือกปีพุทธศักราช"
                  value={viewYearBe}
                  onChange={(e) => setViewYearBe(Number(e.target.value))}
                  className="w-[4.75rem] px-1.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {yearOptions.map((yBe) => (
                    <option key={yBe} value={yBe}>
                      พ.ศ. {yBe}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="เดือนถัดไป"
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center justify-center transition shrink-0"
              >
                <i className="fa-solid fa-chevron-right text-xs" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {THAI_WEEKDAYS_SHORT.map((wd, idx) => (
                <div
                  key={wd}
                  className={`text-center text-[11px] font-bold py-1 ${
                    idx === 0
                      ? 'text-rose-500'
                      : idx === 6
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {calendarCells.map((dayNum, idx) => {
                if (dayNum === null) {
                  return <div key={`empty-${idx}`} className="h-8" />;
                }
                const yearCe = viewYearBe - 543;
                const cellIso = `${yearCe}-${String(viewMonthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = cellIso === selectedIso;
                const isToday = cellIso === todayIso;

                return (
                  <button
                    key={cellIso}
                    type="button"
                    onClick={() => handleSelectDay(dayNum)}
                    className={`h-8 w-full rounded-lg text-xs font-semibold transition flex items-center justify-center ${
                      isSelected
                        ? 'bg-[#00744B] text-white shadow-xs font-bold'
                        : isToday
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500 font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePickToday}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition"
              >
                <i className="fa-solid fa-calendar-day mr-1" />
                วันนี้ ({formatThaiDate(todayIso, 'short')})
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
              >
                ล้างค่า
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={className}>
      <div ref={triggerRef} className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          aria-label={ariaLabel || placeholder}
          aria-invalid={isInvalid || undefined}
          data-thai-date-invalid={isInvalid ? 'true' : undefined}
          disabled={disabled}
          value={inputText}
          onChange={handleInputChange}
          onBlur={() => commitTypedValue(inputText)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTypedValue(inputText);
            }
          }}
          placeholder={placeholder}
          className={`w-full rounded-xl border ${
            inputError
              ? 'border-rose-400 focus:ring-rose-500'
              : 'border-slate-300 dark:border-slate-700 focus:ring-emerald-500'
          } bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 ${
            compact ? 'pl-2.5 pr-14 py-1.5 text-xs' : 'pl-3 pr-16 py-2 text-sm'
          } focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed`}
        />

        <div className="absolute right-1.5 flex items-center gap-0.5">
          {inputText && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={handleClear}
              aria-label="ล้างวันที่"
              className="w-6 h-6 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition"
            >
              <i className="fa-solid fa-xmark text-[11px]" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={openPopover}
            aria-label="เปิดปฏิทิน พ.ศ."
            className="w-7 h-7 rounded-lg text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 flex items-center justify-center transition disabled:opacity-40"
          >
            <i className="fa-regular fa-calendar text-sm" />
          </button>
        </div>
      </div>

      {inputError && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1">
          <i className="fa-solid fa-circle-exclamation" />
          <span>{inputError}</span>
        </p>
      )}

      {showThaiPreview && !isInvalid && value && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
          <i className="fa-regular fa-calendar-check mr-1" />
          {formatThaiDate(value, 'long')}
        </p>
      )}

      {popoverNode}
    </div>
  );
}
