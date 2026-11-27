// Courbe de marée d'une journée : une seule série (pas de légende), filets discrets,
// repère « maintenant », réticule + bulle au survol et au clavier.

import { fmt, esc } from './format.js';
import { formatClock } from '../lib/time.js';

const H = 190;
const PAD = { top: 26, right: 14, bottom: 26, left: 36 };

function niceStep(range) {
  const raw = range / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
}

/** Monotone cubic (Fritsch-Carlson) pour une courbe douce sans dépassement. */
function smoothPath(pts) {
  const n = pts.length;
  if (n < 2) return '';
  const dx = [];
  const dy = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    dy.push(pts[i + 1][1] - pts[i][1]);
    m.push(dy[i] / dx[i]);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i][0];
    const y0 = pts[i][1];
    const x1 = pts[i + 1][0];
    const y1 = pts[i + 1][1];
    const h3 = dx[i] / 3;
    d += ` C${(x0 + h3).toFixed(1)},${(y0 + t[i] * h3).toFixed(1)} ${(x1 - h3).toFixed(1)},${(y1 - t[i + 1] * h3).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/**
 * Dessine la marée du jour dans `host`. Renvoie false s'il n'y a pas de données.
 */
export function renderTideChart(host, s, model, dayIndex) {
  const day = model.days[dayIndex];
  if (!day) return false;
  // Une heure de marge de chaque côté pour que la courbe touche les bords.
  const i0 = Math.max(0, day.start - 1);
  const i1 = Math.min(model.times.length - 1, day.end + 1);
  const pts = [];
  for (let i = i0; i <= i1; i++) {
    const v = s.sl[i];
    if (!Number.isNaN(v)) pts.push({ t: model.times[i], v });
  }
  if (pts.length < 6) return false;

  const width = Math.max(300, Math.round(host.clientWidth || 640));
  const t0 = model.times[day.start];
  const t1 = t0 + 24 * 3600;
  const vs = pts.map((p) => p.v);
  let vmin = Math.min(...vs);
  let vmax = Math.max(...vs);
  const padV = Math.max(0.2, (vmax - vmin) * 0.12);
  vmin -= padV;
  vmax += padV;
  const step = niceStep(vmax - vmin);
  const iw = width - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (t) => PAD.left + ((t - t0) / (t1 - t0)) * iw;
  const y = (v) => PAD.top + (1 - (v - vmin) / (vmax - vmin)) * ih;

  const clip = `tclip-${Math.random().toString(36).slice(2, 8)}`;
  const xy = pts.map((p) => [x(p.t), y(p.v)]);
  const line = smoothPath(xy);
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${(PAD.top + ih).toFixed(1)} L${xy[0][0].toFixed(1)},${(PAD.top + ih).toFixed(1)} Z`;

  let grid = '';
  for (let v = Math.ceil(vmin / step) * step; v <= vmax; v += step) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${yy}" y2="${yy}"/>`;
    grid += `<text x="${PAD.left - 6}" y="${(+yy + 4).toFixed(1)}" text-anchor="end">${fmt(v, step < 1 ? 1 : 0)}</text>`;
  }
  let xticks = '';
  for (let h = 0; h <= 24; h += 3) {
    const xx = x(t0 + h * 3600).toFixed(1);
    xticks += `<text x="${xx}" y="${H - 6}" text-anchor="middle">${h === 24 ? '' : `${h}h`}</text>`;
  }

  let night = '';
  const sun = s.sun.get(day.key);
  if (sun?.sunrise && sun?.sunset) {
    const xr = x(sun.sunrise);
    const xs = x(sun.sunset);
    night += `<rect class="night" x="${PAD.left}" y="${PAD.top}" width="${Math.max(0, xr - PAD.left).toFixed(1)}" height="${ih}"/>`;
    night += `<rect class="night" x="${xs.toFixed(1)}" y="${PAD.top}" width="${Math.max(0, width - PAD.right - xs).toFixed(1)}" height="${ih}"/>`;
  }

  const exts = s.extremes.filter((e) => e.t >= t0 && e.t < t1);
  let extMarks = '';
  for (const e of exts) {
    const ex = x(e.t);
    const ey = y(e.v);
    const label = `${e.type === 'high' ? 'PM' : 'BM'} ${formatClock(e.t)}`;
    const ty = e.type === 'high' ? ey - 10 : ey + 18;
    const anchor = ex < PAD.left + 40 ? 'start' : ex > width - PAD.right - 40 ? 'end' : 'middle';
    extMarks += `<g class="ext"><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4"/><text x="${ex.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}">${esc(label)}</text></g>`;
  }

  let nowMark = '';
  const nowT = Date.now() / 1000;
  if (nowT >= t0 && nowT < t1) {
    const nx = x(nowT).toFixed(1);
    nowMark = `<line class="now-line" x1="${nx}" x2="${nx}" y1="${PAD.top - 6}" y2="${PAD.top + ih}"/><text class="now-label" x="${nx}" y="${PAD.top - 10}" text-anchor="middle">Maintenant</text>`;
  }

  const ariaParts = exts.map((e) => `${e.type === 'high' ? 'pleine mer' : 'basse mer'} à ${formatClock(e.t)} (${fmt(e.v)} m)`);
  const aria = ariaParts.length ? `Courbe de marée : ${ariaParts.join(', ')}.` : 'Courbe de marée du jour.';

  host.innerHTML = `<svg viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img" aria-label="${esc(aria)}">
    <defs><clipPath id="${clip}"><rect x="${PAD.left}" y="0" width="${iw}" height="${H}"/></clipPath></defs>
    ${night}
    <g class="grid axis">${grid}</g>
    <g class="axis">${xticks}</g>
    <g clip-path="url(#${clip})"><path class="area" d="${area}"/><path class="line" d="${line}"/></g>
    ${nowMark}
    ${extMarks}
    <g class="hover" visibility="hidden"><line class="cross" y1="${PAD.top}" y2="${PAD.top + ih}"/><circle class="cross-dot" r="4.5"/></g>
    <rect class="hit" x="${PAD.left}" y="0" width="${iw}" height="${H}" fill="transparent" tabindex="0" aria-label="Explorer la courbe de marée avec les flèches gauche et droite"/>
  </svg><div class="chart-tip" hidden></div>`;

  const svg = host.querySelector('svg');
  const hover = svg.querySelector('.hover');
  const cross = hover.querySelector('.cross');
  const dot = hover.querySelector('.cross-dot');
  const tip = host.querySelector('.chart-tip');
  const hit = svg.querySelector('.hit');

  const valueAt = (t) => {
    for (let k = 0; k < pts.length - 1; k++) {
      if (t >= pts[k].t && t <= pts[k + 1].t) {
        const f = (t - pts[k].t) / (pts[k + 1].t - pts[k].t);
        return pts[k].v + f * (pts[k + 1].v - pts[k].v);
      }
    }
    return null;
  };
  let cursorT = null;
  const show = (t) => {
    const v = valueAt(t);
    if (v == null) return;
    cursorT = t;
    const px = x(t);
    const py = y(v);
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    dot.setAttribute('cx', px);
    dot.setAttribute('cy', py);
    hover.setAttribute('visibility', 'visible');
    const scale = host.clientWidth / width || 1;
    tip.hidden = false;
    tip.innerHTML = `<strong>${fmt(v)} m</strong><br>${formatClock(t)}`;
    const left = Math.min(Math.max(px * scale, 48), host.clientWidth - 48);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, py * scale - 58)}px`;
  };
  const hide = () => {
    hover.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  hit.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * width;
    const t = t0 + ((px - PAD.left) / iw) * (t1 - t0);
    show(Math.round(t / 300) * 300);
  });
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('blur', hide);
  hit.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const base = cursorT ?? (nowT >= t0 && nowT < t1 ? nowT : t0 + 12 * 3600);
    const next = Math.min(t1 - 900, Math.max(t0, base + (ev.key === 'ArrowRight' ? 900 : -900)));
    show(next);
  });
  return true;
}
