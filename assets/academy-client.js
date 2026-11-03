// Shared browser helpers for Creator Academy pages.
import {
  getUser, login, logout, signup, refreshSession, handleAuthCallback,
  requestPasswordRecovery, updateUser, acceptInvite, getSettings,
} from '/assets/vendor/identity.js';

export { getUser, login, logout, signup, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite, getSettings };

/** Call a site function with the logged-in session. Throws Error(message) on failure. */
export async function api(path, body) {
  try { await refreshSession(); } catch { /* not logged in */ }
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Escape text before putting it into HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Plain text with line breaks and safe links. */
export const rich = (s) =>
  esc(s)
    .replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');

export const fmtDate = (v, opts = { month: 'long', day: 'numeric', year: 'numeric' }) => {
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', opts);
};

export const fmtDateTime = (v) => {
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
};

export function notice(el, text, kind = 'info') {
  el.className = `notice notice-${kind}`;
  el.textContent = text;
  el.hidden = !text;
}

export async function busy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'One moment…';
  try { return await fn(); } finally { button.disabled = false; button.textContent = label; }
}

/** Send the browser to Stripe Checkout for the Academy. */
export async function startCheckout(plan) {
  const { url } = await api('/api/academy/checkout', { plan });
  location.href = url;
}
