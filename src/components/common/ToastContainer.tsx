import { useUiStore } from '@/stores/useUiStore';

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div id="bmaToastWrapper" aria-live="polite">
      {toasts.map((t) => {
        const icon =
          t.variant === 'error'
            ? 'fa-circle-xmark'
            : t.variant === 'warning'
              ? 'fa-triangle-exclamation'
              : t.variant === 'info'
                ? 'fa-circle-info'
                : 'fa-circle-check';
        const variantCls =
          t.variant === 'error'
            ? 'toast-error'
            : t.variant === 'warning'
              ? 'toast-warning'
              : t.variant === 'info'
                ? 'toast-info'
                : '';

        return (
          <div key={t.id} className={`bma-toast-item ${variantCls}`}>
            <i className={`fa-solid ${icon} text-base shrink-0`} />
            <span className="flex-1 text-sm leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="ปิดการแจ้งเตือน"
              className="opacity-75 hover:opacity-100 transition"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
