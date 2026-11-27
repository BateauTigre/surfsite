// Marée : pleines et basses mers à partir de la hauteur d'eau horaire du modèle,
// puis position dans le cycle (0 = basse mer, 1 = pleine mer).

/**
 * Trouve les extremums (PM / BM) d'une série horaire.
 * times : secondes UNIX ; values : hauteurs (m) ou null.
 * Renvoie [{ t, v, type: 'high' | 'low' }] trié dans le temps, en alternance.
 */
export function findExtremes(times, values) {
  const raw = [];
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[i - 1];
    const b = values[i];
    const c = values[i + 1];
    if (a == null || b == null || c == null) continue;
    const isMax = b >= a && b > c;
    const isMin = b <= a && b < c;
    if (!isMax && !isMin) continue;
    // Affinage parabolique sur trois points pour ne pas être prisonnier de l'heure ronde.
    const denom = a - 2 * b + c;
    let off = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    off = Math.max(-0.5, Math.min(0.5, off));
    const v = b - 0.25 * (a - c) * off;
    const step = times[i + 1] - times[i];
    raw.push({ t: times[i] + off * step, v, type: isMax ? 'high' : 'low' });
  }
  const out = [];
  for (const e of raw) {
    const last = out[out.length - 1];
    if (last && last.type === e.type) {
      if ((e.type === 'high' && e.v > last.v) || (e.type === 'low' && e.v < last.v)) out[out.length - 1] = e;
      continue;
    }
    // Petite oscillation (surcote, bruit du modèle) : on l'ignore.
    if (last && (Math.abs(e.v - last.v) < 0.12 || e.t - last.t < 3 * 3600)) continue;
    out.push(e);
  }
  return out;
}

/** Position dans le cycle de marée pour chaque heure (NaN si inconnue ou marnage trop faible). */
export function tideStages(times, values, extremes, minRange = 0.3) {
  const n = values.length;
  const st = new Float32Array(n).fill(NaN);
  if (extremes.length < 2) return st;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null) continue;
    const t = times[i];
    while (k < extremes.length - 2 && extremes[k + 1].t <= t) k++;
    const e0 = extremes[k];
    const e1 = extremes[k + 1];
    const hi = Math.max(e0.v, e1.v);
    const lo = Math.min(e0.v, e1.v);
    if (hi - lo < minRange) continue;
    st[i] = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  }
  return st;
}

/** Marée montante (+1), descendante (−1) ou étale (0) à l'heure i. */
export function tideTrend(values, i) {
  const a = values[i];
  const b = values[i + 1] ?? null;
  const p = values[i - 1] ?? null;
  if (a == null) return 0;
  const d = b != null ? b - a : p != null ? a - p : 0;
  if (Math.abs(d) < 0.03) return 0;
  return d > 0 ? 1 : -1;
}
