import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOT_BY_ID } from '../js/data/spots.js';
import { rateHour, starsOf, halfStarsOf, windInfo, directionFactor, sizeScore, requiredLevel, suggestBoards, wetsuitFor, waveClass } from '../js/lib/rating.js';
import { angleDiff, compass } from '../js/lib/geo.js';

const grav = SPOT_BY_ID.get('la-graviere');
const base = { hsw: 2, tsw: 14, dsw: 280, ws: 8, wd: 95, wg: 12, tideStage: 0.5 };

test('géométrie de base', () => {
  assert.equal(angleDiff(350, 10), 20);
  assert.equal(angleDiff(90, 270), 180);
  assert.equal(compass(270), 'O');
  assert.equal(compass(315), 'NO');
  assert.equal(compass(0), 'N');
});

test('une journée épique à La Gravière vaut 5 étoiles', () => {
  assert.equal(starsOf(rateHour(grav, base).score), 5);
});

test('le vent onshore dégrade fortement la note', () => {
  const off = rateHour(grav, base).score;
  const on = rateHour(grav, { ...base, ws: 25, wd: 275, wg: 35 }).score;
  assert.ok(on < off / 2, `${on} devrait être bien inférieur à ${off}`);
  assert.equal(windInfo(grav, 25, 275, 35).cat, 'onshore');
  assert.equal(windInfo(grav, 3, 275, 4).cat, 'glassy');
});

test('une houle hors fenêtre compte peu', () => {
  assert.ok(directionFactor(100, 285, 60) < 0.1);
  assert.ok(directionFactor(285, 285, 60) === 1);
});

test('trop petit ou trop gros : note basse', () => {
  assert.equal(starsOf(rateHour(grav, { ...base, hsw: 0.4, tsw: 8 }).score), 0);
  assert.equal(starsOf(rateHour(SPOT_BY_ID.get('les-estagnots'), { ...base, hsw: 5.5, tsw: 16 }).score), 0);
  assert.ok(sizeScore(1.5, [0.6, 1, 2, 3]) === 1);
});

test('Belharra ne se réveille qu\'avec une très grosse houle', () => {
  const b = SPOT_BY_ID.get('belharra');
  assert.equal(starsOf(rateHour(b, { hsw: 2, tsw: 12, dsw: 305, ws: 10, wd: 140 }).score), 0);
  assert.ok(starsOf(rateHour(b, { hsw: 7, tsw: 17, dsw: 310, ws: 10, wd: 140 }).score) >= 4);
});

test('un spot moyen plafonne sous 5 étoiles', () => {
  const touquet = SPOT_BY_ID.get('le-touquet');
  const r = rateHour(touquet, { hsw: 1.1, tsw: 14, dsw: 285, ws: 5, wd: 95, tideStage: 0.8 });
  assert.ok(r.score < 4);
});

test('la marée préférée compte (Côte des Basques)', () => {
  const cdb = SPOT_BY_ID.get('cote-des-basques');
  const low = rateHour(cdb, { hsw: 1.2, tsw: 12, dsw: 290, ws: 6, wd: 100, tideStage: 0 }).score;
  const high = rateHour(cdb, { hsw: 1.2, tsw: 12, dsw: 290, ws: 6, wd: 100, tideStage: 1 }).score;
  assert.ok(low > high);
});

test('arrondis des étoiles', () => {
  assert.equal(halfStarsOf(3.26), 3.5);
  assert.equal(halfStarsOf(3.2), 3);
  assert.equal(starsOf(0.7), 0);
  assert.equal(starsOf(4.6), 5);
});

test('niveau, planches et combinaison', () => {
  const touquet = SPOT_BY_ID.get('le-touquet');
  assert.equal(requiredLevel(touquet, 0.5, 8), 1);
  assert.equal(requiredLevel(touquet, 2.5, 14), 4);
  assert.equal(requiredLevel(grav, 0.5, 8), 3);
  assert.equal(suggestBoards({ surf: 0.5, period: 8, spotLevel: 1 })[0].id, 'longboard');
  assert.equal(suggestBoards({ surf: 1.6, period: 12, windFactor: 1 })[0].id, 'shortboard');
  assert.equal(suggestBoards({ surf: 4, period: 16 })[0].id, 'gun');
  assert.equal(wetsuitFor(14.5).suit, '4/3 mm');
  assert.equal(wetsuitFor(24).suit, 'Lycra ou shorty');
  assert.equal(waveClass(0.1), 0);
  assert.equal(waveClass(1.2), 3);
  assert.equal(waveClass(5), 7);
});
