// Carte interactive : MapLibre GL (chargé à la demande) + fond clair OpenFreeMap « Positron ».

import { esc, fmtSurfRange, fmtInt, fmtScore } from './format.js';
import { starsSvg, dirArrow } from './icons.js';
import { compass } from '../lib/geo.js';
import { starsOf, WIND_LABELS, windClass } from '../lib/rating.js';

const ML_VERSION = '5.23.0';
const CDNS = [`https://unpkg.com/maplibre-gl@${ML_VERSION}/dist`, `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VERSION}/dist`];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const FRANCE = [[-5.4, 41.2], [9.7, 51.2]];

const FR_LOCALE = {
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'NavigationControl.ResetBearing': 'Réorienter vers le nord',
  'AttributionControl.ToggleAttribution': 'Afficher les crédits',
  'AttributionControl.MapFeedback': 'Signaler une erreur sur la carte',
  'FullscreenControl.Enter': 'Plein écran',
  'FullscreenControl.Exit': 'Quitter le plein écran',
  'Popup.Close': 'Fermer',
  'CooperativeGesturesHandler.WindowsHelpText': 'Utilisez Ctrl + molette pour zoomer',
  'CooperativeGesturesHandler.MacHelpText': 'Utilisez ⌘ + molette pour zoomer',
  'CooperativeGesturesHandler.MobileHelpText': 'Utilisez deux doigts pour déplacer la carte',
};

let map = null;
let popup = null;
let container = null;
let activeId = null;
const markers = new Map(); // id → { marker, el, spot }
let onOpen = () => {};
let lastData = () => null;

function loadCss(href) {
  if (document.querySelector(`link[data-ml="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.crossOrigin = 'anonymous';
  link.dataset.ml = href;
  document.head.appendChild(link);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      reject(new Error(`Échec de chargement : ${src}`));
    };
    document.head.appendChild(s);
  });
}

async function loadMapLibre() {
  if (window.maplibregl) return window.maplibregl;
  let lastErr;
  for (const base of CDNS) {
    try {
      loadCss(`${base}/maplibre-gl.css`);
      await loadScript(`${base}/maplibre-gl.js`);
      if (window.maplibregl) return window.maplibregl;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('MapLibre indisponible');
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function zoomBand(z) {
  return z < 6.6 ? 'far' : z < 9 ? 'mid' : 'near';
}

function showFallback(message) {
  if (!container) return;
  container.innerHTML = `<div class="map-fallback"><p>${esc(message)}</p></div>`;
}

/**
 * Initialise la carte.
 * getData(spotId) → { day } (résumé du jour sélectionné) ; open(spotId) ouvre la fiche.
 */
export async function initMap(el, spots, { open, getData }) {
  container = el;
  onOpen = open;
  lastData = getData;
  let ml;
  try {
    ml = await loadMapLibre();
  } catch {
    showFallback('La carte n\'a pas pu être chargée. Les spots restent accessibles par la recherche et la liste.');
    return false;
  }
  try {
    map = new ml.Map({
      container: el,
      style: STYLE_URL,
      bounds: FRANCE,
      fitBoundsOptions: { padding: 24 },
      minZoom: 4,
      maxZoom: 15,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      cooperativeGestures: window.matchMedia('(pointer: coarse)').matches,
      locale: FR_LOCALE,
    });
  } catch {
    showFallback('Votre navigateur ne peut pas afficher la carte (WebGL indisponible). Les spots restent accessibles par la recherche et la liste.');
    return false;
  }
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
  // Noms de lieux en français quand la carte les connaît (sinon le nom local).
  map.on('style.load', () => localizeLabels(map));
  map.on('error', (e) => {
    // Une tuile manquante ne doit pas casser la page ; on garde une trace discrète.
    if (e?.error) console.warn('[carte]', e.error.message || e.error);
  });

  popup = new ml.Popup({ closeButton: true, closeOnClick: true, offset: 18, maxWidth: '280px', className: 'spot-popup' });
  popup.on('close', () => setActive(null));

  for (const spot of spots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'marker';
    btn.dataset.r = '0';
    btn.dataset.id = spot.id;
    btn.tabIndex = -1;
    btn.innerHTML = `<span class="mk-num" aria-hidden="true"></span><span class="mk-name" aria-hidden="true">${esc(spot.name)}</span>`;
    btn.setAttribute('aria-label', spot.name);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openPopup(spot.id);
    });
    const marker = new ml.Marker({ element: btn, anchor: 'center' }).setLngLat([spot.lon, spot.lat]).addTo(map);
    markers.set(spot.id, { marker, el: btn, spot });
  }

  const applyZoom = () => {
    el.dataset.zoom = zoomBand(map.getZoom());
  };
  map.on('zoom', applyZoom);
  map.on('moveend', declutterNames);
  applyZoom();
  return true;
}

function localizeLabels(m) {
  for (const layer of m.getStyle()?.layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const field = m.getLayoutProperty(layer.id, 'text-field');
    if (!field || !JSON.stringify(field).includes('name')) continue;
    try {
      m.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:fr'], ['get', 'name']]);
    } catch {
      // couche atypique : on garde son libellé d'origine
    }
  }
}

/**
 * De près, chaque pastille affiche le nom du spot. Quand des noms se chevauchent ou
 * recouvrent une autre pastille, on ne garde que les mieux notés (survol = nom visible).
 */
function declutterNames() {
  if (!map || container?.dataset.zoom !== 'near') return;
  for (const m of markers.values()) m.el.classList.remove('name-hidden');
  const view = container.getBoundingClientRect();
  const items = [];
  for (const m of markers.values()) {
    const dot = m.el.getBoundingClientRect();
    if (dot.right < view.left || dot.left > view.right || dot.bottom < view.top || dot.top > view.bottom) continue;
    const name = m.el.querySelector('.mk-name').getBoundingClientRect();
    const prio = (m.el.classList.contains('is-active') ? 100 : 0) + Number(m.el.dataset.r) * 10 - (m.el.classList.contains('is-dim') ? 50 : 0);
    items.push({ m, dot, name, prio });
  }
  items.sort((a, b) => b.prio - a.prio);
  const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const placed = [];
  for (const it of items) {
    const blocked =
      placed.some((r) => overlap(it.name, r)) || items.some((o) => o !== it && overlap(it.name, o.dot));
    if (blocked) it.m.el.classList.add('name-hidden');
    else placed.push(it.name);
  }
}

function setActive(id) {
  if (activeId && markers.has(activeId)) markers.get(activeId).el.classList.remove('is-active');
  activeId = id;
  if (id && markers.has(id)) markers.get(id).el.classList.add('is-active');
}

function popupContent(spot, info) {
  const day = info?.day;
  const wrap = document.createElement('div');
  wrap.className = 'popup';
  let stats = '<div class="popup-stats"><div class="muted">Prévisions en cours de chargement…</div></div>';
  if (day?.available) {
    const wc = windClass(day.windF);
    stats = `<div class="popup-stats">
      <div>${starsSvg(day.stars, 14)} <strong>${fmtScore(day.score)}/5</strong></div>
      <div>Vagues <strong>${fmtSurfRange(day.surf)}</strong> · ${fmtInt(day.period)} s</div>
      <div><span class="wind-dot" data-v="${wc}"></span><span>${esc(WIND_LABELS[day.windCat] || 'Vent')}</span><span class="popup-wind">${fmtInt(day.ws)} km/h ${dirArrow(day.wd, 14)} ${compass(day.wd)}</span></div>
    </div>`;
  } else if (info?.day && !info.day.available) {
    stats = '<div class="popup-stats"><div class="muted">Pas de prévision de houle pour ce jour.</div></div>';
  }
  wrap.innerHTML = `<div class="popup-title">${esc(spot.name)}</div>
    <div class="popup-meta">${esc(spot.town)} · ${esc(spot.dept)}</div>
    ${stats}
    <a class="btn btn-primary" href="${esc(info?.href || '#')}">Voir la fiche du spot</a>`;
  return wrap;
}

export function openPopup(id) {
  const m = markers.get(id);
  if (!map || !m || !popup) return;
  const info = lastData(id);
  popup.setLngLat([m.spot.lon, m.spot.lat]).setDOMContent(popupContent(m.spot, info)).addTo(map);
  setActive(id);
}

/** Met à jour couleurs, chiffres et libellés des pastilles pour le jour choisi. */
export function updateMarkers(getDay, isVisible) {
  for (const [id, m] of markers) {
    const day = getDay(id);
    const r = day?.available ? starsOf(day.score) : 0;
    m.el.dataset.r = String(r);
    m.el.querySelector('.mk-num').textContent = day?.available ? String(r) : '';
    m.el.style.zIndex = String(r * 10 + 1);
    m.el.classList.toggle('is-dim', !isVisible(m.spot));
    const label = day?.available ? `${m.spot.name}, ${m.spot.town} : ${r} étoile${r > 1 ? 's' : ''} sur 5` : m.spot.name;
    m.el.setAttribute('aria-label', label);
  }
  if (popup?.isOpen() && activeId) openPopup(activeId);
  declutterNames();
}

export function fitSpots(spots) {
  if (!map || !spots.length) return;
  const ml = window.maplibregl;
  if (spots.length === 1) {
    map.flyTo({ center: [spots[0].lon, spots[0].lat], zoom: 11, duration: reducedMotion() ? 0 : 600 });
    return;
  }
  const b = new ml.LngLatBounds();
  spots.forEach((s) => b.extend([s.lon, s.lat]));
  map.fitBounds(b, { padding: 48, maxZoom: 10.5, duration: reducedMotion() ? 0 : 600 });
}

export function fitFrance() {
  if (!map) return;
  map.fitBounds(FRANCE, { padding: 24, duration: reducedMotion() ? 0 : 600 });
}

export function resizeMap() {
  map?.resize();
}

export function hasMap() {
  return Boolean(map);
}
