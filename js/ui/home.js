// Accueil : sélecteur de jours, top 10 et liste complète des spots.

import { esc, fmtSurfRange, fmtInt, fmtScore } from './format.js';
import { starsSvg, starIcon, dirArrow, icon } from './icons.js';
import { compass } from '../lib/geo.js';
import { LEVELS, starsOf, windClass, WIND_LABELS } from '../lib/rating.js';
import { REGIONS } from '../data/spots.js';

/** Puces des 15 jours. `bestFor(dayIndex)` → note max (ou null). */
export function renderDayPicker(host, days, selected, bestFor, { label = 'Choisir le jour' } = {}) {
  host.setAttribute('aria-label', label);
  host.innerHTML = days
    .map((d) => {
      const best = bestFor(d.index);
      const has = best != null;
      const score = has ? `${starIcon(11)}<span>${fmtScore(best)}</span>` : '<span>–</span>';
      return `<button type="button" class="day-chip" data-day="${d.index}" aria-pressed="${d.index === selected}"
        aria-label="${esc(d.long)}${has ? `, meilleure note ${fmtScore(best)} sur 5` : ', pas de prévision de houle'}">
        <span class="dc-wd">${esc(d.short)}</span>
        <span class="dc-num">${esc(d.dayNum)}</span>
        <span class="dc-score" aria-hidden="true">${score}</span>
      </button>`;
    })
    .join('');
  const current = host.querySelector('[aria-pressed="true"]');
  if (current && host.scrollWidth > host.clientWidth) {
    host.scrollLeft = Math.max(0, current.offsetLeft - host.clientWidth / 2 + current.clientWidth / 2);
  }
}

function windLine(day) {
  const wc = windClass(day.windF);
  return `<span><span class="wind-dot" data-v="${wc}" aria-hidden="true"></span>${esc(WIND_LABELS[day.windCat] || 'Vent')} ${fmtInt(day.ws)} km/h ${dirArrow(day.wd, 13)}<span class="visually-hidden">venant du ${esc(compass(day.wd))}</span></span>`;
}

export function windowLabel(model, day) {
  const a = model.hours[day.start];
  const b = model.hours[day.end];
  const endHour = (b.hour + 1) % 24;
  return `${a.hour}h–${endHour}h`;
}

/** Liste du top 10. `items` = [{ spot, day }] déjà triés. */
export function renderTop10(host, items, model, hrefFor) {
  if (!items.length) {
    host.innerHTML = '<li class="empty-state">Aucun spot ne correspond à ces filtres pour ce jour.</li>';
    return;
  }
  host.innerHTML = items
    .map(({ spot, day }, i) => {
      const lvl = day.level;
      return `<li class="rank-item"><a href="${esc(hrefFor(spot.id))}">
        <span class="rank-num">${i + 1}</span>
        <span class="rank-name">${esc(spot.name)} <small>${esc(spot.town)}</small></span>
        <span class="rank-score">${starsSvg(day.stars, 15)}<span class="num">${fmtScore(day.score)}</span></span>
        <span class="rank-meta">
          <span>${icon.wave(14)}${fmtSurfRange(day.surf)} · ${fmtInt(day.period)} s</span>
          ${windLine(day)}
          <span class="level-badge is-compact" data-l="${lvl}">${esc(LEVELS[lvl])}</span>
        </span>
        <span class="rank-when">${icon.clock(13)}${windowLabel(model, day)}${day.past ? ' (passé)' : ''}</span>
      </a></li>`;
    })
    .join('');
}

export function renderTopSkeleton(host) {
  host.innerHTML = Array.from({ length: 6 }, () => '<li class="skeleton-row" aria-hidden="true"></li>').join('');
}

const openGroups = new Set();
let listBound = false;

/** Liste de tous les spots, groupés par région (du nord au sud), repliables. */
export function renderSpotList(host, spots, dayFor, hrefFor, regionFilter) {
  if (!listBound) {
    listBound = true;
    host.addEventListener('toggle', (ev) => {
      const d = ev.target;
      if (!(d instanceof HTMLDetailsElement) || !d.dataset.region) return;
      if (d.open) openGroups.add(d.dataset.region);
      else openGroups.delete(d.dataset.region);
    }, true);
  }
  const single = regionFilter !== 'all';
  const groups = REGIONS.filter((r) => !single || r.id === regionFilter)
    .map((r) => ({ region: r, spots: spots.filter((s) => s.region === r.id) }))
    .filter((g) => g.spots.length);
  host.innerHTML = groups
    .map((g) => {
      let best = null;
      for (const s of g.spots) {
        const d = dayFor(s.id);
        if (d?.available && (best == null || d.score > best)) best = d.score;
      }
      const open = single || openGroups.has(g.region.id) ? ' open' : '';
      const bestTxt = best != null ? `<span class="rg-best">${starIcon(12)} jusqu'à ${fmtScore(best)}</span>` : '';
      return `<details class="region-group" data-region="${g.region.id}"${open}><summary><span class="rg-title">${esc(g.region.label)} <small>${g.spots.length} spot${g.spots.length > 1 ? 's' : ''}</small></span>${bestTxt}${icon.chevronDown(18)}</summary>
      <ul class="spot-rows">${g.spots
        .map((spot) => {
          const day = dayFor(spot.id);
          const r = day?.available ? starsOf(day.score) : 0;
          const right = day?.available
            ? `<span class="num">${fmtSurfRange(day.surf)}</span><span class="rating-pill" data-r="${r}"><span aria-hidden="true">${r}★</span><span class="visually-hidden">${r} étoile${r > 1 ? 's' : ''} sur 5</span></span>`
            : '<span class="muted">–</span>';
          return `<li class="spot-row"><a href="${esc(hrefFor(spot.id))}"><span class="sr-title">${esc(spot.name)} <small>${esc(spot.town)}</small></span><span class="sr-right">${right}</span></a></li>`;
        })
        .join('')}</ul></details>`;
    })
    .join('');
}

export function renderRegionOptions(select, selected, bestFor) {
  const opts = [{ id: 'all', label: 'Toute la France' }, ...REGIONS];
  select.innerHTML = opts
    .map((r) => {
      const best = bestFor ? bestFor(r.id) : null;
      const suffix = best != null ? ` · ${fmtScore(best)}★` : '';
      return `<option value="${r.id}"${r.id === selected ? ' selected' : ''}>${esc(r.label)}${suffix}</option>`;
    })
    .join('');
}
