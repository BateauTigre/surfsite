// Petits outils de géométrie : angles, points cardinaux, distances.

const DEG = Math.PI / 180;

/** Écart angulaire absolu entre deux directions, de 0 à 180°. */
export function angleDiff(a, b) {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

/** Ramène un angle dans [0, 360). */
export function normAngle(a) {
  return ((a % 360) + 360) % 360;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const COMPASS_LONG = {
  N: 'nord', NNE: 'nord-nord-est', NE: 'nord-est', ENE: 'est-nord-est', E: 'est', ESE: 'est-sud-est',
  SE: 'sud-est', SSE: 'sud-sud-est', S: 'sud', SSO: 'sud-sud-ouest', SO: 'sud-ouest', OSO: 'ouest-sud-ouest',
  O: 'ouest', ONO: 'ouest-nord-ouest', NO: 'nord-ouest', NNO: 'nord-nord-ouest',
};

/** Point cardinal (16 secteurs, notation française : O = ouest). */
export function compass(deg) {
  if (deg == null || Number.isNaN(deg)) return '–';
  return COMPASS[Math.round(normAngle(deg) / 22.5) % 16];
}

export function compassLong(deg) {
  return COMPASS_LONG[compass(deg)] || '';
}

/** Décrit une fenêtre de houle « O à NO » à partir du centre et de la demi-ouverture. */
export function windowLabel(center, half) {
  const span = Math.min(half, 45);
  const a = compass(center - span * 0.6);
  const b = compass(center + span * 0.6);
  return a === b ? a : `${a} à ${b}`;
}

/** Distance orthodromique en km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
