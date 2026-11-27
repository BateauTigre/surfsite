// Note de surf (0 à 5 étoiles) : qualité des VAGUES au spot, pas force du vent.
//
// Pour chaque heure :
//   1. on garde la part de houle et de mer de vent qui entre vraiment au spot
//      (fenêtre de houle propre au spot + facteur d'abri) ;
//   2. on en déduit la hauteur des vagues qui déferlent (plus la période est longue,
//      plus la vague grossit en arrivant sur le fond) ;
//   3. on compare cette hauteur à la plage de taille où le spot fonctionne ;
//   4. on pondère par la période (puissance et propreté), par le vent RELATIF au spot
//      (offshore = vagues lisses, onshore = vagues hachées) et par la marée préférée ;
//   5. la qualité intrinsèque du spot fixe le plafond : seul un spot d'exception peut
//      atteindre 5 étoiles.

import { angleDiff } from './geo.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

export const LEVELS = { 1: 'Débutant', 2: 'Intermédiaire', 3: 'Confirmé', 4: 'Expert' };

/** Part d'une houle venant de `dir` qui atteint le spot (0,08 à 1). */
export function directionFactor(dir, center, half) {
  if (dir == null || Number.isNaN(dir)) return 0.6;
  const d = angleDiff(dir, center);
  if (d <= half) return 1 - 0.3 * (d / half) ** 2;
  if (d <= half + 40) return 0.7 - 0.62 * ((d - half) / 40);
  return 0.08;
}

/**
 * Houle efficace au spot à partir des composantes du modèle.
 * x : { hs, tp, dir, hsw, tsw, dsw, hww, tww, dww, wd }
 */
export function effectiveWaves(spot, x) {
  const comps = [];
  if (x.hsw != null && x.hsw > 0.05) comps.push({ h: x.hsw, t: x.tsw ?? x.tp, d: x.dsw ?? x.dir });
  if (x.hww != null && x.hww > 0.05) comps.push({ h: x.hww, t: x.tww ?? Math.min(x.tp ?? 6, 7), d: x.dww ?? x.wd ?? x.dir });
  if (!comps.length && x.hs != null) comps.push({ h: x.hs, t: x.tp, d: x.dir });
  if (!comps.length) return null;
  let e = 0;
  let et = 0;
  for (const c of comps) {
    const he = c.h * directionFactor(c.d, spot.swell[0], spot.swell[1]);
    e += he * he;
    et += he * he * (c.t ?? 7);
  }
  const heff = Math.sqrt(e) * (spot.exposure ?? 1);
  const teff = e > 0 ? et / e : comps[0].t ?? 7;
  return { heff, teff };
}

/** Hauteur des vagues au déferlement (m), estimée depuis la houle efficace. */
export function surfHeight(heff, teff) {
  return heff * clamp(0.55 + 0.05 * (teff ?? 8), 0.8, 1.35);
}

/** Adéquation taille / spot : 1 dans la plage idéale, moins si trop petit ou trop gros. */
export function sizeScore(S, [min, lo, hi, max]) {
  if (S < min) return 0.4 * Math.pow(Math.max(S, 0) / min, 2);
  if (S < lo) return 0.4 + (0.6 * (S - min)) / (lo - min);
  if (S <= hi) return 1;
  if (S <= max) return 1 - (0.45 * (S - hi)) / (max - hi);
  return 0.55 * Math.exp(-(S - max) / (0.35 * max));
}

/** Période : 5 s ou moins = mer de vent (0,4), 13 s et plus = houle longue (1). */
export function periodScore(T) {
  if (T == null) return 0.6;
  return 0.4 + 0.6 * clamp((T - 5) / 8, 0, 1);
}

export const WIND_LABELS = {
  glassy: 'Pas de vent',
  offshore: 'Offshore',
  'side-off': 'Side-off',
  side: 'Side-shore',
  'side-on': 'Side-on',
  onshore: 'Onshore',
  unknown: '—',
};

export const WIND_SHORT = {
  glassy: 'calme', offshore: 'off', 'side-off': 'off', side: 'side', 'side-on': 'on', onshore: 'on', unknown: '',
};

/** Effet du vent sur la qualité des vagues, relatif à l'orientation du spot. */
export function windInfo(spot, speed, dir, gust) {
  if (speed == null || dir == null || Number.isNaN(speed)) {
    return { factor: 1, cat: 'unknown', alpha: null, eff: null };
  }
  const alpha = angleDiff(dir, spot.offshore); // 0 = offshore pur, 180 = onshore pur
  const eff = speed + 0.2 * Math.max(0, (gust ?? speed) - speed);
  let cat;
  if (eff < 6) cat = 'glassy';
  else if (alpha <= 45) cat = 'offshore';
  else if (alpha <= 80) cat = 'side-off';
  else if (alpha <= 110) cat = 'side';
  else if (alpha <= 145) cat = 'side-on';
  else cat = 'onshore';
  const onshoreness = Math.pow((1 - Math.cos((alpha * Math.PI) / 180)) / 2, 0.7);
  const strength = Math.pow(clamp((eff - 5) / 30, 0, 1), 0.8) * 0.92;
  let factor = 1 - onshoreness * strength;
  if (alpha < 70 && eff > 30) factor -= 0.35 * clamp((eff - 30) / 25, 0, 1); // offshore trop fort
  return { factor: clamp(factor, 0.05, 1), cat, alpha, eff };
}

/** Classe 1 (mauvais) à 5 (excellent) pour colorer le vent. */
export function windClass(factor) {
  if (factor == null) return 3;
  return factor >= 0.9 ? 5 : factor >= 0.75 ? 4 : factor >= 0.6 ? 3 : factor >= 0.4 ? 2 : 1;
}

const TIDE_PREFS = {
  all: [1, 1, 1],
  low: [1, 0.6, 0.2],
  'low-mid': [1, 1, 0.45],
  mid: [0.6, 1, 0.6],
  'mid-high': [0.45, 1, 1],
  high: [0.2, 0.6, 1],
};

export const TIDE_LABELS = {
  all: 'Toutes marées',
  low: 'Marée basse',
  'low-mid': 'Marée basse à mi-marée',
  mid: 'Mi-marée',
  'mid-high': 'Mi-marée à marée haute',
  high: 'Marée haute',
};

/** Effet de la marée : `stage` 0 = basse mer, 1 = pleine mer. */
export function tideFactor(spot, stage) {
  const p = TIDE_PREFS[spot.tide] || TIDE_PREFS.all;
  if (!spot.tide || spot.tide === 'all') return 1;
  if (stage == null || Number.isNaN(stage)) return 0.55 + 0.45 * ((p[0] + p[1] + p[2]) / 3);
  const pref = stage <= 0.5 ? lerp(p[0], p[1], stage / 0.5) : lerp(p[1], p[2], (stage - 0.5) / 0.5);
  return 0.55 + 0.45 * pref;
}

// Plafond de note selon la qualité intrinsèque du spot : un spot moyen plafonne à 3 étoiles,
// un bon spot à 4, seuls les très bons et les spots d'exception peuvent viser 5.
export const QUALITY_CEILING = { 1: 0.6, 2: 0.68, 3: 0.8, 4: 0.92, 5: 1 };

/** Note continue de 0 à 5 pour une heure donnée, avec le détail du calcul. */
export function rateHour(spot, x) {
  const w = effectiveWaves(spot, x);
  if (!w) return null;
  const surf = surfHeight(w.heff, w.teff);
  const size = sizeScore(surf, spot.size);
  const per = periodScore(w.teff);
  const wind = windInfo(spot, x.ws, x.wd, x.wg);
  const tide = tideFactor(spot, x.tideStage);
  const ceiling = QUALITY_CEILING[spot.quality] ?? 0.8;
  const score = clamp(5 * size * per * wind.factor * tide * ceiling, 0, 5);
  return { score, surf, period: w.teff, heff: w.heff, size, per, wind, tide };
}

/** Étoiles entières (ligne du tableau horaire). */
export function starsOf(score) {
  if (score == null || score < 0.75) return 0;
  return Math.min(5, Math.round(score));
}

/** Demi-étoiles (notes journalières). */
export function halfStarsOf(score) {
  if (score == null || score < 0.3) return 0;
  return Math.min(5, Math.round(score * 2) / 2);
}

export const SCORE_WORDS = ['Flat ou inexploitable', 'Médiocre', 'Moyen', 'Bon', 'Très bon', 'Exceptionnel'];

export function scoreWord(score) {
  return SCORE_WORDS[starsOf(score)];
}

/** Niveau imposé par les conditions (taille et puissance). */
export function conditionLevel(S, T) {
  let lv = S < 0.6 ? 1 : S < 1.1 ? 2 : S < 1.9 ? 3 : 4;
  if (T >= 13 && S >= 1.0) lv = Math.max(lv, 3);
  if (T >= 14 && S >= 1.6) lv = 4;
  return lv;
}

export function requiredLevel(spot, S, T) {
  if (S == null) return spot.level;
  return Math.max(spot.level, conditionLevel(S, T ?? 8));
}

export const BOARDS = {
  mousse: { name: 'Mousse', size: '7\'–8\'', icon: 'board-soft' },
  longboard: { name: 'Longboard', size: '9\' et +', icon: 'board-long' },
  midlength: { name: 'Mid-length', size: '7\'–8\'', icon: 'board-mid' },
  fish: { name: 'Fish', size: '5\'6–6\'2', icon: 'board-fish' },
  shortboard: { name: 'Shortboard', size: '5\'10–6\'4', icon: 'board-short' },
  stepup: { name: 'Step-up', size: '6\'6–7\'2', icon: 'board-stepup' },
  gun: { name: 'Gun', size: '7\'6 et +', icon: 'board-gun' },
};

/** Planches conseillées (2 ou 3), de la plus adaptée à la moins adaptée. */
export function suggestBoards({ surf: S, period: T, windFactor = 1, level = 1, spotLevel = 1 }) {
  const out = [];
  const add = (id, why) => {
    if (!out.some((b) => b.id === id)) out.push({ id, ...BOARDS[id], why });
  };
  const clean = windFactor >= 0.75;
  const powerful = (T ?? 8) >= 11;
  if (S == null) return out;
  if (S < 0.3) {
    add('longboard', 'Quasi flat : seul un longboard (ou un paddle) arrive à glisser.');
    return out;
  }
  if (S < 0.7) {
    add('longboard', 'Petites vagues : le volume fait toute la différence.');
    if (spotLevel <= 2) add('mousse', 'Parfaite pour débuter ou s\'amuser sans risque.');
    add('fish', 'Pour les surfeurs à l\'aise qui veulent garder de la vitesse.');
  } else if (S < 1.2) {
    if (powerful && clean) {
      add('shortboard', 'Vagues petites mais puissantes et propres.');
      add('fish', 'Plus de glisse si les vagues mollissent.');
    } else {
      add('fish', 'Vagues moyennes un peu molles : une planche large et volumineuse.');
      add('midlength', 'Confortable et polyvalente dans ces conditions.');
    }
    if (level <= 2 && spotLevel <= 2) add('mousse', 'Pour les débutants, dans la mousse ou avec un moniteur.');
    else add('longboard', 'Pour profiter des longues vagues.');
  } else if (S < 2.0) {
    add('shortboard', 'Taille idéale pour le shortboard.');
    if (S >= 1.6 && powerful) add('stepup', 'Un peu plus de longueur pour partir dans les séries.');
    else add('fish', 'Si les vagues sont molles ou le vent de travers.');
  } else if (S < 3.2) {
    add('stepup', 'Vagues de taille : il faut ramer tôt et tenir sa ligne.');
    add('shortboard', 'Pour les plus à l\'aise, sur les séries moins grosses.');
  } else {
    add('gun', 'Grosses vagues : une planche longue et étroite pour ramer.');
    add('stepup', 'Sur les séries les moins grosses.');
  }
  return out.slice(0, 3);
}

/** Combinaison conseillée selon la température de l'eau (°C). */
export function wetsuitFor(sst) {
  if (sst == null || Number.isNaN(sst)) return null;
  if (sst >= 23) return { suit: 'Lycra ou shorty', extras: '' };
  if (sst >= 20) return { suit: 'Shorty ou 2 mm', extras: '' };
  if (sst >= 17) return { suit: '3/2 mm', extras: '' };
  if (sst >= 15) return { suit: '4/3 mm', extras: '' };
  if (sst >= 13) return { suit: '4/3 mm', extras: 'chaussons conseillés' };
  if (sst >= 10.5) return { suit: '5/4 mm', extras: 'chaussons et gants' };
  return { suit: '5/4 ou 6/5 mm', extras: 'chaussons, gants et cagoule' };
}

const WAVE_STEPS = [0.3, 0.6, 1, 1.5, 2, 3, 4.5];

/** Classe de couleur 0 à 7 pour une hauteur de vague. */
export function waveClass(S) {
  if (S == null) return -1;
  let i = 0;
  while (i < WAVE_STEPS.length && S >= WAVE_STEPS[i]) i++;
  return i;
}
