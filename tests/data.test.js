import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, REGIONS, TYPES, BOTTOMS, HAZARDS } from '../js/data/spots.js';

test('chaque spot est complet et cohérent', () => {
  const ids = new Set();
  const regions = new Set(REGIONS.map((r) => r.id));
  for (const s of SPOTS) {
    assert.ok(!ids.has(s.id), `id en double : ${s.id}`);
    ids.add(s.id);
    assert.match(s.id, /^[a-z0-9-]+$/);
    assert.ok(regions.has(s.region), `${s.id} : région inconnue`);
    assert.ok(s.name && s.town && s.dept && s.desc, `${s.id} : champs texte manquants`);
    // Métropole + Corse
    assert.ok(s.lat > 41.3 && s.lat < 51.2, `${s.id} : latitude hors de France`);
    assert.ok(s.lon > -5.2 && s.lon < 9.6, `${s.id} : longitude hors de France`);
    assert.ok(s.facing >= 0 && s.facing < 360);
    assert.ok(s.offshore >= 0 && s.offshore < 360);
    assert.equal(s.swell.length, 2);
    assert.ok(s.swell[1] >= 25 && s.swell[1] <= 80, `${s.id} : fenêtre de houle irréaliste`);
    assert.ok(TYPES[s.type], `${s.id} : type inconnu`);
    assert.ok(BOTTOMS[s.bottom], `${s.id} : fond inconnu`);
    assert.ok([1, 2, 3, 4].includes(s.level));
    assert.ok([1, 2, 3, 4, 5].includes(s.quality));
    assert.ok(['all', 'low', 'low-mid', 'mid', 'mid-high', 'high'].includes(s.tide), `${s.id} : marée inconnue`);
    const [min, lo, hi, max] = s.size;
    assert.ok(min > 0 && min < lo && lo < hi && hi < max, `${s.id} : tailles non ordonnées`);
    for (const h of s.hazards || []) assert.ok(HAZARDS[h], `${s.id} : danger inconnu ${h}`);
    if (s.exposure != null) assert.ok(s.exposure > 0 && s.exposure <= 1);
  }
});

test('le vent offshore vient de la terre (à ±60° de l\'opposé de l\'orientation)', () => {
  for (const s of SPOTS) {
    const opposite = (s.facing + 180) % 360;
    const d = Math.abs(((s.offshore - opposite + 540) % 360) - 180);
    assert.ok(d <= 60, `${s.id} : offshore ${s.offshore}° incohérent avec une plage face à ${s.facing}°`);
  }
});

test('toutes les régions ont des spots', () => {
  for (const r of REGIONS) assert.ok(SPOTS.some((s) => s.region === r.id), r.id);
  assert.ok(SPOTS.length >= 120);
});
