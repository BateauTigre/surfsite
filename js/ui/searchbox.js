// Barre de recherche : combobox ARIA avec navigation au clavier (↑ ↓ Entrée Échap, « / » pour focus).

import { esc, fmtScore } from './format.js';
import { starsSvg } from './icons.js';
import { buildIndex, searchSpots } from '../lib/search.js';
import { REGION_BY_ID } from '../data/spots.js';

export function initSearch({ input, list, spots, onPick, dayFor }) {
  const index = buildIndex(spots, (id) => REGION_BY_ID.get(id)?.label || '');
  let results = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const highlight = (i) => {
    const items = list.querySelectorAll('[role="option"]');
    items.forEach((el, k) => el.setAttribute('aria-selected', String(k === i)));
    active = i;
    if (i >= 0 && items[i]) {
      input.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const render = () => {
    const q = input.value;
    results = searchSpots(index, q, 8);
    if (!q.trim()) {
      close();
      return;
    }
    if (!results.length) {
      list.innerHTML = `<li class="sr-empty" role="presentation">Aucun spot trouvé pour « ${esc(q.trim())} ».</li>`;
    } else {
      list.innerHTML = results
        .map((spot, i) => {
          const day = dayFor(spot.id);
          const right = day?.available ? `<span>${starsSvg(day.stars, 12)} <span class="num">${fmtScore(day.score)}</span></span>` : '';
          const region = REGION_BY_ID.get(spot.region)?.label || '';
          return `<li id="sr-${i}" role="option" aria-selected="false" data-id="${spot.id}"><span><span class="sr-name">${esc(spot.name)}</span><span class="sr-meta">${esc(spot.town)} · ${esc(region)}</span></span>${right}</li>`;
        })
        .join('');
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(results.length ? 0 : -1);
  };

  const pick = (id) => {
    input.value = '';
    close();
    input.blur();
    onPick(id);
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', () => {
    if (input.value.trim()) render();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (list.hidden) render();
      else if (results.length) highlight((active + 1) % results.length);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (results.length) highlight((active - 1 + results.length) % results.length);
    } else if (ev.key === 'Enter') {
      if (active >= 0 && results[active]) {
        ev.preventDefault();
        pick(results[active].id);
      }
    } else if (ev.key === 'Escape') {
      if (!list.hidden) {
        ev.preventDefault();
        close();
      } else {
        input.value = '';
      }
    }
  });
  list.addEventListener('mousedown', (ev) => ev.preventDefault());
  list.addEventListener('click', (ev) => {
    const li = ev.target.closest('[role="option"]');
    if (li) pick(li.dataset.id);
  });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.search')) close();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    ev.preventDefault();
    input.focus();
  });

  return { refresh: () => !list.hidden && render() };
}
