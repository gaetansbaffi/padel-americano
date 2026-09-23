# Padel Americano

**Application en ligne : https://gaetansbaffi.github.io/padel-americano/**

Application web locale pour organiser un tournoi de padel au format Americano.
React + TypeScript + Vite, tests Vitest. Aucun backend : tout est stocké dans
le navigateur (localStorage), avec export/import JSON.

## Lancer

Prérequis : Node.js 20+ (LTS recommandé).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests Vitest (moteur + état)
npm run build      # typecheck + build dans dist/
npm run preview    # sert dist/ localement
```

Pour y accéder depuis un téléphone sur le même Wi-Fi : `npm run dev -- --host`.

## Structure

```
src/
  engine/            Moteur Americano, pur TypeScript (aucune dépendance UI)
    feasibility.ts   Compatibilité N×M/4, valeurs proches, taille des rotations, durée
    generator.ts     Génération du planning (repos + recherche locale)
    analysis.ts      Contraintes absolues et indicateurs de qualité
    standings.ts     Classement
    *.test.ts        Tests Vitest
  state/
    tournament.ts    Modèle du tournoi et opérations pures (scores, régénération…)
    storage.ts       localStorage, export/import JSON validé
  views/             Écrans React (Tournoi, Matchs, Classement, Planning)
  App.tsx            Navigation par onglets + sauvegarde automatique
```

## Algorithme (résumé)

1. Matchs restants par joueur = cible − matchs déjà joués ; si N×M/4 n'est pas
   entier, quelques joueurs jouent un match de moins (écart max. 1).
2. Nombre minimal de rotations, matchs répartis uniformément.
3. Rotation par rotation, jouent ceux qui ont le plus de matchs restants (égalité :
   priorité à ceux qui sortent d'un repos) → quotas exacts, repos étalés.
4. Recherche locale itérée (échanges de joueurs ou d'équipes dans une rotation),
   score lexicographique : partenaires → adversaires → matchs identiques → mixité.
5. 8 tentatives à graines dérivées, la meilleure est gardée. Même graine = même planning.

Les rotations contenant un score sont verrouillées : une régénération ne recalcule
que les rotations suivantes, en tenant compte de l'historique.

## Hébergement (Artifact claude.ai)

```bash
npm run build:artifact
```

Publie `artifact/index.html` avec `dist-artifact/assets/app.js` et `app.css` comme fichiers
associés. React 18 est chargé depuis cdnjs (seul hôte autorisé) via les shims de
`artifact/shims/`. Dans cet environnement, les téléchargements et `confirm()` sont
bloqués : l'app utilise des dialogues intégrés et un export par copier-coller.

## Déploiement GitHub Pages

Chaque push sur `main` lance `.github/workflows/deploy.yml` : tests, build, puis mise en ligne
sur https://gaetansbaffi.github.io/padel-americano/ (1 à 2 minutes).
