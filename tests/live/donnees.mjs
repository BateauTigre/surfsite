// Vérification « grandeur nature » des données.
//
// Télécharge les vraies prévisions Open-Meteo des 124 spots avec le code du site
// (js/lib/api.js + js/lib/process.js), puis contrôle ce qui casserait l'affichage :
// spots sans données, horizon trop court, coordonnées douteuses, top 10 vide.
//
// Lancée par GitHub Actions (.github/workflows/verifications.yml).
// En local (accès Internet requis) : node tests/live/donnees.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { SPOTS, REGIONS } from '../../js/data/spots.js';
import { fetchForecasts, FORECAST_DAYS } from '../../js/lib/api.js';
import { buildModel } from '../../js/lib/process.js';
import { distanceKm } from '../../js/lib/geo.js';
import { fmtScore, fmtSurfRange } from '../../js/ui/format.js';

const OUT_DIR = process.argv[2] || 'rapport';
const onCI = Boolean(process.env.GITHUB_ACTIONS);

// Annotations GitHub (visibles sur la page du workflow).
function annotate(kind, title, message) {
  const text = String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  if (onCI) console.log(`::${kind} title=${title}::${text}`);
  else console.log(`\n[${kind}] ${title}\n${message}`);
}

const problems = []; // bloquants
const warnings = []; // à surveiller

const t0 = Date.now();
const fetched = await fetchForecasts(SPOTS, { force: true });
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const model = buildModel(SPOTS, fetched, Date.now());

for (const e of fetched.errors) warnings.push(`Lot ${e.kind} en erreur : ${e.error?.message || e.error}`);
if (fetched.marineDays < FORECAST_DAYS) warnings.push(`Houle limitée à ${fetched.marineDays} jours au lieu de ${FORECAST_DAYS}.`);

// Horizon réel d'une série : dernier pas de temps renseigné, en jours depuis minuit.
const start = model.times[0];
function horizonDays(series) {
  for (let i = series.length - 1; i >= 0; i--) if (!Number.isNaN(series[i])) return (model.times[i] - start) / 86400;
  return 0;
}
const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};

const missingMarine = [];
const missingWeather = [];
const farCell = [];
const highGround = [];
const horizons = { houle: [], vent: [], maree: [], eau: [] };

for (const spot of SPOTS) {
  const s = model.spots.get(spot.id);
  const m = fetched.marine.get(spot.id);
  const w = fetched.weather.get(spot.id);
  if (!s?.hasMarine) missingMarine.push(spot.id);
  if (!s?.hasWeather) missingWeather.push(spot.id);
  if (!s) continue;
  horizons.houle.push(horizonDays(s.hsw));
  horizons.vent.push(horizonDays(s.ws));
  horizons.maree.push(horizonDays(s.sl));
  horizons.eau.push(horizonDays(s.sst));
  // Maille marine retenue (cell_selection=sea) : loin du spot = spot mal placé ou côte mal couverte.
  if (m && Number.isFinite(m.latitude)) {
    const d = distanceKm(spot.lat, spot.lon, m.latitude, m.longitude);
    if (d > 20) farCell.push(`${spot.name} (${spot.id}) : maille marine à ${d.toFixed(1)} km`);
  }
  // Altitude du point (modèle numérique de terrain à 90 m) : un spot doit être au bord de l'eau.
  if (w && Number.isFinite(w.elevation) && w.elevation > 35) highGround.push(`${spot.name} (${spot.id}) : ${Math.round(w.elevation)} m d'altitude`);
}

if (missingMarine.length) problems.push(`Pas de données marines pour ${missingMarine.length} spot(s) : ${missingMarine.join(', ')}`);
if (missingWeather.length) problems.push(`Pas de données météo pour ${missingWeather.length} spot(s) : ${missingWeather.join(', ')}`);
if (farCell.length) warnings.push(`Maille marine éloignée :\n${farCell.join('\n')}`);
if (highGround.length) warnings.push(`Spots à vérifier sur la carte (altitude élevée) :\n${highGround.join('\n')}`);

const H = Object.fromEntries(Object.entries(horizons).map(([k, v]) => [k, median(v)]));
const relay = SPOTS.filter((spot) => model.spots.get(spot.id)?.extFrom != null).length;
if (fetched.extended.size < SPOTS.length) warnings.push(`Relais GFS-Wave : ${fetched.extended.size} réponses sur ${SPOTS.length}.`);
if (model.waveDays < model.days.length) problems.push(`Houle disponible sur ${model.waveDays} jours seulement (sur ${model.days.length}).`);
if (!(H.houle >= 7)) problems.push(`Horizon de houle trop court : ${H.houle?.toFixed(1)} jours.`);

// Top 10 du jour, comme la page d'accueil (France entière, tous niveaux).
function top(dayIndex, spots = SPOTS) {
  return spots
    .map((spot) => ({ spot, day: model.spots.get(spot.id)?.daily[dayIndex] }))
    .filter(({ day }) => day?.available)
    .sort((a, b) => b.day.score - a.day.score || b.day.surf - a.day.surf)
    .slice(0, 10);
}
const today = top(0);
if (today.length < 10) problems.push(`Top 10 du jour incomplet : ${today.length} spot(s).`);
const topLines = today.map(
  ({ spot, day }, k) =>
    `${k + 1}. ${spot.name} (${spot.town}) ${fmtScore(day.score)}/5 · ${fmtSurfRange(day.surf)} · ${model.hours[day.start].hour}h–${model.hours[day.end].hour + 1}h`,
);

const regionLines = REGIONS.map((r) => {
  const best = top(0, SPOTS.filter((s) => s.region === r.id))[0];
  return `${r.label} : ${best ? `${best.spot.name} ${fmtScore(best.day.score)}` : 'aucun créneau'}`;
});

const dayLines = model.days.map((d) => {
  const best = top(d.index)[0];
  return `${d.compact || d.key} : ${best ? `${fmtScore(best.day.score)} (${best.spot.name})` : '–'}`;
});

const summary = [
  `${SPOTS.length} spots, ${fetched.weather.size} réponses météo, ${fetched.marine.size} réponses marines, en ${elapsed} s.`,
  `${model.days.length} jours affichés · houle connue sur ${model.waveDays} jours · relais GFS-Wave utilisé pour ${relay} spots.`,
  `Horizon médian réel : houle ${H.houle.toFixed(1)} j · vent ${H.vent.toFixed(1)} j · marée ${H.maree.toFixed(1)} j · eau ${H.eau.toFixed(1)} j.`,
].join('\n');

annotate('notice', 'Données Open-Meteo', summary);
annotate('notice', 'Top 10 du jour', topLines.join('\n'));
annotate('notice', 'Meilleur spot par région', regionLines.join('\n'));
annotate('notice', 'Meilleure note par jour', dayLines.join('\n'));
for (const w of warnings) annotate('warning', 'À vérifier', w);
for (const p of problems) annotate('error', 'Problème', p);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  `${OUT_DIR}/donnees.json`,
  JSON.stringify({ date: new Date().toISOString(), summary, horizons: H, top: topLines, regions: regionLines, days: dayLines, warnings, problems }, null, 2),
);

process.exitCode = problems.length ? 1 : 0;
