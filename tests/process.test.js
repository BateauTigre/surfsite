import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS } from '../js/data/spots.js';
import { buildModel } from '../js/lib/process.js';
import { buildUrl, MARINE_URL } from '../js/lib/api.js';
import { marineResponse, weatherResponse } from './fixtures.js';

test('URL multi-spots', () => {
  const url = buildUrl(MARINE_URL, SPOTS.slice(0, 3), { hourly: 'wave_height', forecast_days: 15 });
  const u = new URL(url);
  assert.equal(u.searchParams.get('latitude').split(',').length, 3);
  assert.equal(u.searchParams.get('forecast_days'), '15');
});

test('modèle : 15 jours, notes horaires et résumé journalier', () => {
  const spots = SPOTS.filter((s) => ['la-graviere', 'la-torche', 'gruissan'].includes(s.id));
  const weather = new Map(spots.map((s) => [s.id, weatherResponse({ windDir: s.offshore })]));
  const marine = new Map(spots.map((s) => [s.id, marineResponse({ dir: s.swell[0], med: s.region === 'mediterranee' })]));
  const model = buildModel(spots, { weather, marine, fetchedAt: Date.now(), stale: false, errors: [], marineDays: 15 });
  assert.equal(model.days.length, 15);
  assert.equal(model.days[0].short, 'Auj.');
  const g = model.spots.get('la-graviere');
  assert.ok(g.daily.every((d) => d.available));
  assert.ok(g.daily[3].score > 2, `score ${g.daily[3].score}`);
  assert.ok(g.daily[3].start <= g.daily[3].end);
  const hours = model.hours[g.daily[3].start].hour;
  assert.ok(hours >= 8 && hours <= 16, 'meilleur créneau en journée');
  assert.ok(g.tideUseful);
  assert.ok(g.extremes.length > 20);
  assert.equal(model.spots.get('gruissan').tideUseful, false);
});

test('jours sans houle : non disponibles, sans planter', () => {
  const spots = SPOTS.filter((s) => s.id === 'la-torche');
  const weather = new Map([['la-torche', weatherResponse()]]);
  const marine = new Map([['la-torche', marineResponse({ days: 8 })]]);
  const model = buildModel(spots, { weather, marine, fetchedAt: Date.now(), stale: false, errors: [], marineDays: 8 });
  const t = model.spots.get('la-torche');
  assert.ok(t.daily[2].available);
  assert.equal(t.daily[12].available, false);
});
