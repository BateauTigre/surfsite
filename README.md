# Surfsite

Conditions de surf en France en temps réel : **124 spots** du Nord à la Corse, une note des vagues
de 0 à 5 étoiles calculée spot par spot, le top 10 du jour (France entière ou par région), une carte
interactive, une recherche et **15 jours** de prévisions.

**Site en ligne : https://bateautigre.github.io/surfsite/**

## Ce que fait le site

- **Top 10 du jour** pour toute la France ou une région, filtrable par niveau (« Mon niveau »).
- **Carte interactive** de tous les spots, colorés selon la note du jour (MapLibre + fond clair OpenFreeMap).
- **Recherche** tolérante aux accents et aux fautes de frappe (raccourci `/`).
- **15 jours** : aujourd'hui + 14 jours, jour par jour.
- **Fiche de chaque spot** :
  - note du jour, meilleur créneau de 3 h, conditions actuelles (vagues, vent, marée, eau, air) ;
  - niveau conseillé selon le spot *et* les conditions, planches conseillées, combinaison selon l'eau ;
  - tableau horaire façon Windguru (heure par heure ou 15 jours toutes les 3 h) avec la **note des vagues en étoiles tout en bas** ;
  - courbe de marée avec pleines et basses mers ;
  - fiche du spot : type, fond, orientation, houle / vent / marée idéaux, taille idéale, dangers, rose d'orientation ;
  - spots proches.
- Actualisation automatique toutes les heures (les modèles sont mis à jour plusieurs fois par jour).

## D'où viennent les données

Les grands sites de surf n'ouvrent pas leurs données gratuitement : Surfline n'a pas d'API publique,
Windguru ne propose pas d'API de prévision ouverte, l'API Windy est payante et Stormglass est limitée
à 10 requêtes par jour en gratuit. Le site utilise donc **[Open-Meteo](https://open-meteo.com/)**, gratuit et
sans clé, qui redistribue les mêmes modèles que ces sites :

| Donnée | Source | Horizon |
|---|---|---|
| Houle, mer du vent, périodes, directions | API marine : Météo-France MFWAM (≈ 8 km), puis NOAA GFS-Wave (≈ 25 km) en relais | 9-10 jours + relais jusqu'à 15 jours |
| Marée (hauteur d'eau) | Météo-France SMOC (≈ 8 km) | ≈ 10 jours |
| Température de l'eau | Météo-France | ≈ 10 jours |
| Vent, rafales, air, ciel, lever / coucher du soleil | API météo : Météo-France AROME/ARPEGE, ECMWF IFS, NOAA GFS | 15 jours |

Le modèle MFWAM s'arrête vers 9-10 jours : pour les jours suivants (et pour boucher un éventuel trou),
la houle vient du modèle NOAA GFS-Wave, moins fin. La fiche spot indique à partir de quand.

Quota gratuit Open-Meteo (par adresse IP) : 600 appels/minute, 5 000/heure, 10 000/jour. Un chargement
complet fait 15 requêtes (environ 420 appels « pondérés ») ; les réponses sont gardées 45 minutes dans le
cache du navigateur. Données sous licence CC BY 4.0.

## Comment est calculée la note (0 à 5 étoiles)

La note mesure la **qualité des vagues**, pas la force du vent (contrairement aux étoiles de Windguru,
pensées pour le kite et la planche à voile). Pour chaque heure (`js/lib/rating.js`) :

1. on garde la part de houle et de mer du vent qui entre au spot, selon sa **fenêtre de houle** et son **abri** ;
2. on estime la **hauteur au bord** (une houle longue grossit en arrivant sur le fond) ;
3. on compare cette taille à la plage où le spot **fonctionne** (trop petit ou saturé = note basse) ;
4. on pondère par la **période**, le **vent relatif à la plage** (offshore = lisse, onshore = haché)
   et la **marée préférée** du spot ;
5. la **qualité propre du spot** fixe le plafond : un spot moyen plafonne à 3 étoiles, seuls les
   très bons spots et les spots d'exception peuvent atteindre 5.

La note du jour est la moyenne du meilleur créneau de 3 heures entre le lever et le coucher du soleil.

## Les spots

Tout est dans `js/data/spots.js` (une entrée par spot, commentée). Les caractéristiques viennent de
guides publics (Wannasurf, Surf-Forecast, Surf-Report, offices de tourisme) et de l'orientation des
côtes. Les coordonnées sont approximatives à quelques centaines de mètres près. Pour ajouter un spot,
copiez une entrée existante et ajustez : `facing` (orientation de la plage), `swell` (houle idéale et
largeur de la fenêtre), `offshore` (vent idéal), `size` (tailles où ça marche), `level`, `quality`.
Les tests vérifient la cohérence (`npm test`).

## Lancer en local

Aucun build, aucune dépendance à installer :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Tests (Node 20 ou plus) : `npm test`.

À chaque push sur `main`, GitHub Actions (workflow « Vérifications ») relance ces tests,
télécharge les vraies prévisions des 124 spots et ouvre le site dans Chrome, carte comprise.
Les résultats s'affichent dans l'onglet **Actions**, avec des captures d'écran.
Le contrôle des données se lance aussi en local (accès Internet requis) : `node tests/live/donnees.mjs`.

## Structure

```
index.html            page unique (accueil + fiche spot en routage #/spot/<id>)
css/styles.css        design system (voir DESIGN.md)
js/app.js             état, routage, chargement et actualisation
js/data/spots.js      base des 124 spots
js/lib/               API Open-Meteo, modèle de données, note, marée, recherche
js/ui/                accueil, carte, fiche spot, tableau horaire, courbe de marée
tests/                tests unitaires (données, note, marée, recherche, modèle)
tests/live/           contrôles avec les vraies données et un vrai navigateur
.github/workflows/    publication du site et vérifications automatiques
```

## Déploiement

GitHub Pages sert la branche `gh-pages`. À chaque push sur `main`, le workflow « Publication »
la remet au niveau de `main` : modifiez toujours `main`, le site suit en une à deux minutes.
Ne modifiez pas `gh-pages` à la main.

## Limites

- Ce sont des prévisions de modèles : vérifiez toujours sur place (courants, drapeaux, baïnes).
- La marée est indicative (maille de 8 km) et disponible sur environ 10 jours.
- Au-delà de 9-10 jours, la houle vient d'un modèle global plus grossier (GFS-Wave) : c'est une tendance.
- Les bancs de sable bougent : un beach break peut marcher mieux ou moins bien que la note.

## Crédits

Données [Open-Meteo](https://open-meteo.com/) (CC BY 4.0) · Carte [OpenFreeMap](https://openfreemap.org/),
© OpenMapTiles, © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright) ·
[MapLibre GL JS](https://maplibre.org/) · Police DM Sans (SIL Open Font License, `assets/fonts/OFL.txt`).
