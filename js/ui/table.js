// Tableau horaire façon Windguru, plus lisible : une colonne par heure, une ligne par donnée,
// et la note des vagues en étoiles tout en bas.

import { esc, fmt, fmtInt, isNum } from './format.js';
import { dirArrow, stackStarsSvg, weatherIcon } from './icons.js';
import { compass } from '../lib/geo.js';
import { starsOf, waveClass, windClass, WIND_LABELS, WIND_SHORT } from '../lib/rating.js';
import { tideTrend } from '../lib/tide.js';
import { daylightIndices } from '../lib/process.js';

const val = (arr, i) => {
  const v = arr?.[i];
  return v == null || Number.isNaN(v) ? null : v;
};

function columnsFor(model, mode, dayIndex) {
  const cols = [];
  const days = mode === 'week' ? model.days : [model.days[dayIndex]];
  const wanted = mode === 'week' ? new Set([6, 9, 12, 15, 18, 21]) : null;
  for (const d of days) {
    let first = true;
    for (let i = d.start; i <= d.end; i++) {
      const h = model.hours[i].hour;
      if (mode === 'week' ? !wanted.has(h) : h < 6 || h > 21) continue;
      cols.push({ i, day: d, dayStart: first && mode === 'week' });
      first = false;
    }
  }
  return cols;
}

function isNightAt(s, model, i) {
  const key = model.hours[i].key;
  const sun = s.sun.get(key);
  const t = model.times[i];
  if (!sun?.sunrise || !sun?.sunset) {
    const h = model.hours[i].hour;
    return h < 7 || h > 19;
  }
  return t + 3600 <= sun.sunrise || t >= sun.sunset;
}

function nearExtreme(s, model, i) {
  const t = model.times[i];
  return s.extremes.find((e) => Math.abs(e.t - t) <= 1800) || null;
}

/** HTML du tableau. `best` = indices du meilleur créneau du jour sélectionné. */
export function forecastTable(spot, s, model, { mode = 'day', dayIndex = 0 } = {}) {
  const cols = columnsFor(model, mode, dayIndex);
  if (!cols.length) return '<p class="empty-state">Pas de prévision horaire pour ce jour.</p>';
  const nowI = model.now;
  const bestSet = new Set();
  if (mode === 'day') {
    const d = s.daily[dayIndex];
    if (d?.available) for (let i = d.start; i <= d.end; i++) bestSet.add(i);
  }
  const daylight = new Set(model.days.flatMap((d) => daylightIndices(s, d, model)));

  const cls = (c, extra = '') => {
    const out = [extra];
    if (c.dayStart) out.push('day-start');
    if (isNightAt(s, model, c.i)) out.push('is-night');
    if (c.i === nowI) out.push('is-now');
    else if (nowI >= 0 && c.i < nowI && model.hours[c.i].key === model.days[0].key) out.push('is-past');
    if (bestSet.has(c.i)) out.push('is-best');
    return out.filter(Boolean).join(' ');
  };

  const head = [];
  if (mode === 'week') {
    let row = '<tr class="fc-dayrow"><th scope="col"><span class="visually-hidden">Jour</span></th>';
    let prev = null;
    let span = 0;
    const flush = () => {
      if (!prev) return;
      row += `<th colspan="${span}" scope="colgroup" class="day-start"><button type="button" data-goto-day="${prev.index}">${esc(prev.compact)}</button></th>`;
    };
    for (const c of cols) {
      if (prev && c.day !== prev) {
        flush();
        span = 0;
      }
      prev = c.day;
      span++;
    }
    flush();
    head.push(`${row}</tr>`);
  }
  head.push(`<tr><th scope="col"><span class="visually-hidden">Donnée</span></th>${cols
    .map((c) => `<th scope="col" class="${cls(c)}">${c.i === nowI ? 'Maint.' : `${model.hours[c.i].hour}h`}</th>`)
    .join('')}</tr>`);

  const row = (label, sub, cellFn, rowClass = '') =>
    `<tr class="${rowClass}"><th scope="row">${label}${sub ? `<small>${sub}</small>` : ''}</th>${cols.map((c) => cellFn(c)).join('')}</tr>`;

  const rows = [];
  rows.push(
    row('Vagues', 'au bord, en m', (c) => {
      const S = val(s.surf, c.i);
      if (S == null) return `<td class="${cls(c)}">–</td>`;
      return `<td class="${cls(c, 'cell-wave')}" data-w="${waveClass(S)}" title="Vagues estimées au déferlement : ${fmt(S)} m">${fmt(S)}</td>`;
    }),
  );
  rows.push(
    row('Houle', 'au large, en m', (c) => {
      const h = val(s.hsw, c.i) ?? val(s.hs, c.i);
      return `<td class="${cls(c)}">${h == null ? '–' : fmt(h)}</td>`;
    }),
  );
  rows.push(
    row('Période', 'en s', (c) => {
      const t = val(s.tsw, c.i) ?? val(s.tp, c.i);
      return `<td class="${cls(c)}">${t == null ? '–' : fmtInt(t)}</td>`;
    }),
  );
  rows.push(
    row('Direction houle', '', (c) => {
      const d = val(s.dsw, c.i) ?? val(s.dir, c.i);
      return `<td class="${cls(c, 'cell-dir')}" title="Houle venant du ${esc(compass(d))}">${dirArrow(d)}<small>${esc(compass(d))}</small></td>`;
    }),
  );
  rows.push(
    row('Vent', 'km/h · rafales', (c) => {
      const w = val(s.ws, c.i);
      const g = val(s.wg, c.i);
      const f = val(s.windF, c.i);
      if (w == null) return `<td class="${cls(c)}">–</td>`;
      const cat = s.windCat[c.i];
      return `<td class="${cls(c, 'cell-wind')}" data-v="${windClass(f)}" title="Vent ${fmtInt(w)} km/h, rafales ${fmtInt(g)} km/h · ${esc(WIND_LABELS[cat] || '')}">${fmtInt(w)}<small>${fmtInt(g)}</small></td>`;
    }),
  );
  rows.push(
    row('Direction vent', 'off · side · on', (c) => {
      const d = val(s.wd, c.i);
      const cat = s.windCat[c.i];
      return `<td class="${cls(c, 'cell-dir')}" title="Vent venant du ${esc(compass(d))} · ${esc(WIND_LABELS[cat] || '')}">${dirArrow(d)}<small>${esc(WIND_SHORT[cat] || compass(d))}</small></td>`;
    }),
  );
  if (s.tideUseful) {
    rows.push(
      row('Marée', 'en m (niveau moyen)', (c) => {
        const v = val(s.sl, c.i);
        if (v == null) return `<td class="${cls(c)}">–</td>`;
        const ex = nearExtreme(s, model, c.i);
        const trend = tideTrend(s.sl, c.i);
        const tag = ex ? `<small>${ex.type === 'high' ? 'PM' : 'BM'}</small>` : `<small>${trend > 0 ? '↑' : trend < 0 ? '↓' : ''}</small>`;
        return `<td class="${cls(c, 'cell-tide')}">${fmt(v)}${tag}</td>`;
      }),
    );
  }
  rows.push(
    row('Air', '°C', (c) => {
      const t = val(s.t2m, c.i);
      return `<td class="${cls(c)}">${t == null ? '–' : fmtInt(t)}</td>`;
    }),
  );
  rows.push(
    row('Ciel', '', (c) => {
      const code = val(s.wcode, c.i);
      return `<td class="${cls(c)}">${weatherIcon(code, isNightAt(s, model, c.i), 18)}</td>`;
    }),
  );
  rows.push(
    row(
      'Note des vagues',
      '0 à 5 étoiles',
      (c) => {
        const sc = val(s.score, c.i);
        const n = starsOf(sc);
        const out = !daylight.has(c.i) && sc != null ? ' title="Hors des heures de jour"' : '';
        return `<td class="${cls(c)}"${out}>${sc == null ? '–' : `${stackStarsSvg(n)}<span class="visually-hidden">${n} sur 5</span>`}</td>`;
      },
      'fc-stars',
    ),
  );

  const caption = mode === 'week' ? 'Prévisions sur 15 jours, toutes les 3 heures' : `Prévisions heure par heure, ${model.days[dayIndex].long}`;
  return `<table class="fc-table"><caption class="visually-hidden">${esc(caption)} à ${esc(spot.name)}</caption><thead>${head.join('')}</thead><tbody>${rows.join('')}</tbody></table>`;
}

export function tableLegend(s) {
  return `<div class="fc-legend" aria-hidden="true">
    <span><i style="background:var(--w2)"></i><i style="background:var(--w4)"></i><i style="background:var(--w6)"></i>Vagues : plus c'est foncé, plus c'est gros</span>
    <span><i style="background:var(--v5)"></i>Vent favorable</span>
    <span><i style="background:var(--v3)"></i>Neutre</span>
    <span><i style="background:var(--v1)"></i>Vent défavorable</span>
    <span><i style="background:rgb(239 168 16 / .25)"></i>Meilleur créneau</span>
    ${s.tideUseful ? '<span>PM / BM : pleine et basse mer</span>' : ''}
  </div>`;
}

export function hasData(s) {
  return isNum(s?.surf?.find?.((v) => !Number.isNaN(v)));
}
