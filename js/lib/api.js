// Client Open-Meteo : prévisions marines (houle, marée, eau) + météo (vent, air, ciel).
// Les spots sont regroupés par lots (plusieurs coordonnées par requête) et les réponses
// sont gardées en cache dans le navigateur pour ménager le quota gratuit
// (600 appels/minute, 5 000/heure, 10 000/jour par adresse IP).

import { TZ, localParts } from './time.js';

export const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
export const FORECAST_DAYS = 15;

export const MARINE_HOURLY = [
  'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period', 'swell_wave_peak_period',
  'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
  'sea_level_height_msl', 'sea_surface_temperature',
];
export const WEATHER_HOURLY = ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'temperature_2m', 'weather_code'];
export const WEATHER_DAILY = ['sunrise', 'sunset'];

const BATCH_SIZE = 25;
const CONCURRENCY = 4;
const CACHE_NAME = 'surfsite-forecast-v1';
export const MAX_AGE_MS = 45 * 60 * 1000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function buildUrl(base, spots, params) {
  const p = new URLSearchParams();
  p.set('latitude', spots.map((s) => s.lat.toFixed(4)).join(','));
  p.set('longitude', spots.map((s) => s.lon.toFixed(4)).join(','));
  for (const [k, v] of Object.entries(params)) p.set(k, String(v));
  return `${base}?${p.toString()}`;
}

function weatherParams() {
  return {
    hourly: WEATHER_HOURLY.join(','),
    daily: WEATHER_DAILY.join(','),
    timezone: TZ,
    timeformat: 'unixtime',
    forecast_days: FORECAST_DAYS,
    wind_speed_unit: 'kmh',
  };
}

function marineParams(days) {
  return {
    hourly: MARINE_HOURLY.join(','),
    timezone: TZ,
    timeformat: 'unixtime',
    forecast_days: days,
    cell_selection: 'sea',
  };
}

async function openCache() {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

function sameLocalDay(a, b) {
  return localParts(new Date(a)).key === localParts(new Date(b)).key;
}

async function readCache(cache, url) {
  if (!cache) return null;
  try {
    const hit = await cache.match(url);
    if (!hit) return null;
    const time = Number(hit.headers.get('x-surfsite-time')) || 0;
    return { data: await hit.json(), time };
  } catch {
    return null;
  }
}

async function fetchJson(url, cache, force) {
  const cached = await readCache(cache, url);
  const now = Date.now();
  if (!force && cached && now - cached.time < MAX_AGE_MS && sameLocalDay(cached.time, now)) {
    return { ...cached, fromCache: true };
  }
  try {
    const res = await fetch(url);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(`Réponse illisible (HTTP ${res.status})`, res.status);
    }
    if (!res.ok || (data && data.error)) throw new ApiError(data?.reason || `HTTP ${res.status}`, res.status);
    if (cache) {
      const stored = new Response(text, { headers: { 'content-type': 'application/json', 'x-surfsite-time': String(now) } });
      cache.put(url, stored).catch(() => {});
    }
    return { data, time: now, fromCache: false };
  } catch (err) {
    // Hors ligne ou quota dépassé : on se rabat sur la dernière réponse du jour.
    if (cached && sameLocalDay(cached.time, now)) return { ...cached, fromCache: true, stale: true, error: err };
    throw err;
  }
}

async function runPool(tasks, limit, onDone) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      onDone?.();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const asList = (data) => (Array.isArray(data) ? data : [data]);

/**
 * Télécharge les prévisions de tous les spots.
 * Renvoie { weather: Map(id → réponse), marine: Map(id → réponse), fetchedAt, stale, errors, marineDays }.
 */
export async function fetchForecasts(spots, { force = false, onProgress } = {}) {
  const cache = await openCache();
  const groups = chunk(spots, BATCH_SIZE);
  let marineDays = FORECAST_DAYS;
  const total = groups.length * 2;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  const marineTask = (g) => async () => {
    const days = marineDays;
    try {
      return await fetchJson(buildUrl(MARINE_URL, g, marineParams(days)), cache, force);
    } catch (err) {
      // Si l'horizon de 15 jours est refusé, on retente sur l'horizon maximal historique (8 jours).
      const refused = err instanceof ApiError && err.status === 400 && /forecast_days|out of allowed range/i.test(err.message);
      if (refused && days !== 8) {
        marineDays = 8;
        return fetchJson(buildUrl(MARINE_URL, g, marineParams(8)), cache, force);
      }
      throw err;
    }
  };
  const weatherTask = (g) => () => fetchJson(buildUrl(WEATHER_URL, g, weatherParams()), cache, force);

  const tasks = [];
  for (const g of groups) {
    tasks.push(weatherTask(g));
    tasks.push(marineTask(g));
  }
  const results = await runPool(tasks, CONCURRENCY, tick);

  const weather = new Map();
  const marine = new Map();
  const errors = [];
  let fetchedAt = Infinity;
  let stale = false;
  results.forEach((r, k) => {
    const g = groups[Math.floor(k / 2)];
    const kind = k % 2 === 0 ? 'weather' : 'marine';
    if (!r.ok) {
      errors.push({ kind, error: r.error });
      return;
    }
    const { data, time, stale: s } = r.value;
    fetchedAt = Math.min(fetchedAt, time);
    stale = stale || Boolean(s);
    const list = asList(data);
    g.forEach((spot, i) => {
      if (list[i]) (kind === 'weather' ? weather : marine).set(spot.id, list[i]);
    });
  });

  if (!weather.size && !marine.size) {
    const first = errors[0]?.error;
    throw first instanceof ApiError ? first : new ApiError(first?.message || 'Prévisions indisponibles');
  }
  return { weather, marine, fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(), stale, errors, marineDays };
}
