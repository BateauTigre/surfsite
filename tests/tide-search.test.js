import test from 'node:test';
import assert from 'node:assert/strict';
import { findExtremes, tideStages, tideTrend } from '../js/lib/tide.js';
import { buildIndex, searchSpots, normalize } from '../js/lib/search.js';
import { SPOTS, REGION_BY_ID } from '../js/data/spots.js';

test('marée : pleines et basses mers alternées, environ toutes les 6 h 12', () => {
  const t0 = 1_700_000_000;
  const times = Array.from({ length: 72 }, (_, i) => t0 + i * 3600);
  const period = 44712; // 12 h 25
  const values = times.map((t) => 2 * Math.sin((2 * Math.PI * (t - t0)) / period));
  const ex = findExtremes(times, values);
  assert.ok(ex.length >= 10);
  for (let i = 1; i < ex.length; i++) {
    assert.notEqual(ex[i].type, ex[i - 1].type);
    const gap = (ex[i].t - ex[i - 1].t) / 3600;
    assert.ok(gap > 5.5 && gap < 7, `écart ${gap}`);
  }
  const first = ex[0];
  assert.equal(first.type, 'high');
  assert.ok(Math.abs((first.t - t0) / 3600 - 3.105) < 0.25, 'heure de PM affinée');
  const st = tideStages(times, values, ex);
  const hi = ex.find((e) => e.type === 'high');
  const iHi = Math.round((hi.t - t0) / 3600);
  assert.ok(st[iHi] > 0.95);
  assert.equal(tideTrend(values, 1), 1);
});

test('marée négligeable : aucune position calculée', () => {
  const times = Array.from({ length: 48 }, (_, i) => i * 3600);
  const values = times.map((t) => 0.05 * Math.sin(t / 7000));
  const st = tideStages(times, values, findExtremes(times, values));
  assert.ok(Array.from(st).every((v) => Number.isNaN(v)));
});

test('recherche : accents, tirets, fautes de frappe', () => {
  const idx = buildIndex(SPOTS, (id) => REGION_BY_ID.get(id)?.label || '');
  assert.equal(normalize('Côte-des-Basques'), 'cote des basques');
  assert.equal(searchSpots(idx, 'graviere')[0].id, 'la-graviere');
  assert.equal(searchSpots(idx, 'LA TORCHE')[0].id, 'la-torche');
  assert.equal(searchSpots(idx, 'lostmarch')[0].id, 'lostmarch');
  assert.ok(searchSpots(idx, 'hossegor').some((s) => s.id === 'la-nord'));
  assert.ok(searchSpots(idx, 'hosegor').length > 0, 'faute de frappe tolérée');
  assert.ok(searchSpots(idx, 'landes', 30).length >= 20);
  assert.deepEqual(searchSpots(idx, 'zzzzzz'), []);
});
