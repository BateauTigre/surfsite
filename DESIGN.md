# Surfsite — design system

Direction : **« marée basse »**. Un fond de sable clair, des surfaces blanches, une encre bleu
nuit et une seule couleur d'action, le bleu océan. Les données (houle, vent, notes) sont les
seules choses autorisées à être colorées. L'inspiration de départ est le tableau Windguru
(grille horaire dense, cellules colorées, étoiles en bas), rendu plus clair et moins chargé.

Pas de bibliothèque UXKIN connectée : la direction s'appuie sur la capture Windguru fournie,
sur les usages des sites de prévision de surf (tableau horaire, note en étoiles, carte des
spots) et sur les règles des skills `ui-ux-design-rules`, `web-design-system` et `dataviz`.
Thème clair uniquement (demande explicite : « couleur plutôt claire »).

## Couleurs

Toutes les valeurs sont définies une seule fois dans `css/styles.css` (`:root`) et utilisées
par leur nom. Contrastes mesurés (WCAG 2) contre le blanc.

| Jeton | Valeur | Rôle |
|---|---|---|
| `--page` | `#faf7f3` | fond de page (sable clair) |
| `--surface` | `#ffffff` | cartes, tableau, en-tête |
| `--surface-2` | `#f6f3ee` | en-têtes de tableau, zones calmes, survol |
| `--border` | `#e2dfd9` | filets (1px) |
| `--border-strong` | `#cbc7bf` | bordure des champs, séparateurs de jours |
| `--ink` | `#142935` | texte principal (15:1) |
| `--ink-2` | `#455864` | texte secondaire (7,4:1) |
| `--ink-3` | `#61717b` | méta, légendes (5,05:1) |
| `--primary` | `#00678d` | liens, boutons, sélection (6,3:1, texte blanc dessus) |
| `--primary-hover` | `#005679` | survol des actions |
| `--primary-soft` | `#def2fc` | fond d'un élément sélectionné |
| `--focus` | `#00678d` | anneau de focus 2px + 2px d'écart |
| `--danger` | `#b42318` | erreurs (texte) |

### Couleurs de données

- **Note (ordinale, 1 → 5 étoiles)** — une seule teinte océan, du clair au foncé :
  `#74bbd4`, `#459fbc`, `#1482a0`, `#006681`, `#004a5f`. Validée avec
  `validate_palette.js --ordinal` (luminosité monotone, ΔL ≥ 0,06, pas clair à 2,14:1).
  0 étoile = pastille neutre `#efece8`. Chiffre dans la pastille : encre sur 1★, blanc ensuite.
- **Étoiles** — remplissage `#efa810`, contour `#be7100` (3,8:1), étoile vide `#ece9e3`
  contour `#b5b1a7`. La note est toujours aussi donnée en texte (« 3,5/5 ») ou en `aria-label`.
- **Hauteur des vagues (séquentielle, 8 pas)** — violet clair → foncé :
  `#f3f1ff`, `#e5e0ff`, `#d1c9fc`, `#bbb0f3`, `#9c8bde`, `#8370c7`, `#6b56ad`, `#533e90`
  pour < 0,3 · 0,3 · 0,6 · 1 · 1,5 · 2 · 3 · 4,5 m. Texte encre sur les 4 premiers, blanc ensuite
  (APCA ≥ 61 partout).
- **Qualité du vent (5 états)** — teintes pâles, texte encre, toujours accompagnées d'un libellé
  (`off`, `side`, `on`) et d'une flèche : excellent `#b3eecd`, bon `#d3f4d8`, neutre `#efece8`,
  médiocre `#ffdcba`, mauvais `#ffbeac`. Pastilles (≥ 3:1) : `#249057`, `#709349`, `#89867f`,
  `#cf7b26`, `#c84435`.

## Typographie

Une seule famille, **DM Sans** variable (OFL, auto-hébergée, sous-ensemble latin de 74 Ko),
avec son axe d'optique : texte en optique automatique, titres en opsz 32–40.

| Rôle | Taille / interligne | Graisse |
|---|---|---|
| Titre de page (h1) | 28px / 1.15 (36px ≥ 1024px) | 700, interlettrage −0,02em |
| Titre de section (h2) | 20px / 1.25 | 650 |
| Sous-titre (h3) | 16px / 1.35 | 650 |
| Texte | 16px / 1.5 | 400 |
| Texte secondaire | 14px / 1.45 | 400–500 |
| Données de tableau | 13px / 1.2 | 500–600 |
| Méta, légendes | 12px / 1.4 | 500 |

Lignes de texte : 60 à 75 caractères maximum (`max-width: 68ch`).

## Espacements

Échelle de 4 : `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Largeur de contenu max 1280px,
gouttières 16px (mobile) puis 24px. Espace entre sections : 32px (mobile), 48px (desktop).

## Formes et profondeur

- Rayons : `6px` (champs, puces), `10px` (cartes), `999px` (pastilles).
- Cartes à plat avec filet `--border`. Une seule ombre, réservée à ce qui flotte (menu de
  recherche, bulle de carte) : `0 1px 2px rgb(20 41 53 / .06), 0 8px 24px rgb(20 41 53 / .10)`.

## Composants

- **En-tête** : collant, blanc, filet bas. Logo à gauche, recherche au centre, heure de mise
  à jour + bouton d'actualisation à droite.
- **Recherche** : combobox ARIA, résultats au clavier (↑ ↓ Entrée Échap), raccourci `/`.
- **Puces de jour** (15) : défilement horizontal, jour + meilleure note de la zone ; sélection
  = fond `--primary-soft` + bordure `--primary`.
- **Sélecteurs** (région, niveau) : `<select>` natifs stylés, étiquette visible.
- **Ligne du top 10** : rang, nom, ville, étoiles + note chiffrée, taille, période, vent,
  meilleur créneau, niveau. Toute la ligne est cliquable (≥ 44px de haut).
- **Pastille de carte** : rond 28px coloré par la note, anneau blanc 2px, chiffre au centre.
  Petits points de 12px quand on dézoome, nom affiché quand on zoome.
- **Tuiles « maintenant »** : libellé, valeur, détail. Chiffres proportionnels.
- **Tableau horaire** : première colonne collante, une colonne par heure, filet entre les jours,
  heures de nuit grisées, heure actuelle soulignée, ligne d'étoiles en bas.
- **Courbe de marée** : ligne 2px, aplat à 10%, filets 1px, repère « maintenant », réticule au
  survol avec bulle ; les horaires PM/BM sont aussi écrits en texte.
- **Boutons** : principal (fond `--primary`), secondaire (filet), discret (texte). États survol,
  focus visible, désactivé.
- **Bandeaux** : info (fond `--primary-soft`), erreur (texte `--danger` + icône).

## Icônes et images

Un seul jeu d'icônes SVG maison (trait 1,75px, extrémités arrondies) : vague, vent, marée,
thermomètre, goutte, flèches de direction, étoiles, loupe, planches (mousse, longboard,
mid-length, fish, shortboard, step-up, gun). Pas d'emoji. Fond de carte clair
OpenFreeMap « Positron ». Pas de photos.

## Mouvement

Transitions de 120 à 200 ms sur les couleurs et l'opacité uniquement. Vol vers un spot sur la
carte en 600 ms. Tout est coupé avec `prefers-reduced-motion: reduce`.

## À éviter

Dégradés violets, glassmorphisme, cartes identiques en série, texte en dégradé, couleurs de
données appliquées au texte, chiffres sur chaque point d'une courbe.
