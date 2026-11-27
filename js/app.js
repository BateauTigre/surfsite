// Surfsite — point d'entrée : état, routage (#/ et #/spot/<id>), chargement des données.

import { SPOTS, SPOT_BY_ID, REGION_BY_ID } from './data/spots.js';
import { fetchForecasts, MAX_AGE_MS } from './lib/api.js';
import { buildModel, nowIndex } from './lib/process.js';
import { formatClock, localParts } from './lib/time.js';
import { esc, $ } from './ui/format.js';
import { icon, logoSvg } from './ui/icons.js';
import { renderDayPicker, renderTop10, renderTopSkeleton, renderSpotList, renderRegionOptions } from './ui/home.js';
import { renderSpotPage } from './ui/spot.js';
import { initSearch } from './ui/searchbox.js';
import { initMap, updateMarkers, fitSpots, fitFrance, resizeMap, hasMap } from './ui/map.js';

const AUTO_REFRESH_MS = 60 * 60 * 1000;
const LS_KEY = 'surfsite:prefs';

const state = {
  route: { name: 'home' },
  dayKey: null,
  region: 'all',
  level: 0,
  mode: 'day',
  model: null,
  raw: null,
  loading: false,
  error: null,
  progress: [0, 0],
  homeScroll: 0,
  mapReady: false,
  mapStarted: false,
};

// ───────── Préférences (région, niveau) ─────────

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (p.region && (p.region === 'all' || REGION_BY_ID.has(p.region))) state.region = p.region;
    if ([0, 1, 2, 3, 4].includes(p.level)) state.level = p.level;
  } catch {
    /* stockage indisponible : on garde les valeurs par défaut */
  }
}

function savePrefs() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ region: state.region, level: state.level }));
  } catch {
    /* rien */
  }
}

// ───────── Routage ─────────

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const m = path.match(/^\/spot\/([a-z0-9-]+)\/?$/);
  return { route: m && SPOT_BY_ID.has(m[1]) ? { name: 'spot', id: m[1] } : { name: 'home' }, params };
}

function homeHash() {
  const p = new URLSearchParams();
  if (state.dayKey && state.model && state.dayKey !== state.model.days[0].key) p.set('d', state.dayKey);
  if (state.region !== 'all') p.set('r', state.region);
  if (state.level) p.set('n', String(state.level));
  const q = p.toString();
  return `#/${q ? `?${q}` : ''}`;
}

function spotHref(id) {
  const p = new URLSearchParams();
  if (state.dayKey && state.model && state.dayKey !== state.model.days[0].key) p.set('d', state.dayKey);
  const q = p.toString();
  return `#/spot/${id}${q ? `?${q}` : ''}`;
}

function replaceHash(hash) {
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function dayIndex() {
  if (!state.model) return 0;
  const i = state.model.days.findIndex((d) => d.key === state.dayKey);
  return i >= 0 ? i : 0;
}

// ───────── Sélections ─────────

function regionSpots(region = state.region) {
  return region === 'all' ? SPOTS : SPOTS.filter((s) => s.region === region);
}

function dayOf(id, i = dayIndex()) {
  return state.model?.spots.get(id)?.daily[i] ?? null;
}

function passesLevel(day) {
  return !state.level || (day?.available && day.level <= state.level);
}

function bestScore(spots, i) {
  let best = null;
  for (const s of spots) {
    const d = dayOf(s.id, i);
    if (d?.available && passesLevel(d) && (best == null || d.score > best)) best = d.score;
  }
  return best;
}

function topItems(i) {
  return regionSpots()
    .map((spot) => ({ spot, day: dayOf(spot.id, i) }))
    .filter(({ day }) => day?.available && passesLevel(day))
    .sort((a, b) => b.day.score - a.day.score || b.day.surf - a.day.surf)
    .slice(0, 10);
}

// ───────── Rendu : en-tête et bandeaux ─────────

function renderStatus() {
  const el = $('#status-text');
  const btn = $('#refresh-btn');
  btn.classList.toggle('is-spinning', state.loading);
  btn.disabled = state.loading;
  if (state.loading) {
    const [done, total] = state.progress;
    el.innerHTML = `<span class="status-dot is-loading" aria-hidden="true"></span>Chargement${total ? ` ${done}/${total}` : '…'}`;
  } else if (state.model) {
    const t = formatClock(new Date(state.model.fetchedAt));
    el.innerHTML = state.model.stale
      ? `<span class="status-dot is-stale" aria-hidden="true"></span>Hors ligne · données de ${t}`
      : `<span class="status-dot" aria-hidden="true"></span>Mis à jour à ${t}`;
  } else {
    el.textContent = '';
  }
}

function renderBanner() {
  const host = $('#banner');
  const m = state.model;
  if (state.error && !m) {
    host.innerHTML = `<div class="banner is-error" role="alert">${icon.alert()}<div><p><strong>Impossible de charger les prévisions.</strong></p><p>${esc(state.error)}</p></div><button type="button" class="btn btn-secondary" data-retry>Réessayer</button></div>`;
    return;
  }
  const notes = [];
  if (m?.errors?.length) notes.push('Une partie des prévisions n\'a pas pu être chargée : certains spots peuvent afficher des données incomplètes.');
  if (m && m.marineDays < 15) notes.push(`La prévision de houle ne couvre que ${m.marineDays} jours aujourd'hui ; le vent reste disponible sur 15 jours.`);
  if (state.error && m) notes.push(`Dernière actualisation en échec (${state.error}). Les données affichées datent de ${formatClock(new Date(m.fetchedAt))}.`);
  host.innerHTML = notes.length
    ? `<div class="banner" role="status">${icon.info()}<div>${notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div></div>`
    : '';
}

// ───────── Rendu : accueil ─────────

function renderHome() {
  const m = state.model;
  const di = dayIndex();
  const region = REGION_BY_ID.get(state.region);
  document.title = 'Surfsite — conditions de surf en France en temps réel';

  // Filtres
  $('#level-select').value = String(state.level);
  renderRegionOptions($('#region-select'), state.region, m ? (r) => bestScore(regionSpots(r), di) : null);

  const dayLabel = m ? m.days[di].long : '';
  $('#top10-sub').textContent = `${region ? region.label : 'Toute la France'}${dayLabel ? ` · ${dayLabel}` : ''}`;

  if (!m) {
    $('#day-picker').innerHTML = '';
    if (state.loading || !state.error) renderTopSkeleton($('#top10-list'));
    else $('#top10-list').innerHTML = '<li class="empty-state">Prévisions indisponibles pour le moment.</li>';
    renderSpotList($('#spot-list'), SPOTS, () => null, spotHref, state.region);
    return;
  }

  renderDayPicker($('#day-picker'), m.days, di, (i) => bestScore(regionSpots(), i));
  const items = topItems(di);
  renderTop10($('#top10-list'), items, m, spotHref);
  if (!items.length && !m.days[di]) $('#top10-list').innerHTML = '<li class="empty-state">Pas de prévision pour ce jour.</li>';
  renderSpotList($('#spot-list'), SPOTS, (id) => dayOf(id, di), spotHref, state.region);
  $('#all-sub').textContent = `${regionSpots().length} spots · note du ${dayLabel.toLowerCase()}`;

  if (state.mapReady) {
    updateMarkers(
      (id) => dayOf(id, di),
      (spot) => (state.region === 'all' || spot.region === state.region) && passesLevel(dayOf(spot.id, di)),
    );
  }
}

async function ensureMap() {
  if (state.mapStarted) {
    resizeMap();
    return;
  }
  state.mapStarted = true;
  const ok = await initMap($('#map'), SPOTS, {
    open: (id) => {
      location.hash = spotHref(id);
    },
    getData: (id) => ({ day: dayOf(id), href: spotHref(id) }),
  });
  state.mapReady = ok;
  if (ok) {
    if (state.region !== 'all') fitSpots(regionSpots());
    if (state.route.name === 'home') renderHome();
  }
}

// ───────── Rendu : fiche spot ─────────

function renderSpot(focus = false) {
  const spot = SPOT_BY_ID.get(state.route.id);
  document.title = `${spot.name} (${spot.town}) — prévisions surf · Surfsite`;
  const root = $('#view-spot');
  root._cleanup?.();
  renderSpotPage(root, spot, {
    model: state.model,
    dayIndex: dayIndex(),
    mode: state.mode,
    error: state.error,
    hrefFor: spotHref,
    backHref: homeHash(),
    onDay: (i, mode) => {
      state.dayKey = state.model.days[i].key;
      if (mode) state.mode = mode;
      replaceHash(spotHref(spot.id));
      renderSpot();
    },
    onMode: (mode) => {
      state.mode = mode;
      renderSpot();
    },
  });
  if (focus) root.querySelector('[data-focus-target]')?.focus({ preventScroll: true });
}

// ───────── Navigation ─────────

function applyRoute({ fromHashChange = false } = {}) {
  const { route, params } = parseHash();
  const prev = state.route;
  if (params.has('d')) state.dayKey = params.get('d');
  else if (fromHashChange || !state.dayKey) state.dayKey = state.model?.days[0]?.key ?? null;
  if (route.name === 'home') {
    if (params.has('r') && (params.get('r') === 'all' || REGION_BY_ID.has(params.get('r')))) state.region = params.get('r');
    if (params.has('n') && [0, 1, 2, 3, 4].includes(Number(params.get('n')))) state.level = Number(params.get('n'));
  }
  state.route = route;

  const home = $('#view-home');
  const spotView = $('#view-spot');
  if (route.name === 'spot') {
    if (prev.name === 'home') state.homeScroll = window.scrollY;
    home.hidden = true;
    spotView.hidden = false;
    renderSpot(true);
    if (prev.name !== 'spot' || prev.id !== route.id) window.scrollTo(0, 0);
  } else {
    spotView.hidden = true;
    home.hidden = false;
    $('#view-spot')._cleanup?.();
    renderHome();
    ensureMap();
    if (prev.name === 'spot') {
      window.scrollTo(0, state.homeScroll);
      requestAnimationFrame(() => resizeMap());
    }
  }
}

function rerender() {
  renderStatus();
  renderBanner();
  if (state.route.name === 'spot') renderSpot();
  else renderHome();
}

// ───────── Données ─────────

async function load({ force = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  state.progress = [0, 0];
  renderStatus();
  if (!state.model) rerender();
  try {
    const raw = await fetchForecasts(SPOTS, {
      force,
      onProgress: (done, total) => {
        state.progress = [done, total];
        renderStatus();
      },
    });
    state.raw = raw;
    state.model = buildModel(SPOTS, raw);
    state.error = null;
    if (!state.dayKey || !state.model.days.some((d) => d.key === state.dayKey)) state.dayKey = state.model.days[0].key;
  } catch (err) {
    state.error = friendlyError(err);
  } finally {
    state.loading = false;
    rerender();
  }
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (err?.status === 429 || /limit exceeded/i.test(msg)) return 'Trop de requêtes vers le service météo. Réessayez dans une minute.';
  if (!navigator.onLine) return 'Vous semblez hors ligne.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Le service de prévision ne répond pas. Vérifiez votre connexion et réessayez.';
  return msg || 'Erreur inconnue.';
}

/** Recalcule le modèle quand l'heure change (sans refaire d'appel réseau). */
function tickClock() {
  if (!state.model || !state.raw) return;
  const today = localParts(new Date()).key;
  if (state.model.days[0].key !== today) {
    load({ force: true });
    return;
  }
  const idx = nowIndex(state.model.times);
  if (idx !== state.model.now) {
    state.model = buildModel(SPOTS, state.raw);
    rerender();
  }
}

function maybeAutoRefresh() {
  if (document.visibilityState !== 'visible' || state.loading) return;
  if (!state.model || Date.now() - state.model.fetchedAt > Math.max(AUTO_REFRESH_MS, MAX_AGE_MS)) load();
  else tickClock();
}

// ───────── Démarrage ─────────

function bindHome() {
  $('#day-picker').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-day]');
    if (!b || !state.model) return;
    state.dayKey = state.model.days[Number(b.dataset.day)].key;
    replaceHash(homeHash());
    renderHome();
  });
  $('#region-select').addEventListener('change', (ev) => {
    state.region = ev.target.value;
    savePrefs();
    replaceHash(homeHash());
    renderHome();
    if (state.mapReady) (state.region === 'all' ? fitFrance() : fitSpots(regionSpots()));
  });
  $('#level-select').addEventListener('change', (ev) => {
    state.level = Number(ev.target.value);
    savePrefs();
    replaceHash(homeHash());
    renderHome();
  });
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-retry]')) load({ force: true });
  });
  $('#refresh-btn').addEventListener('click', () => load({ force: true }));
}

function init() {
  $('#brand-logo').innerHTML = logoSvg;
  $('#search-icon').innerHTML = icon.search(18);
  $('#refresh-btn').innerHTML = icon.refresh(20);
  document.querySelectorAll('[data-chevron]').forEach((el) => {
    el.innerHTML = icon.chevronDown(18);
  });
  loadPrefs();
  bindHome();
  initSearch({
    input: $('#search-input'),
    list: $('#search-results'),
    spots: SPOTS,
    dayFor: (id) => dayOf(id),
    onPick: (id) => {
      location.hash = spotHref(id);
    },
  });
  window.addEventListener('hashchange', () => applyRoute({ fromHashChange: true }));
  document.addEventListener('visibilitychange', maybeAutoRefresh);
  setInterval(maybeAutoRefresh, 60 * 1000);
  applyRoute();
  renderStatus();
  load();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export { state, hasMap };
