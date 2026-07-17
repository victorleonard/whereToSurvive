# Mise en production — Où Vivre Demain

Guide opérationnel pour déployer le site sur un VPS (Docker Compose).  
Complète le [README](../README.md) et le script [`deploy.sh`](../deploy.sh).

## Architecture

| Service | Rôle | Port (hôte, défaut) |
|---------|------|---------------------|
| `web` | Site Astro (SSR) | `4321` |
| `api` | API Hono | `3000` |
| `db` | Postgres + PostGIS | `5432` |
| `redis` | Cache (ex. Géorisques) | `6379` |
| `etl` | Chargement DRIAS (profil Docker, à la demande) | — |

Le front appelle l’API :

- **côté serveur** (SSR) : `API_URL=http://api:3000` (réseau Docker)
- **côté navigateur** (carte, recherche) : `PUBLIC_API_URL` doit pointer vers l’URL **publique** de l’API

## Prérequis

- Docker + Docker Compose
- Accès SSH au VPS
- Disque suffisant pour Postgres + checkpoints ETL (plusieurs Go en couverture nationale)
- Pare-feu / reverse proxy (Caddy, Nginx, Traefik…) pour HTTPS

## 1. Préparer le dépôt et l’environnement

```bash
cd /chemin/vers/whereToSurvive
cp .env.example .env
```

### Variables à régler en prod

Dans `.env` :

```bash
# Persistance VPS (obligatoire sur le serveur partagé)
DATA_ROOT=/projets/@data

# Mots de passe forts (ne pas laisser les défauts)
POSTGRES_USER=wheretosurvive
POSTGRES_PASSWORD=<secret-fort>
POSTGRES_DB=wheretosurvive
DATABASE_URL=postgresql://wheretosurvive:<secret-fort>@localhost:5432/wheretosurvive

# Ports exposés sur l’hôte (adapter si conflit)
API_PORT=3000
WEB_PORT=4321

# SSR → API interne Docker (souvent déjà OK via docker-compose)
API_URL=http://api:3000

# Navigateur → API joignable depuis ton PC (pas localhost du VPS)
# Sans domaine : IP publique du VPS + port API
PUBLIC_API_URL=http://IP.DU.VPS:3000
# Plus tard avec domaine / HTTPS :
# PUBLIC_API_URL=https://api.votredomaine.fr
```

> **Important** : `PUBLIC_API_URL` est injectée **au build** de l’image `web` (carte, recherche).  
> Sans reverse proxy : `http://IP.DU.VPS:3000` — **pas** `127.0.0.1` ni `localhost`.  
> Après chaque changement : `./deploy.sh --build --up`.

### Persistance des données

`DATA_ROOT` pointe vers un volume partagé. Ce projet n’écrit **que** dans :

```
$DATA_ROOT/wheretosurvive/
  postgres/
  redis/
  etl/
```

Ne jamais écrire à la racine de `/projets/@data` (autres projets : `ludolist/`, `mysql/`, …).

`docker compose down` **conserve** ces dossiers (bind mounts).

## 2. Premier déploiement (stack vide)

```bash
./deploy.sh --build --up --migrate
```

Vérifications :

```bash
curl -sf http://127.0.0.1:3000/health
curl -sf -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4321/
docker compose ps
```

À ce stade le site tourne, mais sans (ou presque sans) scores métier tant que l’import / l’ETL n’ont pas tourné.

## 3. Charger les données

### Option A — Échantillon (recette / smoke test)

```bash
./deploy.sh --up --migrate --dev-data
```

≈ 100 communes, horizons 2030 + 2050 (durée raisonnable).

Puis ancrage réglementaire (Géorisques, etc.) :

```bash
docker compose exec -T api npm run etl:regulatory
# depuis l’hôte, si les scripts npm root sont configurés :
# npm run etl:regulatory
```

### Option B — Production nationale (long)

```bash
./deploy.sh --up --migrate --prod-data
```

Cela enchaîne :

1. Import de toutes les communes métropole (~35k)
2. ETL DRIAS ensemble 3 modèles, horizons `2030` + `2050`
3. Checkpoints / reprise dans `$DATA_ROOT/wheretosurvive/etl/`

**Durée** : peut prendre des heures / jours selon le débit DRIAS.  
En cas d’interruption :

```bash
./deploy.sh --etl-drias --etl-horizon all --skip-existing
```

Ensuite :

```bash
# Depuis le conteneur API (recommandé)
docker compose exec -T api npm run etl:regulatory
```

BDIFF (feux historiques) reste **optionnel** — voir README.

## 4. Reverse proxy (schéma type)

Exemple d’intention (à adapter) :

| URL publique | Backend |
|--------------|---------|
| `https://ouvivredemain.fr` | `web:4321` |
| `https://api.ouvivredemain.fr` | `api:3000` |

CORS : si le front et l’API sont sur des domaines différents, vérifier que le navigateur peut appeler l’API (`PUBLIC_API_URL`). Adapter l’API si un contrôle CORS est ajouté plus tard.

Après changement de `PUBLIC_API_URL`, **rebuild** le front (valeur souvent figée au build selon config Astro) :

```bash
./deploy.sh --build --up
```

## 5. Mises à jour applicatives

```bash
git pull
./deploy.sh --build --up --migrate
```

- Les données Postgres / Redis / ETL sur disque sont conservées.
- Relancer un ETL seulement si les sources ou la méthodo le demandent.

Re-blend réglementaire après un ETL climat qui a écrasé des scores :

```bash
docker compose exec -T api sh -c 'FORCE_GEO=1 npm run etl:regulatory'
```

## 6. Opérations courantes

| Action | Commande |
|--------|----------|
| Logs | `docker compose logs -f web api` |
| Santé API | `curl -s http://127.0.0.1:3000/health \| jq` |
| Arrêt (données conservées) | `./deploy.sh --down` |
| Redémarrage | `./deploy.sh --up` |
| Reprise ETL DRIAS | `./deploy.sh --etl-drias --etl-horizon all --skip-existing` |
| Shell API | `docker compose exec api sh` |

## 7. Checklist avant ouverture publique

- [ ] Mots de passe Postgres distincts des défauts
- [ ] `DATA_ROOT` correct, dossiers `wheretosurvive/{postgres,redis,etl}` créés
- [ ] `PUBLIC_API_URL` accessible depuis le navigateur (HTTPS)
- [ ] `./deploy.sh --build --up --migrate` OK
- [ ] Données chargées (`/health`, quelques fiches commune, carte)
- [ ] `etl:regulatory` exécuté au moins une fois
- [ ] Reverse proxy + certificats TLS
- [ ] Ports DB / Redis **non exposés** publiquement (idéalement bind `127.0.0.1` ou réseau Docker seul)

Pour restreindre Postgres/Redis à localhost, adapter les `ports:` dans `docker-compose.yml` ou un override `docker-compose.prod.yml` (ex. `"127.0.0.1:5432:5432"`).

## 8. Sauvegardes

À prévoir côté ops :

1. **Postgres** : dump régulier (`pg_dump`) du volume `$DATA_ROOT/wheretosurvive/postgres` ou via `docker compose exec db …`
2. **Redis** : moins critique (cache) ; AOF déjà activé
3. **ETL** : checkpoints utiles pour reprise, pas pour le service live

Tester une restauration sur un environnement de staging avant incident.

## 9. Dépannage rapide

| Symptôme | Piste |
|----------|--------|
| Carte / recherche en erreur API | `PUBLIC_API_URL` faux ou API injoignable depuis le navigateur |
| Fiches OK mais carte vide | Même cause (JS client) ; vérifier Network dans le navigateur |
| API `DATABASE_URL` / Postgres down | `docker compose ps` + logs `db` ; droits sur le bind mount |
| ETL bloqué / lent | Reprise `--skip-existing` ; limiter avec `--etl-limit` ; vérifier réseau sortant DRIAS |
| Scores « purs » sans Géorisques | Relancer `etl:regulatory` (`FORCE_GEO=1` si besoin) |
| Conflit de port 3000 | Autre app sur l’hôte → changer `API_PORT` / `WEB_PORT` |

## Références

- Script : `./deploy.sh --help`
- Compose : `docker-compose.yml`
- Env modèle : `.env.example`
- Dev local : [README](../README.md)
