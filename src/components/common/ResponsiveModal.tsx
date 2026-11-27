import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ResponsiveModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  preventBackdropClose?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ResponsiveModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
};

// Module-level modal stack so nested modals (e.g. VehiclePickerModal over ActivityRecordModal)
// keep scroll-lock accurate and route Escape strictly to the topmost dialog.
const openModalStack: string[] = [];

export function ResponsiveModal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = 'lg',
  children,
  footer,
  preventBackdropClose = false,
}: ResponsiveModalProps) {
  const modalId = useId();
  const [stackIndex, setStackIndex] = useState(0);

  useEffect(() => {
    if (!open) return undefined;

    if (!openModalStack.includes(modalId)) {
      openModalStack.push(modalId);
    }
    setStackIndex(Math.max(0, openModalStack.indexOf(modalId)));
    document.body.classList.add('bma-modal-open');

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (preventBackdropClose) return;
      const topId = openModalStack[openModalStack.length - 1];
      if (topId === modalId) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      const idx = openModalStack.indexOf(modalId);
      if (idx >= 0) openModalStack.splice(idx, 1);
      if (openModalStack.length === 0) {
        document.body.classList.remove('bma-modal-open');
      }
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose, modalId, preventBackdropClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ zIndex: 9990 + stackIndex }}
      onMouseDown={(e) => {
        if (!preventBackdropClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        className={`w-full ${SIZE_CLASSES[size]} max-h-[94dvh] sm:max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200 dark:border-[#244737] shadow-2xl overflow-hidden`}
      >
        <div className="px-5 py-4 bg-gradient-to-r from-[#00351B] via-[#005B2E] to-[#00744B] border-b-2 border-[#F6DE51] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-xl bg-white/15 border border-[#F6DE51]/40 flex items-center justify-center shrink-0 text-[#F6DE51]">
                <i className={`fa-solid ${icon}`} />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-extrabold text-base leading-tight truncate">{title}</h3>
              {subtitle && <p className="text-xs text-emerald-100/90 truncate mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={preventBackdropClose}
            aria-label="ปิดหน้าต่าง"
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-50 text-white flex items-center justify-center transition shrink-0"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#163024] border-t border-slate-200 dark:border-[#244737] flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
