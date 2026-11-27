// Formatage français et petites aides DOM.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe une chaîne avant de l'insérer dans du HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Nombre au format français : 1,5 */
export function fmt(value, digits = 1) {
  if (!isNum(value)) return '–';
  return value.toFixed(digits).replace('.', ',').replace('-', '−');
}

/** Hauteur de vague arrondie au 0,1 m. */
export function fmtM(value, digits = 1) {
  return isNum(value) ? `${fmt(value, digits)} m` : '–';
}

/** Fourchette de hauteur au déferlement : « 1,2–1,6 m ». */
export function fmtSurfRange(S) {
  if (!isNum(S)) return '–';
  if (S < 0.2) return 'Flat';
  const lo = Math.max(0.1, Math.round(S * 0.85 * 10) / 10);
  const hi = Math.max(lo + 0.1, Math.round(S * 1.15 * 10) / 10);
  return `${fmt(lo)}–${fmt(hi)} m`;
}

export function fmtInt(value) {
  return isNum(value) ? String(Math.round(value)).replace('-', '−') : '–';
}

export function fmtScore(score) {
  return isNum(score) ? fmt(score, 1) : '–';
}

export function plural(n, one, many) {
  return n > 1 ? many : one;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}
