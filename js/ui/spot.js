// Fiche d'un spot : verdict du jour, conditions, planches, tableau horaire, marée, infos.

import { esc, fmt, fmtM, fmtInt, fmtScore, fmtSurfRange, isNum } from './format.js';
import { starsSvg, dirArrow, icon, boardSvg, weatherIcon, weatherWord } from './icons.js';
import { compass, compassLong, windowLabel as swellWindowLabel, distanceKm } from '../lib/geo.js';
import {
  LEVELS, scoreWord, starsOf, suggestBoards, wetsuitFor, WIND_LABELS, TIDE_LABELS, requiredLevel, conditionLevel,
} from '../lib/rating.js';
import { tideTrend } from '../lib/tide.js';
import { formatClock } from '../lib/time.js';
import { TYPES, BOTTOMS, HAZARDS, SPOTS, REGION_BY_ID } from '../data/spots.js';
import { forecastTable, tableLegend } from './table.js';
import { renderTideChart } from './tidechart.js';
import { renderDayPicker, windowLabel } from './home.js';

const v = (arr, i) => {
  const x = arr?.[i];
  return x == null || Number.isNaN(x) ? null : x;
};

function compassSvg(spot) {
  const C = 84;
  const R = 66;
  const pt = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  };
  const p = (deg, r) => pt(deg, r).map((n) => n.toFixed(1)).join(',');
  const f = spot.facing;
  const land = `M${p(f + 90, R)} A${R},${R} 0 0 1 ${p(f + 180, R)} A${R},${R} 0 0 1 ${p(f + 270, R)} Z`;
  const [c, h] = spot.swell;
  const large = h * 2 > 180 ? 1 : 0;
  const wedge = `M${C},${C} L${p(c - h, R)} A${R},${R} 0 ${large} 1 ${p(c + h, R)} Z`;
  const coast = `M${p(f + 90, R)} L${p(f - 90, R)}`;
  // Flèche de houle : arrive du large vers la côte.
  const [sx, sy] = pt(c, R - 6);
  const [ex, ey] = pt(c, 18);
  // Flèche de vent offshore : de la terre vers le large.
  const [wx, wy] = pt(spot.offshore, R - 6);
  const [wx2, wy2] = pt(spot.offshore, 22);
  const head = (x1, y1, x2, y2) => {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const a1 = ang + Math.PI * 0.85;
    const a2 = ang - Math.PI * 0.85;
    return `M${x2.toFixed(1)},${y2.toFixed(1)} L${(x2 + 8 * Math.cos(a1)).toFixed(1)},${(y2 + 8 * Math.sin(a1)).toFixed(1)} L${(x2 + 8 * Math.cos(a2)).toFixed(1)},${(y2 + 8 * Math.sin(a2)).toFixed(1)} Z`;
  };
  const labels = [['N', 0], ['E', 90], ['S', 180], ['O', 270]]
    .map(([t, d]) => {
      const [lx, ly] = pt(d, R + 11);
      return `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle">${t}</text>`;
    })
    .join('');
  return `<svg class="compass" viewBox="0 0 168 168" role="img" aria-label="Orientation : plage face au ${esc(compassLong(f))}, houle idéale du ${esc(swellWindowLabel(c, h))}, vent offshore du ${esc(compass(spot.offshore))}">
    <circle class="ring" cx="${C}" cy="${C}" r="${R}"/>
    <path class="land" d="${land}"/>
    <path class="window" d="${wedge}"/>
    <path class="coast" d="${coast}"/>
    <line class="swell-arrow" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke-width="2.5"/>
    <path class="swell-arrow" d="${head(sx, sy, ex, ey)}"/>
    <line class="wind-arrow" x1="${wx.toFixed(1)}" y1="${wy.toFixed(1)}" x2="${wx2.toFixed(1)}" y2="${wy2.toFixed(1)}" stroke-width="2.5"/>
    <path class="wind-arrow" d="${head(wx, wy, wx2, wy2)}"/>
    ${labels}
  </svg>`;
}

function sizeLabel(size) {
  const [, lo, hi] = size;
  return `${fmt(lo)} à ${fmt(hi)} m`;
}

function tideTile(s, model, i) {
  if (!s.tideUseful) return { value: 'Négligeable', detail: 'Marnage très faible (Méditerranée)' };
  const val = v(s.sl, i);
  if (val == null) return { value: '–', detail: 'Hors horizon de la prévision de marée' };
  const trend = tideTrend(s.sl, i);
  const t = model.times[i];
  const next = s.extremes.find((e) => e.t > t);
  const word = trend > 0 ? 'Montante' : trend < 0 ? 'Descendante' : 'Étale';
  const detail = next ? `${next.type === 'high' ? 'Pleine mer' : 'Basse mer'} à ${formatClock(next.t)}` : `${fmt(val)} m`;
  return { value: word, detail };
}

function conditionTiles(spot, s, model, i, title) {
  const S = v(s.surf, i);
  const hsw = v(s.hsw, i) ?? v(s.hs, i);
  const tsw = v(s.tsw, i) ?? v(s.tp, i);
  const dsw = v(s.dsw, i) ?? v(s.dir, i);
  const ws = v(s.ws, i);
  const wg = v(s.wg, i);
  const wd = v(s.wd, i);
  const cat = s.windCat[i];
  const sst = (() => {
    for (let k = i; k >= 0; k--) {
      const x = v(s.sst, k);
      if (x != null) return x;
    }
    return null;
  })();
  const suit = wetsuitFor(sst);
  const tide = tideTile(s, model, i);
  const code = v(s.wcode, i);
  const t2m = v(s.t2m, i);
  const tiles = [
    { label: 'Vagues', ic: icon.wave(14), value: fmtSurfRange(S), detail: hsw != null ? `Houle ${fmt(hsw)} m · ${fmtInt(tsw)} s · ${compass(dsw)}` : 'Pas de donnée de houle' },
    { label: 'Vent', ic: icon.wind(14), value: ws != null ? `${fmtInt(ws)} km/h ${dirArrow(wd, 18)}<span class="visually-hidden">du ${esc(compassLong(wd))}</span>` : '–', detail: ws != null ? `${esc(WIND_LABELS[cat] || '')} · ${compass(wd)} · rafales ${fmtInt(wg)}` : '', raw: true },
    { label: 'Marée', ic: icon.tide(14), value: tide.value, detail: tide.detail },
    { label: 'Eau', ic: icon.drop(14), value: sst != null ? `${fmtInt(sst)} °C` : '–', detail: suit ? `Combi ${suit.suit}${suit.extras ? `, ${suit.extras}` : ''}` : '' },
    { label: 'Air', ic: icon.thermo(14), value: t2m != null ? `${fmtInt(t2m)} °C ${weatherIcon(code, false, 20)}` : '–', detail: weatherWord(code), raw: true },
  ];
  return `<div class="tiles" role="group" aria-label="${esc(title)}">${tiles
    .map(
      (t) => `<div class="tile"><span class="tile-label">${t.ic}${esc(t.label)}</span><span class="tile-value">${t.raw ? t.value : esc(t.value)}</span><span class="tile-detail">${t.raw ? t.detail : esc(t.detail)}</span></div>`,
    )
    .join('')}</div>`;
}

function verdictCard(spot, s, model, dayIndex) {
  const day = s.daily[dayIndex];
  const d = model.days[dayIndex];
  if (!day?.available) {
    return `<section class="card span-2" aria-labelledby="verdict-title"><div class="card-head"><h2 id="verdict-title">${esc(d.long)}</h2></div>
      <div class="card-body"><p class="muted">Pas de prévision de houle pour ce jour : le modèle de vagues ne couvre pas encore cette date. Le vent reste affiché dans le tableau ci-dessous.</p></div></section>`;
  }
  const isToday = dayIndex === 0;
  const useNow = isToday && model.now >= 0 && !Number.isNaN(s.surf[model.now]);
  const tileIdx = useNow ? model.now : day.rep;
  const tilesTitle = useNow ? 'Maintenant' : `Au meilleur moment (${model.hours[day.rep].hour}h)`;
  const lvl = day.level;
  return `<section class="card span-2" aria-labelledby="verdict-title">
    <div class="card-head"><h2 id="verdict-title">${esc(d.long)}</h2><span class="panel-sub">${useNow ? 'Conditions actuelles en bas' : 'Conditions au meilleur créneau'}</span></div>
    <div class="card-body verdict">
      <div class="verdict-score">
        <span class="big-num">${fmtScore(day.score)}<small>/5</small></span>
        ${starsSvg(day.stars, 24)}
        <span class="verdict-word">${esc(scoreWord(day.score))}</span>
      </div>
      <div class="verdict-lines">
        <span>${icon.clock(15)} Meilleur créneau : <strong>${windowLabel(model, day)}</strong>${day.past ? ' (journée terminée)' : ''}</span>
        <span>${icon.wave(15)} Vagues <strong>${fmtSurfRange(day.surf)}</strong> au plus fort du créneau, jusqu'à ${fmtM(day.surfMax)} dans la journée</span>
        <span>${icon.user(15)} Niveau conseillé : <strong class="level-badge is-compact" data-l="${lvl}">${esc(LEVELS[lvl])}</strong></span>
      </div>
    </div>
    ${conditionTiles(spot, s, model, tileIdx, tilesTitle)}
  </section>`;
}

function boardsCard(spot, s, model, dayIndex) {
  const day = s.daily[dayIndex];
  if (!day?.available) return '';
  const lvlDay = day.level;
  const condLvl = conditionLevel(day.surf, day.period);
  const boards = suggestBoards({ surf: day.surf, period: day.period, windFactor: day.windF, level: lvlDay, spotLevel: spot.level });
  const why = condLvl > spot.level
    ? `Le spot est accessible dès le niveau ${LEVELS[spot.level].toLowerCase()}, mais avec ${fmtSurfRange(day.surf)} et ${fmtInt(day.period)} s de période il faut être <strong>${LEVELS[lvlDay].toLowerCase()}</strong>.`
    : `Niveau ${LEVELS[spot.level].toLowerCase()} : c'est le niveau du spot lui-même ; les conditions du jour ne le relèvent pas.`;
  return `<section class="card" aria-labelledby="boards-title">
    <div class="card-head"><h2 id="boards-title">Niveau et planches</h2></div>
    <div class="card-body">
      <p class="verdict-lines" style="margin-bottom:12px"><span><span class="level-badge" data-l="${lvlDay}">${esc(LEVELS[lvlDay])}</span></span><span>${why}</span></p>
      <ul class="boards">${boards
        .map((b) => `<li class="board">${boardSvg(b.icon)}<div><div class="board-name">${esc(b.name)} <small>${esc(b.size)}</small></div><div class="board-why">${esc(b.why)}</div></div></li>`)
        .join('')}</ul>
    </div>
  </section>`;
}

function tideCard(s, model, dayIndex) {
  const d = model.days[dayIndex];
  let body;
  if (!s.tideUseful) {
    body = '<p class="muted">Marée négligeable ici (Méditerranée) : elle n\'influence pas le surf.</p>';
  } else {
    const t0 = model.times[d.start];
    const t1 = t0 + 86400;
    const exts = s.extremes.filter((e) => e.t >= t0 && e.t < t1);
    if (!exts.length) {
      const until = s.lastTideTime ? model.hours[model.times.indexOf(s.lastTideTime)]?.key : null;
      const dayEnd = until ? model.days.find((x) => x.key === until) : null;
      body = `<p class="muted">Prévision de marée disponible ${dayEnd ? `jusqu'au ${esc(dayEnd.long.toLowerCase())}` : 'sur les premiers jours seulement'}.</p>`;
    } else {
      body = `<ul class="tide-times">${exts
        .map((e) => `<li><b>${e.type === 'high' ? 'PM' : 'BM'}</b><strong>${formatClock(e.t)}</strong><span class="muted">${fmt(e.v)} m</span></li>`)
        .join('')}</ul><div class="tide-chart" data-tide-chart></div><p class="fc-note" style="padding:8px 0 0">Hauteurs par rapport au niveau moyen de la mer. Prévision indicative du modèle (environ 8 km de maille) : ne pas utiliser pour la navigation.</p>`;
    }
  }
  return `<section class="card" aria-labelledby="tide-title"><div class="card-head"><h2 id="tide-title">Marée</h2><span class="panel-sub">${esc(d.long)}</span></div><div class="card-body">${body}</div></section>`;
}

function tableCard(spot, s, model, dayIndex, mode) {
  return `<section class="card span-2" aria-labelledby="table-title">
    <div class="card-head"><h2 id="table-title">Prévisions détaillées</h2>
      <div class="segmented" role="group" aria-label="Affichage du tableau">
        <button type="button" data-mode="day" aria-pressed="${mode === 'day'}">Heure par heure</button>
        <button type="button" data-mode="week" aria-pressed="${mode === 'week'}">15 jours</button>
      </div>
    </div>
    ${tableLegend(s)}
    <div class="fc-scroll" tabindex="0" aria-label="Tableau des prévisions, défilable horizontalement">${forecastTable(spot, s, model, { mode, dayIndex })}</div>
    <p class="fc-note">« Vagues » = hauteur estimée au bord, calculée à partir de la houle du large, de sa direction, de sa période et de l'abri du spot. La note tient compte du vent par rapport à l'orientation de la plage et de la marée préférée du spot.${relayNote(s, model)}</p>
  </section>`;
}

/** Signale à partir de quand la houle vient du modèle de relais (moins précis). */
function relayNote(s, model) {
  if (s.extFrom == null) return '';
  const day = model.days.find((d) => d.start <= s.extFrom && s.extFrom <= d.end);
  if (!day) return '';
  const hour = model.hours[s.extFrom].hour;
  const when = `${day.long.charAt(0).toLowerCase()}${day.long.slice(1)}${hour ? ` à ${hour}h` : ''}`;
  return ` À partir du ${esc(when)}, la houle vient du modèle américain GFS-Wave, moins fin : à prendre comme une tendance.`;
}

function infoCard(spot) {
  const facts = [
    ['Type', TYPES[spot.type]],
    ['Fond', BOTTOMS[spot.bottom]],
    ['Orientation', `Face au ${compassLong(spot.facing)} (${spot.facing}°)`],
    ['Houle idéale', `${swellWindowLabel(spot.swell[0], spot.swell[1])}`],
    ['Vent idéal', `${compass(spot.offshore)} (offshore)`],
    ['Marée idéale', TIDE_LABELS[spot.tide] || 'Toutes marées'],
    ['Taille idéale', sizeLabel(spot.size)],
    ['Niveau minimum', LEVELS[spot.level]],
    ['Département', spot.dept],
  ];
  const hazards = (spot.hazards || []).map((h) => `<li>${icon.alert(14)}${esc(HAZARDS[h] || h)}</li>`).join('');
  return `<section class="card" aria-labelledby="info-title">
    <div class="card-head"><h2 id="info-title">Le spot</h2></div>
    <div class="card-body spot-info-layout">
      <div>
        <dl class="facts">${facts.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>
        ${hazards ? `<ul class="hazards" aria-label="Dangers">${hazards}</ul>` : ''}
      </div>
      <div>
        ${compassSvg(spot)}
        <div class="compass-legend" aria-hidden="true">
          <span><i style="background:var(--w3)"></i>Fenêtre de houle</span>
          <span><i style="background:var(--w6)"></i>Houle idéale</span>
          <span><i style="background:var(--v5-dot)"></i>Vent offshore</span>
        </div>
      </div>
    </div>
  </section>`;
}

function nearbyCard(spot, model, dayIndex, hrefFor) {
  const list = SPOTS.filter((x) => x.id !== spot.id)
    .map((x) => ({ x, d: distanceKm(spot.lat, spot.lon, x.lat, x.lon) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  return `<section class="card" aria-labelledby="nearby-title">
    <div class="card-head"><h2 id="nearby-title">Spots proches</h2><span class="panel-sub">${esc(model.days[dayIndex].long)}</span></div>
    <div class="card-body"><ul class="nearby">${list
      .map(({ x, d }) => {
        const day = model.spots.get(x.id)?.daily[dayIndex];
        const right = day?.available ? `${starsSvg(day.stars, 13)} <span class="num">${fmtScore(day.score)}</span>` : '<span class="muted">–</span>';
        return `<li><a href="${esc(hrefFor(x.id))}"><span><span class="nb-name">${esc(x.name)}</span><span class="nb-meta">${esc(x.town)} · ${d < 10 ? fmt(d) : fmtInt(d)} km${day?.available ? ` · ${fmtSurfRange(day.surf)}` : ''}</span></span><span>${right}</span></a></li>`;
      })
      .join('')}</ul></div>
  </section>`;
}

/**
 * Rend la fiche complète.
 * opts : { model, dayIndex, mode, hrefFor(id), onDay(i), onMode(m), loading, error }
 */
export function renderSpotPage(root, spot, opts) {
  const { model, dayIndex, mode, hrefFor } = opts;
  const region = REGION_BY_ID.get(spot.region);
  const s = model?.spots.get(spot.id);
  const badges = [
    `<span class="badge">${icon.wave(14)}${esc(TYPES[spot.type])}</span>`,
    `<span class="badge">${esc(BOTTOMS[spot.bottom])}</span>`,
    `<span class="level-badge" data-l="${spot.level}">Niveau min. ${esc(LEVELS[spot.level].toLowerCase())}</span>`,
  ].join('');

  let body;
  if (!model) {
    body = opts.error
      ? `<div class="banner is-error" role="alert">${icon.alert()}<div><p><strong>Prévisions indisponibles.</strong></p><p>${esc(opts.error)}</p></div></div>`
      : '<div class="card"><div class="card-body"><p class="muted">Chargement des prévisions…</p></div></div>';
    body += `<div class="spot-grid" style="margin-top:16px">${infoCard(spot)}</div>`;
  } else if (!s || (!s.hasMarine && !s.hasWeather)) {
    body = `<div class="banner is-error" role="alert">${icon.alert()}<p>Pas de données pour ce spot pour le moment. Réessayez dans quelques minutes.</p></div><div class="spot-grid" style="margin-top:16px">${infoCard(spot)}</div>`;
  } else {
    body = `<div class="day-picker" data-spot-days role="group"></div>
      <div class="spot-grid" style="grid-auto-flow:dense">
        ${verdictCard(spot, s, model, dayIndex)}
        ${boardsCard(spot, s, model, dayIndex)}
        ${tableCard(spot, s, model, dayIndex, mode)}
        ${tideCard(s, model, dayIndex)}
        ${infoCard(spot)}
        ${nearbyCard(spot, model, dayIndex, hrefFor)}
      </div>`;
  }

  root.innerHTML = `<div class="container spot-page">
    <a class="back-link" href="${esc(opts.backHref || '#/')}">${icon.arrowLeft(16)} Tous les spots</a>
    <header class="spot-hero">
      <p class="eyebrow">${esc(region?.label || '')} · ${esc(spot.town)}</p>
      <h1 tabindex="-1" data-focus-target>${esc(spot.name)}</h1>
      <div class="badges">${badges}</div>
      <p class="desc">${esc(spot.desc)}</p>
    </header>
    ${body}
  </div>`;

  if (model && s) {
    const picker = root.querySelector('[data-spot-days]');
    renderDayPicker(picker, model.days, dayIndex, (i) => (s.daily[i]?.available ? s.daily[i].score : null), { label: `Choisir le jour pour ${spot.name}` });
    picker.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-day]');
      if (b) opts.onDay(Number(b.dataset.day));
    });
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => opts.onMode(b.dataset.mode)));
    root.querySelector('.fc-table')?.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-goto-day]');
      if (b) opts.onDay(Number(b.dataset.gotoDay), 'day');
    });
    const chartHost = root.querySelector('[data-tide-chart]');
    if (chartHost) {
      const draw = () => renderTideChart(chartHost, s, model, dayIndex);
      draw();
      let raf = 0;
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      });
      ro.observe(chartHost);
      root._cleanup = () => ro.disconnect();
    }
    // Amène la colonne « maintenant » ou le meilleur créneau dans la vue du tableau.
    const scroller = root.querySelector('.fc-scroll');
    const target = scroller?.querySelector('thead .is-now') || scroller?.querySelector('td.is-best');
    if (scroller && target && mode === 'day') {
      scroller.scrollLeft = Math.max(0, target.offsetLeft - 140);
    }
  }
}

export { requiredLevel, starsOf, isNum };
