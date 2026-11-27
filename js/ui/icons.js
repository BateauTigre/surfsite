// Jeu d'icônes SVG maison (trait 1,75, extrémités arrondies). Pas d'emoji.

const stroke = (paths, size = 20, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${paths}</svg>`;

export const icon = {
  search: (s = 18) => stroke('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', s),
  refresh: (s = 20) => stroke('<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>', s),
  chevronDown: (s = 18) => stroke('<path d="m6 9 6 6 6-6"/>', s),
  arrowLeft: (s = 18) => stroke('<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>', s),
  arrowRight: (s = 16) => stroke('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', s),
  wave: (s = 16) => stroke('<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M6 10c0-3.5 3-6 7-6 2.5 0 4 1.3 4 3-1.6-.8-4-.2-4 2.2"/>', s),
  wind: (s = 16) => stroke('<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>', s),
  tide: (s = 16) => stroke('<path d="M2 12c3 0 3-4 6-4s3 8 6 8 3-4 6-4h2"/><path d="M12 3v3"/><path d="m10 5 2 2 2-2"/>', s),
  thermo: (s = 16) => stroke('<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z"/><path d="M12 9v7"/>', s),
  drop: (s = 16) => stroke('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>', s),
  clock: (s = 16) => stroke('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', s),
  user: (s = 16) => stroke('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>', s),
  alert: (s = 20) => stroke('<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>', s),
  info: (s = 20) => stroke('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>', s),
  pin: (s = 16) => stroke('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', s),
  map: (s = 16) => stroke('<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14"/><path d="M15 6v14"/>', s),
  board: (s = 16) => stroke('<path d="M17.5 3.5c2.5 2.5-.5 9-5 13.5S5.5 23 3.5 21 3 12 7.5 7.5s7.5-6.5 10-4Z"/><path d="m6 18 9-9"/>', s),
};

/** Flèche de direction : pointe dans le sens où va la houle / le vent (provenance + 180°). */
export function dirArrow(deg, size = 16) {
  if (deg == null || Number.isNaN(deg)) return '<span class="muted">–</span>';
  return `<svg class="dir-arrow" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${Math.round(deg)}deg)" aria-hidden="true" focusable="false"><path d="M12 21 6.5 13.5h3.8V3h3.4v10.5h3.8Z" fill="currentColor"/></svg>`;
}

// Étoile à 5 branches dans une boîte de 24×24 (rayon extérieur 10, intérieur 4,2).
function starPoints(cx, cy, R = 10, r = 4.2) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = ((-90 + k * 36) * Math.PI) / 180;
    const rad = k % 2 === 0 ? R : r;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

const toAttr = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

function fullStar(cx, cy, R, r) {
  return toAttr(starPoints(cx, cy, R, r));
}

function halfStar(cx, cy, R, r) {
  const p = starPoints(cx, cy, R, r);
  return toAttr([p[0], p[9], p[8], p[7], p[6], p[5]]);
}

/** Rangée de 5 étoiles (demi-étoiles possibles), avec libellé accessible. */
export function starsSvg(value, size = 16, label) {
  const v = Math.max(0, Math.min(5, Math.round((value ?? 0) * 2) / 2));
  const aria = label ?? `${String(v).replace('.', ',')} étoile${v > 1 ? 's' : ''} sur 5`;
  let bg = '';
  let on = '';
  for (let i = 0; i < 5; i++) {
    const cx = i * 24 + 12;
    bg += `<polygon class="st-bg" points="${fullStar(cx, 12, 10, 4.2)}"/>`;
    if (v >= i + 1) on += `<polygon class="st-on" points="${fullStar(cx, 12, 10, 4.2)}"/>`;
    else if (v >= i + 0.5) on += `<polygon class="st-on" points="${halfStar(cx, 12, 10, 4.2)}"/>`;
  }
  const w = size * 5;
  return `<svg class="stars" width="${w}" height="${size}" viewBox="0 0 120 24" role="img" aria-label="${aria}"><title>${aria}</title>${bg}${on}</svg>`;
}

/** Une seule étoile pleine (décorative). */
export function starIcon(size = 12) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon class="st-on" points="${fullStar(12, 12, 10, 4.2)}" fill="#efa810" stroke="#be7100" stroke-width="1"/></svg>`;
}

/** Pile verticale de 5 petites étoiles (ligne du bas du tableau horaire). */
export function stackStarsSvg(n) {
  const k = Math.max(0, Math.min(5, n | 0));
  let out = '';
  for (let i = 0; i < 5; i++) {
    const cy = 54 - i * 11;
    out += `<polygon class="${i < k ? 'st-on' : 'st-bg'}" points="${fullStar(7, cy, 5.2, 2.2)}"/>`;
  }
  return `<svg class="stack-stars" width="14" height="60" viewBox="0 0 14 60" aria-hidden="true" focusable="false">${out}</svg>`;
}

// Planches vues de dessus, nez à gauche (coordonnées dans une boîte de 64×24).
const BOARD_PATHS = {
  'board-long': 'M2 12 C2 6 12 4 32 4 C52 4 62 6 62 12 C62 18 52 20 32 20 C12 20 2 18 2 12 Z',
  'board-mid': 'M6 12 C6 7 16 4.5 33 4.5 C50 4.5 58 7 58 12 C58 17 50 19.5 33 19.5 C16 19.5 6 17 6 12 Z',
  'board-soft': 'M6 12 C6 5.5 16 3 33 3 C50 3 58 5.5 58 12 C58 18.5 50 21 33 21 C16 21 6 18.5 6 12 Z',
  'board-short': 'M8 12 C14 9 22 6 34 6 C46 6 54 8 56 10 L56 14 C54 16 46 18 34 18 C22 18 14 15 8 12 Z',
  'board-fish': 'M12 12 C15 7 24 4 34 4 C44 4 50 6 54 8 L50 12 L54 16 C50 18 44 20 34 20 C24 20 15 17 12 12 Z',
  'board-stepup': 'M4 12 C11 9 21 6 34 6 C47 6 56 8 58 10.5 L58 13.5 C56 16 47 18 34 18 C21 18 11 15 4 12 Z',
  'board-gun': 'M2 12 C10 9.5 22 7 33 7 C46 7 56 9.5 62 12 C56 14.5 46 17 33 17 C22 17 10 14.5 2 12 Z',
};

export function boardSvg(id) {
  const d = BOARD_PATHS[id] || BOARD_PATHS['board-short'];
  const stringer = id === 'board-soft' ? '<path d="M12 12 H52" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/>' : '<path d="M10 12 H54" stroke="#fff" stroke-width="1" fill="none" opacity=".7"/>';
  return `<svg viewBox="0 0 64 24" width="64" height="24" aria-hidden="true" focusable="false"><path d="${d}" fill="currentColor" fill-opacity="${id === 'board-soft' ? '0.25' : '0.9'}" stroke="currentColor" stroke-width="1.25"/>${stringer}</svg>`;
}

/** Icône météo à partir du code WMO. */
export function weatherIcon(code, isNight = false, size = 18) {
  const sun = isNight
    ? '<path d="M15.5 4.5a6.5 6.5 0 1 0 4 11.3A7 7 0 0 1 15.5 4.5Z"/>'
    : '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>';
  const cloud = '<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 9.4 4.3 4.3 0 0 0 7 18Z"/>';
  const smallSun = isNight
    ? '<path d="M9.5 3.2a4.4 4.4 0 1 0 3.8 6.8 4.8 4.8 0 0 1-3.8-6.8Z"/>'
    : '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.2M2 8h1.2M3.8 3.8l.9.9M12.2 3.8l-.9.9"/>';
  const rain = '<path d="M9 20.5l-1 2M13 20.5l-1 2M17 20.5l-1 2"/>';
  const snow = '<path d="M9 21h.01M13 22h.01M17 21h.01"/>';
  const bolt = '<path d="m13 14-2.5 4h3L11 22"/>';
  let paths;
  let label;
  if (code == null || Number.isNaN(code)) return '<span class="muted">–</span>';
  if (code === 0) [paths, label] = [sun, isNight ? 'Nuit claire' : 'Ensoleillé'];
  else if (code <= 2) [paths, label] = [smallSun + '<path d="M9 19h8.5a3.5 3.5 0 0 0 .4-7 4.8 4.8 0 0 0-8.9-1A3.7 3.7 0 0 0 9 19Z"/>', 'Éclaircies'];
  else if (code === 3) [paths, label] = [cloud, 'Couvert'];
  else if (code === 45 || code === 48) [paths, label] = ['<path d="M4 9h16M3 13h18M5 17h14"/>', 'Brouillard'];
  else if (code >= 51 && code <= 57) [paths, label] = ['<path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 6.4 4.3 4.3 0 0 0 7 15Z"/>' + rain, 'Bruine'];
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) [paths, label] = ['<path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 6.4 4.3 4.3 0 0 0 7 15Z"/>' + rain, code >= 80 ? 'Averses' : 'Pluie'];
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) [paths, label] = ['<path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 6.4 4.3 4.3 0 0 0 7 15Z"/>' + snow, 'Neige'];
  else if (code >= 95) [paths, label] = ['<path d="M7 13h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 4.4 4.3 4.3 0 0 0 7 13Z"/>' + bolt, 'Orage'];
  else [paths, label] = [cloud, 'Nuageux'];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${label}"><title>${label}</title>${paths}</svg>`;
}

export function weatherWord(code) {
  if (code == null || Number.isNaN(code)) return '';
  if (code === 0) return 'Ensoleillé';
  if (code <= 2) return 'Éclaircies';
  if (code === 3) return 'Couvert';
  if (code === 45 || code === 48) return 'Brouillard';
  if (code >= 51 && code <= 57) return 'Bruine';
  if (code >= 61 && code <= 67) return 'Pluie';
  if (code >= 71 && code <= 77) return 'Neige';
  if (code >= 80 && code <= 82) return 'Averses';
  if (code === 85 || code === 86) return 'Averses de neige';
  if (code >= 95) return 'Orage';
  return 'Nuageux';
}

/** Logo : une vague dans un carré arrondi. */
export const logoSvg = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="8" fill="#00678d"/><path d="M5 20.5c2.2 0 2.2-1.6 4.4-1.6s2.2 1.6 4.4 1.6 2.2-1.6 4.4-1.6 2.2 1.6 4.4 1.6 2.2-1.6 4.4-1.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M8 16.5c0-5 3.8-8.5 8.6-8.5 3.3 0 5.4 1.8 5.4 4.2-2.1-1.1-5.4-.3-5.4 3" stroke="#efa810" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
