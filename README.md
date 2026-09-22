# Scrabble à deux

Scrabble francophone en temps réel pour 2 joueurs, jouable à distance. PWA (React) + backend Node/Fastify/Socket.io + PostgreSQL, pensé pour un usage strictement privé (2 comptes connus, pas d'inscription publique).

## Arborescence

```
packages/
  shared/    types TypeScript partagés + distribution des lettres (front + back)
  backend/   API Fastify, Socket.io, moteur de jeu, accès PostgreSQL
  frontend/  PWA React (Vite), plateau, chevalet, connexion temps réel
docker-compose.yml       Postgres seul, pour le développement local
docker-compose.prod.yml  Postgres + backend, pour le VPS (pas de reverse proxy inclus)
nginx/scrabble.conf       config nginx à installer sur le VPS (reverse proxy + TLS via certbot)
```

## Démarrage en local

1. Copier `.env.example` en `.env` et remplir les valeurs (voir ci-dessous pour les mots de passe et les clés VAPID).
2. Lancer Postgres : `docker compose up -d`
3. Installer les dépendances : `npm install` (à la racine, npm workspaces gère les 3 packages)
4. Appliquer le schéma : `npm run db:migrate`
5. Lancer le backend : `npm run dev:backend` (port 4000)
6. Lancer le frontend : `npm run dev:frontend` (Vite proxy `/api` et `/socket.io` vers le backend)

### Générer les mots de passe des 2 joueurs

```
node packages/backend/scripts/hash-password.mjs "motdepasse"
```

Coller le hash obtenu dans `PLAYER1_PASSWORD_HASH` / `PLAYER2_PASSWORD_HASH` du `.env`. Les pseudos (`PLAYER1_USERNAME` / `PLAYER2_USERNAME`) sont aussi affichés comme choix rapides sur la page de connexion, via `GET /api/auth/players`.

### Générer les clés VAPID (notifications push)

```
npx web-push generate-vapid-keys
```

Renseigner `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` dans `.env`, et `VITE_VAPID_PUBLIC_KEY` (même valeur publique) si besoin côté build frontend.

## Dictionnaire

`packages/backend/data/dictionary/fr.txt` est un **placeholder** avec une poignée de mots réels pour tester le moteur de jeu de bout en bout. L'ODS (dictionnaire officiel du Scrabble) est sous licence commerciale et n'est pas inclus. Avant de jouer pour de vrai, remplacer ce fichier par une vraie liste de mots français (un mot par ligne, sans accents — les accents sont de toute façon ignorés à la lecture puisque les tuiles du Scrabble n'en portent pas), par exemple issue de Lexique.org/Morphalou ou d'une liste ODS que vous possédez déjà sous licence.

## Déploiement sur le VPS

Ce projet ne fournit pas son propre reverse proxy : sur un VPS mutualisé qui héberge déjà d'autres sites, ports 80/443 sont possédés par le nginx du système, pas par un conteneur dédié. Le backend n'écoute qu'en local (`127.0.0.1:4000`), et nginx fait le lien.

1. Copier le repo sur le VPS, remplir `.env` (avec de vrais secrets — attention, chaque `$` d'un hash bcrypt doit être doublé en `$$`, sinon Docker Compose le corrompt en l'interprétant comme une variable). Pointer le nom de domaine vers l'IP du VPS.
2. Construire le frontend : `npm run build:frontend` (génère `packages/frontend/dist`, servi statiquement par nginx).
3. Lancer la stack : `docker compose -f docker-compose.prod.yml up -d --build`
4. Appliquer le schéma sur la base de prod : `docker compose -f docker-compose.prod.yml exec backend node dist/db/migrate.js`
5. Installer la config nginx et obtenir le certificat TLS :
   ```bash
   sudo cp nginx/scrabble.conf /etc/nginx/sites-available/scrabble.jennblngr.com
   sudo ln -s /etc/nginx/sites-available/scrabble.jennblngr.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d scrabble.jennblngr.com
   ```

## Statut de l'implémentation

Déjà en place :
- Plateau 15x15 avec les cases bonus standard, sac et distribution des lettres françaises (102 tuiles)
- Validation des règles de pose (alignement, connexion, case centrale, mots formés) et calcul du score (bonus lettre/mot, scrabble +50)
- Synchronisation temps réel via Socket.io (pose, passe, échange, chat), persistance PostgreSQL, notifications push Web Push
- PWA installable (manifest + service worker via `vite-plugin-pwa`), plateau zoomable au pincement, pose des tuiles par glisser-déposer tactile (rack ↔ plateau)

À affiner ensuite : gestion des reconnexions/plusieurs parties en parallèle, historique des coups affiché en UI, icônes PWA définitives (celles fournies sont des carrés unis de remplacement).
