// Transforme les réponses brutes d'Open-Meteo en un modèle prêt à afficher :
// séries horaires alignées, marée, notes horaires et résumés journaliers par spot.

import { localParts, dayLabels } from './time.js';
import { rateHour, halfStarsOf, requiredLevel } from './rating.js';
import { findExtremes, tideStages } from './tide.js';
import { FORECAST_DAYS } from './api.js';

const num = (v) => (v == null || Number.isNaN(v) ? null : v);

/** Aligne une série sur l'axe de temps commun (secondes UNIX). */
function align(axis, times, values) {
  const out = new Float32Array(axis.length).fill(NaN);
  if (!times || !values) return out;
  if (times.length === axis.length && times[0] === axis[0]) {
    for (let i = 0; i < axis.length; i++) out[i] = values[i] ?? NaN;
    return out;
  }
  const pos = new Map();
  axis.forEach((t, i) => pos.set(t, i));
  times.forEach((t, j) => {
    const i = pos.get(t);
    if (i !== undefined) out[i] = values[j] ?? NaN;
  });
  return out;
}

function firstResponse(fetched) {
  for (const map of [fetched.weather, fetched.marine, fetched.extended]) {
    for (const r of map?.values() ?? []) if (r?.hourly?.time?.length) return r;
  }
  return null;
}

// Variables de vagues reprises du modèle de relais (GFS-Wave) quand le modèle principal manque.
const WAVE_KEYS = [
  ['hs', 'wave_height'], ['dir', 'wave_direction'], ['tp', 'wave_period'],
  ['hsw', 'swell_wave_height'], ['dsw', 'swell_wave_direction'], ['tsw', 'swell_wave_peak_period'],
  ['hww', 'wind_wave_height'], ['dww', 'wind_wave_direction'], ['tww', 'wind_wave_period'],
];

export function nowIndex(times, nowSec = Date.now() / 1000) {
  let idx = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i] <= nowSec) idx = i;
    else break;
  }
  return idx;
}

/** Construit le modèle complet. */
export function buildModel(spots, fetched, nowMs = Date.now()) {
  const ref = firstResponse(fetched);
  if (!ref) throw new Error('Aucune donnée exploitable');
  const times = Array.from(ref.hourly.time);
  const hours = times.map((t) => localParts(t));

  const days = [];
  hours.forEach((p, i) => {
    const last = days[days.length - 1];
    if (!last || last.key !== p.key) days.push({ key: p.key, start: i, end: i });
    else last.end = i;
  });
  days.splice(FORECAST_DAYS);
  days.forEach((d, i) => Object.assign(d, { index: i }, dayLabels(d.key, i)));

  const now = nowIndex(times, nowMs / 1000);
  const ctx = { times, hours, days, now };
  const bySpot = new Map();
  for (const spot of spots) {
    const id = spot.id;
    bySpot.set(id, buildSpot(spot, fetched.weather.get(id), fetched.marine.get(id), fetched.extended?.get(id), ctx));
  }

  // Nombre de jours où la houle est connue pour la majorité des spots.
  let waveDays = 0;
  days.forEach((d, i) => {
    let ok = 0;
    for (const s of bySpot.values()) if (s.daily[i]?.available) ok++;
    if (ok >= bySpot.size / 2) waveDays = i + 1;
  });

  return {
    times,
    hours,
    days,
    now,
    spots: bySpot,
    fetchedAt: fetched.fetchedAt,
    stale: fetched.stale,
    marineDays: fetched.marineDays,
    waveDays,
    errors: fetched.errors,
  };
}

function buildSpot(spot, w, m, x, ctx) {
  const { times, days } = ctx;
  const N = times.length;
  const mh = m?.hourly;
  const xh = x?.hourly;
  const wh = w?.hourly;
  const get = (block, key) => align(times, block?.time, block?.[key]);

  const s = {
    hasMarine: Boolean(mh || xh),
    hasWeather: Boolean(wh),
    hs: get(mh, 'wave_height'),
    dir: get(mh, 'wave_direction'),
    tp: get(mh, 'wave_period'),
    hsw: get(mh, 'swell_wave_height'),
    dsw: get(mh, 'swell_wave_direction'),
    tsw: get(mh, 'swell_wave_peak_period'),
    hww: get(mh, 'wind_wave_height'),
    dww: get(mh, 'wind_wave_direction'),
    tww: get(mh, 'wind_wave_period'),
    sl: get(mh, 'sea_level_height_msl'),
    sst: get(mh, 'sea_surface_temperature'),
    ws: get(wh, 'wind_speed_10m'),
    wd: get(wh, 'wind_direction_10m'),
    wg: get(wh, 'wind_gusts_10m'),
    t2m: get(wh, 'temperature_2m'),
    wcode: get(wh, 'weather_code'),
  };
  // Période de houle : période pic si disponible, sinon période moyenne.
  const tswMean = get(mh, 'swell_wave_period');
  for (let i = 0; i < N; i++) if (Number.isNaN(s.tsw[i])) s.tsw[i] = tswMean[i];

  // Heures sans vagues du modèle principal (au-delà de son horizon, ou trou) : relais GFS-Wave,
  // heure par heure et en bloc, pour ne jamais mélanger deux modèles dans une même heure.
  s.waveModel = new Uint8Array(N); // 0 : aucune donnée · 1 : modèle principal · 2 : relais
  s.extFrom = null;
  const ext = xh ? Object.fromEntries(WAVE_KEYS.map(([k, v]) => [k, get(xh, v)])) : null;
  const extMean = xh ? get(xh, 'swell_wave_period') : null;
  for (let i = 0; i < N; i++) {
    if (!Number.isNaN(s.hs[i]) || !Number.isNaN(s.hsw[i])) {
      s.waveModel[i] = 1;
      continue;
    }
    if (!ext || (Number.isNaN(ext.hs[i]) && Number.isNaN(ext.hsw[i]))) continue;
    s.waveModel[i] = 2;
    for (const [k] of WAVE_KEYS) s[k][i] = ext[k][i];
    if (Number.isNaN(s.tsw[i])) s.tsw[i] = extMean[i];
  }
  // Début du relais final (après la dernière heure du modèle principal), pour l'afficher.
  const lastMain = s.waveModel.lastIndexOf(1);
  for (let i = lastMain + 1; i < N; i++) {
    if (s.waveModel[i] === 2) {
      s.extFrom = i;
      break;
    }
  }

  // Marée.
  const sl = Array.from(s.sl, num);
  s.extremes = findExtremes(times, sl);
  s.tideStage = tideStages(times, sl, s.extremes);
  let tideRange = 0;
  for (let k = 1; k < s.extremes.length; k++) tideRange = Math.max(tideRange, Math.abs(s.extremes[k].v - s.extremes[k - 1].v));
  s.tideRange = tideRange;
  s.tideUseful = tideRange >= 0.5;
  s.lastTideTime = (() => {
    for (let i = N - 1; i >= 0; i--) if (!Number.isNaN(s.sl[i])) return times[i];
    return null;
  })();

  // Lever / coucher du soleil par jour.
  const sun = new Map();
  if (w?.daily?.time) {
    w.daily.time.forEach((t, j) => {
      const key = localParts(t).key;
      sun.set(key, { sunrise: w.daily.sunrise?.[j] ?? null, sunset: w.daily.sunset?.[j] ?? null });
    });
  }
  s.sun = sun;

  // Notes horaires.
  s.score = new Float32Array(N).fill(NaN);
  s.surf = new Float32Array(N).fill(NaN);
  s.period = new Float32Array(N).fill(NaN);
  s.windF = new Float32Array(N).fill(NaN);
  s.windCat = new Array(N).fill('unknown');
  for (let i = 0; i < N; i++) {
    const x = {
      hs: num(s.hs[i]), tp: num(s.tp[i]), dir: num(s.dir[i]),
      hsw: num(s.hsw[i]), tsw: num(s.tsw[i]), dsw: num(s.dsw[i]),
      hww: num(s.hww[i]), tww: num(s.tww[i]), dww: num(s.dww[i]),
      ws: num(s.ws[i]), wd: num(s.wd[i]), wg: num(s.wg[i]),
      tideStage: s.tideUseful ? num(s.tideStage[i]) : null,
    };
    const r = rateHour(spot, x);
    if (!r) continue;
    s.score[i] = r.score;
    s.surf[i] = r.surf;
    s.period[i] = r.period;
    s.windF[i] = r.wind.factor;
    s.windCat[i] = r.wind.cat;
  }

  s.daily = days.map((d) => summarizeDay(spot, s, d, ctx));
  return s;
}

/** Heures de jour (du lever au coucher du soleil, à 30 min près) d'une journée. */
export function daylightIndices(s, day, ctx) {
  const { times, hours } = ctx;
  const sun = s.sun.get(day.key);
  const idx = [];
  for (let i = day.start; i <= day.end; i++) {
    const t = times[i];
    if (sun?.sunrise && sun?.sunset) {
      if (t + 1800 >= sun.sunrise && t <= sun.sunset - 1800) idx.push(i);
    } else if (hours[i].hour >= 7 && hours[i].hour <= 18) {
      idx.push(i);
    }
  }
  return idx;
}

function summarizeDay(spot, s, day, ctx) {
  let idx = daylightIndices(s, day, ctx);
  let past = false;
  if (day.index === 0 && ctx.now >= 0) {
    const ahead = idx.filter((i) => i >= ctx.now);
    if (ahead.length) idx = ahead;
    else past = true;
  }
  let best = null;
  for (let a = 0; a < idx.length; a++) {
    let sum = 0;
    let cnt = 0;
    const end = Math.min(idx.length, a + 3);
    for (let b = a; b < end; b++) {
      const v = s.score[idx[b]];
      if (!Number.isNaN(v)) {
        sum += v;
        cnt++;
      }
    }
    if (!cnt) continue;
    const avg = sum / cnt;
    if (!best || avg > best.score + 1e-6) best = { score: avg, a, b: end - 1 };
  }
  if (!best) return { available: false, key: day.key };

  const start = idx[best.a];
  const end = idx[best.b];
  let rep = start;
  for (let i = start; i <= end; i++) if (s.score[i] > s.score[rep]) rep = i;

  let surfMax = 0;
  for (const i of idx) if (s.surf[i] > surfMax) surfMax = s.surf[i];

  const surf = s.surf[rep];
  const period = s.period[rep];
  return {
    available: true,
    key: day.key,
    score: best.score,
    stars: halfStarsOf(best.score),
    start,
    end,
    rep,
    past,
    surf,
    surfMax,
    period,
    windF: s.windF[rep],
    windCat: s.windCat[rep],
    ws: num(s.ws[rep]),
    wd: num(s.wd[rep]),
    level: requiredLevel(spot, Number.isNaN(surf) ? null : surf, Number.isNaN(period) ? null : period),
  };
}
