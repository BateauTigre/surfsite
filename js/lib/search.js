// Recherche de spots tolérante aux accents, aux tirets et aux petites fautes de frappe.

export function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`\-_.,/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildIndex(spots, regionLabel = () => '') {
  return spots.map((spot) => {
    const name = normalize(spot.name);
    const town = normalize(spot.town);
    const extra = normalize([spot.dept, regionLabel(spot.region), ...(spot.aka || [])].join(' '));
    return { spot, name, town, extra, words: `${name} ${town} ${extra}`.split(' ') };
  });
}

function editDistanceAtMost1(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

function tokenMatches(token, entry, fuzzy) {
  const hay = `${entry.name} ${entry.town} ${entry.extra}`;
  if (hay.includes(token)) return true;
  if (!fuzzy || token.length < 4) return false;
  return entry.words.some((w) => w.length >= 3 && (editDistanceAtMost1(token, w) || editDistanceAtMost1(token, w.slice(0, token.length))));
}

/** Renvoie les meilleurs spots pour une requête, du plus pertinent au moins pertinent. */
export function searchSpots(index, query, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ');
  const run = (fuzzy) => {
    const res = [];
    for (const e of index) {
      if (!tokens.every((t) => tokenMatches(t, e, fuzzy))) continue;
      let score = 0;
      if (e.name === q) score += 200;
      if (e.name.startsWith(q)) score += 120;
      else if (e.name.includes(q)) score += 80;
      if (e.town.startsWith(q)) score += 50;
      else if (e.town.includes(q)) score += 30;
      if (e.extra.includes(q)) score += 15;
      if (fuzzy) score -= 40;
      score -= e.name.length * 0.2;
      res.push({ spot: e.spot, score });
    }
    return res;
  };
  let res = run(false);
  if (!res.length) res = run(true);
  res.sort((a, b) => b.score - a.score || a.spot.name.localeCompare(b.spot.name, 'fr'));
  return res.slice(0, limit).map((r) => r.spot);
}
