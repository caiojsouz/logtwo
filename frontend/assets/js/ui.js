export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function initials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export function formatDuration(minutes) {
  const total = Number(minutes) || 0;
  if (total <= 0) return '—';

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${String(mins).padStart(2, '0')}min`;
}

export function formatHoursShort(minutes) {
  const total = Number(minutes) || 0;
  if (total <= 0) return '0h';

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  return mins === 0 ? `${hours}h` : `${hours}h${String(mins).padStart(2, '0')}`;
}

export function formatSince(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const formatted = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
  }).format(date);

  return formatted.replace('.', '');
}

export function formatRelativeTime(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

  const units = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];

  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
  }

  return 'agora mesmo';
}

export function daysUntil(isoDate) {
  if (!isoDate) return null;

  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function debounce(fn, wait = 350) {
  let timer = null;

  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function starSvg(className = 'h-4 w-4') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.4l2.98 6.04 6.67.97-4.83 4.7 1.14 6.64L12 17.62l-5.96 3.13 1.14-6.64-4.83-4.7 6.67-.97L12 2.4z"/></svg>`;
}

export function staticStars(rating, { size = 'h-3.5 w-3.5', emptyClass = 'text-zinc-400/25' } = {}) {
  const safeRating = Number(rating) || 0;

  return Array.from({ length: 5 }, (_, index) => {
    const color = index < safeRating ? 'text-accent' : emptyClass;
    return `<span class="${color}">${starSvg(size)}</span>`;
  }).join('');
}

export function toast(message, type = 'success') {
  let container = document.querySelector('[data-toast-container]');

  if (!container) {
    container = document.createElement('div');
    container.dataset.toastContainer = '';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const element = document.createElement('div');
  element.className = `logtwo-toast ${type === 'error' ? 'is-error' : ''}`;
  element.setAttribute('role', 'status');

  const dot = document.createElement('span');
  dot.className = 'toast-dot';
  const label = document.createElement('span');
  label.textContent = message;

  element.append(dot, label);
  container.appendChild(element);

  requestAnimationFrame(() => element.classList.add('is-visible'));

  window.setTimeout(() => {
    element.classList.remove('is-visible');
    window.setTimeout(() => element.remove(), 300);
  }, 3600);
}

export function showBootError(message) {
  const boot = document.querySelector('[data-boot]');
  if (!boot) return;

  boot.classList.remove('is-hidden');
  const status = boot.querySelector('[data-boot-status]');
  const spinner = boot.querySelector('[data-boot-spinner]');

  if (spinner) spinner.classList.add('hidden');
  if (status) {
    status.textContent = message;
    status.classList.remove('text-zinc-400');
    status.classList.add('text-danger');
  }
}

export function hideBootScreen() {
  const boot = document.querySelector('[data-boot]');
  if (!boot) return;

  boot.classList.add('is-hidden');
  window.setTimeout(() => boot.remove(), 500);
}
