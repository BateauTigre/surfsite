// Dates et heures, toujours exprimées à l'heure de Paris (Corse comprise).

export const TZ = 'Europe/Paris';

const partsFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});

/** Décompose un instant (secondes ou Date) en champs locaux de Paris. */
export function localParts(input) {
  const date = input instanceof Date ? input : new Date(input * 1000);
  const out = {};
  for (const p of partsFmt.formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour) % 24, minute: Number(out.minute),
    weekday: out.weekday, // « lun. », « mar. »…
    key: `${out.year}-${out.month}-${out.day}`,
  };
}

export function todayKey() {
  return localParts(new Date()).key;
}

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const WEEKDAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function weekdayIndex(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Libellés d'un jour à partir de sa clé AAAA-MM-JJ et de sa position (0 = aujourd'hui). */
export function dayLabels(key, index) {
  const [, m, d] = key.split('-').map(Number);
  const wd = weekdayIndex(key);
  const short = index === 0 ? 'Auj.' : index === 1 ? 'Demain' : capitalize(WEEKDAYS[wd]);
  const long = index === 0 ? 'Aujourd\'hui' : index === 1 ? 'Demain' : capitalize(WEEKDAYS_LONG[wd]);
  return {
    short,
    dayNum: String(d),
    month: MONTHS[m - 1],
    long: `${long} ${d} ${MONTHS_LONG[m - 1]}`,
    weekday: capitalize(WEEKDAYS_LONG[wd]),
    compact: `${capitalize(WEEKDAYS[wd])} ${d}`,
  };
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** « 14:05 » à l'heure de Paris. */
export function formatClock(input) {
  const p = localParts(input);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** « 14h » ou « 14h30 ». */
export function formatHourLabel(hour, minute = 0) {
  return minute ? `${hour}h${String(minute).padStart(2, '0')}` : `${hour}h`;
}
