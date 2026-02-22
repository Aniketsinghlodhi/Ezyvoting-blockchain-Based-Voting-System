/**
 * Lightweight alert utility for the EzyVoting frontend.
 * Renders a fixed-position toast that auto-dismisses.
 */

const ALERT_STYLES = {
  success: { bg: '#ECFDF5', border: '#6EE7B7', color: '#065F46' },
  error:   { bg: '#FEF2F2', border: '#FCA5A5', color: '#991B1B' },
  info:    { bg: '#EFF6FF', border: '#93C5FD', color: '#1E40AF' },
  warning: { bg: '#FFFBEB', border: '#FCD34D', color: '#92400E' },
};

let currentToast = null;

/**
 * Show a toast-style alert.
 * @param {string} message  - text to display
 * @param {'success'|'error'|'info'|'warning'} type - alert style
 * @param {number} duration - ms before auto-dismiss (0 = manual dismiss on next call)
 */
export function showAlert(message, type = 'info', duration = 3000) {
  // Remove previous toast if any
  if (currentToast && currentToast.parentNode) {
    currentToast.parentNode.removeChild(currentToast);
  }

  if (typeof document === 'undefined') return; // SSR guard

  const style = ALERT_STYLES[type] || ALERT_STYLES.info;

  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    zIndex: '9999',
    padding: '0.75rem 1.25rem',
    borderRadius: '0.5rem',
    border: `1px solid ${style.border}`,
    backgroundColor: style.bg,
    color: style.color,
    fontFamily: 'system-ui, sans-serif',
    fontSize: '0.9rem',
    maxWidth: '400px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    transition: 'opacity 0.3s ease',
    opacity: '1',
  });

  document.body.appendChild(el);
  currentToast = el;

  if (duration > 0) {
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (currentToast === el) currentToast = null;
      }, 300);
    }, duration);
  }
}
