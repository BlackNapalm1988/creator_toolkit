// Shared helpers for SPA feature modules.

export function showLoadingState(containerEl) {
  if (!containerEl) return;
  let overlay = containerEl.querySelector('[data-feature-loading]');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.setAttribute('data-feature-loading', 'true');
    overlay.className = 'hybrid-loading';
    overlay.innerHTML = `
      <div class="hybrid-spinner"></div>
      <div class="hybrid-loading-text">Loading tool…</div>
    `;
    containerEl.appendChild(overlay);
  }
  overlay.classList.remove('hidden');
}

export function hideLoadingState(containerEl) {
  if (!containerEl) return;
  const overlay = containerEl.querySelector('[data-feature-loading]');
  if (overlay) overlay.classList.add('hidden');
}

export function showModuleError(containerEl, message) {
  if (!containerEl) return;
  hideLoadingState(containerEl);
  let box = containerEl.querySelector('[data-feature-error]');
  if (!box) {
    box = document.createElement('div');
    box.setAttribute('data-feature-error', 'true');
    box.className = 'hybrid-error';
    containerEl.appendChild(box);
  }
  box.innerHTML = `
    <p>${message}</p>
  `;
  box.classList.remove('hidden');
}

export function toast(message, opts = {}) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  const type = opts.type || 'info';
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  const remove = () => {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };
  const ttl = typeof opts.ttl === 'number' ? opts.ttl : 3500;
  setTimeout(remove, ttl);
}

export async function readErrorMessage(resp, fallback = 'Request failed') {
  if (!resp) return fallback;
  try {
    const ctype = (resp.headers?.get('Content-Type') || '').toLowerCase();
    if (ctype.includes('application/json')) {
      const j = await resp.json();
      return j?.detail || j?.error || fallback;
    }
    const txt = await resp.text();
    return txt || fallback;
  } catch {
    return fallback;
  }
}

export function formatRelativeTime(isoOrMs) {
  if (!isoOrMs) return '';
  const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 30000) return 'just now';
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return `${s}s ago`;
}
