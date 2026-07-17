# Où Vivre Demain — Analyse de faisabilité

> Ancien nom de code : WhereToSurvive. Marque publique : **Où Vivre Demain**.

> **Objectif du produit** : aider à identifier, en France, les territoires les plus « sûrs » face aux risques climatiques qui s’accentuent avec le réchauffement (canicule, submersion, grêle, pluies extrêmes, inondation, sécheresse, feux de forêt, etc.), sur les prochaines décennies.

**Date** : 16 juillet 2026  
**Statut** : étude préliminaire (pas encore de développement)

---

## 1. Analyse de la demande

### 1.1 Problème utilisateur

Beaucoup de Français s’interrogent avant un achat immobilier, un déménagement ou une installation longue durée :

- Où le climat sera-t-il encore supportable en 2030–2050 ?
- Quels aléas menacent *cette* commune / *cette* adresse ?
- Existe-t-il un endroit « optimal », ou seulement des compromis ?

Le besoin n’est pas une prévision météo à 7 jours, mais une **lecture territoriale des risques physiques liés au climat**, combinant :

| Dimension | Exemples |
|-----------|----------|
| Extrêmes thermiques | Canicules, nuits tropicales, froid extrême (en baisse) |
| Cycle de l’eau | Sécheresse, stress hydrique, pluies intenses |
| Inondation | Débordement, ruissellement, remontée de nappe |
| Littoral | Submersion marine, érosion du trait de côte |
| Convectif / orages | Grêle, vents violents (plus difficile à projeter) |
| Feux | Feux de forêt / végétation |
| Sols | Retrait-gonflement des argiles (lié à la sécheresse) |
| Historique | Arrêtés CatNat, sinistralité passée |

### 1.2 Personas cibles (hypothèses)

1. **Futur acheteur / locataire** — compare 2–5 communes avant de déménager.
2. **Famille / expatrié de retour** — cherche un « refuge climatique » relatif en métropole.
3. **Investisseur / agent immobilier** — veut un score lisible pour un bien.
4. **Curieux / journaliste / étudiant** — explore une carte nationale.

### 1.3 Proposition de valeur différenciante

Le créneau intéressant n’est pas « encore une fiche Géorisques », mais :

> **Comparer et classer des territoires** selon un score multi-aléas *tourné vers le futur* (2030 / 2050), avec une UX grand public (carte + classement + comparaison).

Points de friction aujourd’hui :

- Les données officielles existent mais sont **dispersées** (plusieurs portails, formats techniques).
- Climadiag Commune est excellent pour les élus, mais **pas conçu pour comparer / classer** des dizaines de lieux.
- ClimaScore (concurrent privé) est proche du besoin — surtout orienté **immobilier / adresse**.

### 1.4 Avertissements produits (à intégrer dès le MVP)

- Aucun endroit n’est « à risque zéro ».
- Les projections climatiques portent une **incertitude** (scénarios, modèles).
- L’outil n’est **pas** un document opposable (contrairement à l’ERP / Géorisques).
- Le « plus sûr » dépend des **priorités** de l’utilisateur (ex. : accepter plus de froid pour éviter la canicule).

---

## 2. Benchmark — est-ce que ça existe déjà ?

### 2.1 France — outils publics

| Outil | Éditeur | Couverture | Points forts | Limites vs WhereToSurvive |
|-------|---------|------------|--------------|---------------------------|
| [Géorisques](https://www.georisques.gouv.fr/) | État | Adresse / commune | Référence réglementaire, ERP, API | Risques *actuels* / réglementaires, peu de projections futures |
| [Climadiag Commune](https://meteofrance.com/climadiag-commune) | Météo-France | Commune / EPCI | Indicateurs 2030 / 2050 / 2100 (TRACC), gratuit | UX décideurs, PDF, **pas d’API publique**, pas de classement national |
| [DRIAS](https://www.drias-climat.fr/) | Météo-France / communauté | France | Projections climatiques téléchargeables | Technique (NetCDF/CSV), pas grand public |
| [DRIAS-Eau](https://www.drias-climat.fr/) (Explore2) | Météo-France | Métropole | Projections hydrologiques | Idem, expert |
| Vigicrues | SCHAPI | Cours d’eau | Temps réel | Pas de projection long terme |
| Géoportail IGN | IGN | Cartes | Couches inondation, etc. | Pas de score composite |

### 2.2 France — acteurs privés / réutilisations

| Produit | Positionnement | Proximité |
|---------|----------------|-----------|
| **[ClimaScore](https://climascore.fr/)** | Score A–F par adresse, 5 dimensions, projection 2050, comparateur, API B2B (~299 €/mois + sandbox) | **Concurrent le plus proche** — First Street « à la française » |
| **[mon-risque.com](https://www.mon-risque.com/)** | Agrégation risques naturels/techno + qualité de vie | Proche sur l’existant, moins sur le *futur climatique* |
| catnat.net (Ubyrisk) | Bases CatNat enrichies | Source / B2B, pas grand public « où vivre » |

### 2.3 International (références UX)

| Produit | Pays | Intérêt |
|---------|------|---------|
| **First Street** (+ intégration Zillow) | USA | Scores flood / fire / heat / wind par adresse — modèle à imiter côté UX |
| **ClimateCheck** | Mondial / enterprise | Scores 1–100 multi-aléas, API data feed |
| **Climate X (Spectra)** | Enterprise | API / SaaS, scénarios RCP/SSP jusqu’en 2100 — trop cher pour un MVP indie |

### 2.4 Verdict benchmark

| Question | Réponse |
|----------|---------|
| Est-ce que l’idée existe ? | **Oui, partiellement.** Les briques existent (État + ClimaScore). |
| Y a-t-il un « Google Maps du refuge climatique » grand public en France ? | **Pas vraiment.** Climadiag = diagnostic local ; ClimaScore = immobilier ; Géorisques = réglementaire. |
| Y a-t-il de la place ? | **Oui**, si on se différencie : classement national, filtres de préférences, pédagogie, open methodology, ou angle « où s’installer » plutôt que « évaluer mon bien ». |

**Risque concurrentiel** : ClimaScore couvre déjà beaucoup du besoin (carte, score, 2050, comparateur). WhereToSurvive doit clarifier un angle (ex. : open-source / gratuit total, score personnalisable, focus « top N communes », mobilité / qualité de vie + climat).

---

## 3. Faisabilité

### 3.1 Synthèse

| Critère | Évaluation |
|---------|------------|
| Faisabilité technique MVP | **Élevée** — données publiques abondantes |
| Faisabilité scientifique « score unique » | **Moyenne** — agrégation multi-aléas = choix méthodologiques discutables |
| Faisabilité « tous les phénomènes » | **Moyenne / faible** pour grêle & orages futurs (projections locales peu matures) |
| Coût données (MVP open data) | **Faible** (quasi gratuit) |
| Effort ingénierie | **Moyen à élevé** selon granularité (commune vs adresse vs parcelle) |
| Légal / éthique | **Attention** : disclaimer obligatoire, pas de conseil d’investissement |

### 3.2 Ce qui est réaliste en MVP (3–6 semaines)

1. Carte + recherche de commune (code INSEE).
2. Fiches risques **existants** via API Géorisques (inondation, argiles, feux, CatNat…).
3. Indicateurs **futurs** pré-calculés à partir de DRIAS / TRACC (téléchargement batch, pas live) : jours de chaleur, précipitations extrêmes, sécheresse.
4. Score composite simple + classement filtrable.
5. Comparateur 2–4 communes.

### 3.3 Ce qui est difficile / à reporter

| Aléa | Difficulté | Pourquoi |
|------|------------|----------|
| Grêle | Élevée | Peu de projections spatiales fiables à fine échelle ; souvent statistiquement rare |
| Pluies convectives locales | Élevée | Résolution modèles insuffisante pour la rue |
| Submersion fine (parcelle) | Moyenne | Besoin de MNT + scénarios de niveau marin ; données existent mais traitement SIG lourd |
| Score « meilleur endroit de France » | Conceptuelle | Optimiser un score = masquer des trade-offs (Bretagne = plus d’humidité / tempêtes, moins de canicule) |

### 3.4 Niveau de confiance recommandé

Afficher **toujours** :
- horizon (2030 / 2050),
- scénario / référence (idéalement **TRACC** pour rester aligné avec l’État),
- fourchette (basse / médiane / haute) quand disponible,
- séparation claire : *aléa réglementaire actuel* vs *projection climatique*.

---

## 4. Sources de données nécessaires

### 4.1 Socle recommandé (open data)

| Besoin | Source | Licence / coût | Format |
|--------|--------|----------------|--------|
| Adresses / géocodage | [BAN](https://adresse.data.gouv.fr/) (API Adresse) | Gratuit | API JSON |
| Communes | COG / geo.api.gouv.fr | Gratuit | API / GeoJSON |
| Risques naturels réglementaires | [API Géorisques](https://www.georisques.gouv.fr/doc-api) | Gratuit (inscription jeton) | API REST |
| Arrêtés CatNat | Géorisques `CATNAT` / GASPAR | Gratuit | API |
| Projections climatiques | [DRIAS](https://www.drias-climat.fr/) / data.gouv | Licence Ouverte | NetCDF / CSV |
| Référence adaptation France | **TRACC** (via Climadiag / DRIAS) | Gratuit (PDF Climadiag ; données via DRIAS) | Indicateurs |
| Hydrologie future | DRIAS-Eau (Explore2) | Gratuit | Fichiers |
| Feux de forêt | BDIFF (CSV manuel, portail parfois hors ligne) + DRIAS ; sans BDIFF : Géorisques OLD/GASPAR | Gratuit | CSV / API |
| Littoral / submersion | Géorisques + données trait de côte (CEREMA / GIP Littoral selon région) | Souvent gratuit | SIG |
| Argiles (RGA) | Géorisques / BRGM | Gratuit | API / couches |
| Radon | Géorisques `/radon` (classes ASNR 1–3) + GASPAR 18 | Gratuit | API |
| Séisme | Géorisques `/zonage_sismique` (zones 1–5) + GASPAR 13 | Gratuit | API |
| Cavités souterraines | Géorisques `/cavites` (dénombrement) + GASPAR 12 | Gratuit | API |
| Prix immobilier (option) | DVF / DVF+ | Gratuit | CSV / API |
| Bâti (option) | BDNB | Gratuit (conditions) | Fichiers |

### 4.2 Compléments utiles

| Besoin | Source | Notes |
|--------|--------|-------|
| Climatologie historique | [meteo.data.gouv.fr](https://meteo.data.gouv.fr/) + API DPClimatologie | Licence Ouverte |
| Prévisions / flood near-real-time | Open-Meteo Flood (GloFAS) | Utile en plus, **pas** pour 2050 |
| Projections globales CMIP6 | Open-Meteo Climate API / Copernicus CDS | Moins précises que DRIAS pour la France |
| CatNat enrichi | BD Catnat (payant) | Si besoin de typologie d’aléas plus fine |

### 4.3 Mapping aléas → sources

| Phénomène | Existant (aujourd’hui) | Futur (projections) |
|-----------|------------------------|---------------------|
| Canicule / vagues de chaleur | Stations / climatologie MF | DRIAS / Climadiag (jours > 35 °C, nuits tropicales…) |
| Pluies intenses | Climatologie + PPRI | DRIAS (indices précipitations extrêmes) |
| Inondation | Géorisques (AZI, TRI, PPRI) | DRIAS-Eau + exposition actuelle |
| Submersion | Géorisques / PPR littoraux | Scénarios niveau marin + altimétrie |
| Sécheresse / eau | Arrêtés sécheresse, RGA | DRIAS (sols secs, hydrologie Explore2) |
| Feux de forêt | Géorisques OLD/GASPAR (+ BDIFF si CSV importé) | Indicateurs DRIAS risque feu |
| Grêle | CatNat / sinistralité assureurs (partiel) | **Faible couverture projection** |
| Tempêtes / vent | CatNat, climatologie | Projections moins consensuelles à fine échelle |
| Argiles | Géorisques RGA | Lié à sécheresse future (proxy) |
| Radon | Géorisques / ASNR (classes 1–3) | Aléa réglementaire (pas de projection climatique) |
| Séisme | Géorisques zonage sismique (zones 1–5) | Aléa réglementaire (pas de projection climatique) |
| Cavités | Géorisques /cavites (count) | Aléa réglementaire (pas de projection climatique) |

---

## 5. APIs disponibles (gratuites / payantes)

### 5.1 Gratuites / open data (prioritaires)

| API / service | Usage | Coût | Limites |
|---------------|-------|------|---------|
| **API Géorisques** | Risques, CatNat, PPR, argiles… | Gratuit (jeton) | Rate limits ; plutôt risque *présent* |
| **API Adresse (BAN)** | Géocodage | Gratuit | Quotas raisonnables |
| **geo.api.gouv.fr** | Communes, départements | Gratuit | — |
| **meteo.data.gouv.fr / DPClimatologie** | Climatologie | Gratuit | Pas de projections 2050 « prêtes » |
| **DRIAS (téléchargement)** | Projections | Gratuit | Pas d’API REST grand public officielle ; traitement batch |
| **RADIS / api.g-eau.fr** | Accès programmatique scénarios DRIAS (communauté) | Gratuit (à valider) | Moins « officiel » que le portail DRIAS |
| **Open-Meteo** (Forecast, Climate, Flood) | Météo, CMIP6, débit rivières | Gratuit non-commercial ~10k req/j ; payant si commercial | Pas un substitut à DRIAS France |
| **Climadiag Commune** | Indicateurs TRACC | Gratuit | **Interface web + PDF uniquement** — pas d’API |

### 5.2 Payantes / freemium

| Service | Usage | Prix indicatif | Intérêt |
|---------|-------|----------------|---------|
| **ClimaScore API** | Score A–F, risques, 2050 | Sandbox 100 req/j ; ~299 € HT/mois et + | Accélère un MVP si on accepte la dépendance |
| **Climate X / ClimateCheck** | Risque physique enterprise | Sur devis (élevé) | Surdimensionné pour un site grand public FR |
| **Météo-France APIs commerciales** | Prévisions haute fréquence | Selon contrat | Peu utile pour horizons 2050 |
| **BD Catnat (Ubyrisk)** | Événements détaillés | Payant | Enrichissement historique |
| **Open-Meteo Customer** | Quotas élevés / commercial | Abonnement | Si trafic important |

### 5.3 Recommandation API pour WhereToSurvive

**Phase 1 (indépendant, open data)**  
Géorisques + BAN + jeux DRIAS pré-calculés en base → **pas de coût API récurrent**.

**Phase 2 (accélération)**  
Évaluer ClimaScore API uniquement si le time-to-market prime sur la maîtrise méthodologique / open source.

**À éviter en cœur de produit** : s’appuyer uniquement sur Open-Meteo Climate pour la France (trop grossier vs DRIAS/TRACC).

---

## 6. Faut-il un backend ?

### 6.1 Réponse courte

**Oui, un backend (ou au minimum un pipeline de données + hébergement de fichiers pré-calculés) est nécessaire** dès qu’on veut un classement national et des scores stables.

### 6.2 Pourquoi le front-only ne suffit pas

| Approche | Possible ? | Problème |
|----------|------------|----------|
| Appeler Géorisques depuis le navigateur | Partiellement | CORS, quotas, clé API exposée, lenteur multi-aléas |
| Télécharger DRIAS côté client | Non réaliste | Fichiers volumineux (NetCDF), calculs lourds |
| Score sur ~35 000 communes en live | Non | Trop de requêtes / trop de calcul |

### 6.3 Architecture recommandée

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Sources open   │────▶│  Pipeline ETL (batch) │────▶│  Base scores    │
│  DRIAS, etc.    │     │  (Python / scripts)   │     │  (Postgres+GIS) │
└─────────────────┘     └──────────────────────┘     └────────┬────────┘
                                                              │
┌─────────────────┐     ┌──────────────────────┐              │
│  Géorisques API │────▶│  API Hono (cache)    │◀─────────────┘
│  BAN            │     │  Node.js REST        │
└─────────────────┘     └──────────┬───────────┘
                                   │
                          ┌────────▼────────┐
                          │  Front Astro    │
                          │  + MapLibre     │
                          └─────────────────┘
                                   │
                          ┌────────▼────────┐
                          │  Docker Compose │
                          │  front / api / db│
                          └─────────────────┘
```

**Rôles du backend :**

1. Stocker scores pré-calculés (commune → indicateurs + score).
2. Proxifier / cacher Géorisques (clé API secrète).
3. Servir recherche, filtres, top N, comparaison.
4. (Plus tard) comptes utilisateurs, alertes, favoris.

**Alternative ultra-légère MVP** : générer un gros GeoJSON / parquet de scores au build (CI), servir en statique + CDN, et n’avoir qu’une petite API serverless pour le géocodage. Possible pour un prototype, fragile pour la mise à jour CatNat.

### 6.4 Stack technique retenue

| Couche | Choix | Notes |
|--------|-------|-------|
| Front | **Astro** + MapLibre | Pages SSG/SSR légères ; îlots React/Vue/Svelte si besoin pour la carte interactive |
| API | **Hono** (Node.js) | Peu de code, typage fort, idéal MVP REST |
| DB | PostgreSQL + PostGIS | Communes, géométries, scores, cache Géorisques |
| ETL | Python (xarray, pandas) sur DRIAS | Conservé hors API : mieux adapté aux NetCDF |
| Déploiement | **Docker** (+ Docker Compose en local / VPS) | Images front, api, db, éventuellement worker ETL |

#### 6.4.1 Front — Astro

Astro convient bien à WhereToSurvive :

- Contenu pédagogique (méthodologie, disclaimers, pages communes) en **SSG** = perf + SEO.
- Carte / comparateur / filtres en **îlots client** (hydratation partielle) pour limiter le JS.
- Peut appeler l’API Node en SSR (`Astro` server mode / adapter Node) si on veut du rendu dynamique derrière Docker.
- Image Docker typique : build multi-stage (`astro build`) → Nginx ou serveur Node selon l’adapter.

Organisation suggérée :

```
apps/web/          # Astro
  src/pages/       # /, /commune/[insee], /comparer, /methodologie
  src/components/  # Map, ScoreFilters, Comparator (îlots)
apps/api/          # Node.js
infra/             # Dockerfiles, compose
```

#### 6.4.2 Back — frameworks Node.js (propositions)

Tous conviennent pour une API REST JSON (scores, recherche, proxy Géorisques). Comparatif orienté ce projet :

| Framework | Style | Points forts | Points faibles | Verdict projet |
|-----------|-------|--------------|----------------|----------------|
| **Fastify** | Plugin, schema JSON | Très rapide, validation native (JSON Schema), TypeScript solide, faible overhead | Moins « batteries included » qu’un Nest | **Recommandé pour le MVP** — simple, performant, idéal API + cache |
| **Hono** | Ultra-léger, fetch-like | Moderne, typage excellent, portable (Node / Bun / edge) | Écosystème middleware plus jeune pour PostGIS / jobs | Excellent si API minimaliste ; à considérer si stack très légère |
| **NestJS** | Angular-like, modules DI | Structure claire, scalable, OpenAPI, guards, queues (Bull) | Plus verbeux, courbe d’apprentissage | **Recommandé si V2** (auth, jobs, équipe qui grandit) |
| **Express** | Minimal historique | Universel, énormément de tutos | Peu d’opinion, validation/typage à bricoler | OK mais Fastify/Hono apportent plus « out of the box » |
| **tRPC** (+ Fastify/Express) | RPC typé front↔back | DX excellente si monorepo TS partagé avec Astro | Moins idiomatique pour une API publique tierce | Intéressant en monorepo interne, moins prioritaire |
| **Elysia** (Bun) | Proche Fastify | Perf / DX | Impose Bun ; Docker OK mais moins standard que Node LTS | À éviter si on veut rester sur Node LTS |

**Choix retenu : Hono**

Critère prioritaire : construire l’API **facilement, avec peu de code**.

| Critère | Hono | Fastify | NestJS |
|---------|------|---------|--------|
| Verboseité | Très faible | Moyenne | Élevée |
| Courbe d’apprentissage | Faible | Faible–moyenne | Forte |
| Syntaxe | Courte, type `app.get(...)` | Plugins / schemas | Décorateurs / modules |
| Docker / Node LTS | Oui (`@hono/node-server`) | Oui | Oui |

Exemple minimal (fichier unique) :

```ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

app.get('/health', (c) => c.json({ ok: true }))
app.get('/communes/:insee', async (c) => {
  const insee = c.req.param('insee')
  // lecture DB / cache…
  return c.json({ insee, score: 72 })
})

serve({ fetch: app.fetch, port: 3000 })
```

Stack API associée : **Hono** + TypeScript + Zod (validation) + Drizzle (SQL léger) + Redis optionnel.

Endpoints API typiques (indépendants du framework) :

| Méthode | Route | Rôle |
|---------|-------|------|
| `GET` | `/health` | Healthcheck Docker |
| `GET` | `/communes/search?q=` | Autocomplete |
| `GET` | `/communes/:insee` | Fiche + scores + aléas |
| `GET` | `/scores` | Liste / top N + filtres + pondérations |
| `GET` | `/compare?insee=…` | Comparaison 2–4 communes |
| `GET` | `/geo/communes.geojson` | Couche carte (ou tuiles plus tard) |

#### 6.4.3 Déploiement Docker

Cible : un seul `docker compose` pour local et VPS (OVH, Hetzner, Scaleway…).

Services prévus :

| Service | Image / rôle |
|---------|----------------|
| `web` | Astro (Nginx servant le build, ou adapter Node) |
| `api` | Hono sur Node — port interne 3000 |
| `db` | `postgis/postgis` |
| `redis` | Cache optionnel (réponses Géorisques) |
| `etl` | Conteneur one-shot / cron Python (maj DRIAS / CatNat) |

Schéma Compose (indicatif) :

```yaml
services:
  web:
    build: ./apps/web
    ports: ["80:80"]
    depends_on: [api]
  api:
    build: ./apps/api
    env_file: .env
    depends_on: [db, redis]
  db:
    image: postgis/postgis:16-3.4
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
```

Points d’attention :

- Secrets (jeton Géorisques, `DATABASE_URL`) via `.env` / secrets Docker — **jamais** dans l’image front.
- Healthchecks Compose sur `/health` (api) et Postgres.
- Reverse proxy (Caddy ou Traefik) devant `web` + `api` pour HTTPS en prod.
- Build multi-stage pour limiter la taille des images Node et Astro.
- Le worker ETL peut rester un `docker compose run etl` planifié (cron hôte ou container `ofelia` / `supercronic`).

---

## 7. Périmètre produit suggéré

### 7.1 MVP (« trouver les communes les plus sûres »)

- Carte de France colorée par score global.
- Filtres : canicule, inondation, littoral, sécheresse, feux.
- Poids personnalisables (ex. : « je priorise l’absence de canicule »).
- Fiche commune : risques Géorisques + 3–5 indicateurs 2050.
- Comparateur 2–4 communes.
- Méthodologie publique + disclaimer.

### 7.2 V2

- Recherche par adresse (parcelle / bâtiment).
- Submersion + trait de côte plus fins.
- Lien prix immobilier (DVF) / accessibilité services.
- Export PDF « rapport climat ».
- Mode « mobilité » (contraintes emploi, TGV, budget).

### 7.3 Hors scope initial

- Assurance / tarification.
- Remplacement de l’ERP.
- Prédiction grêle à l’échelle rue.
- Outre-mer (données Climadiag/DRIAS en rattrapage — à traiter à part).

---

## 8. Risques projet

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Concurrent ClimaScore déjà positionné | Élevé | Différenciation claire (open méthodo, classement, personnalisation) |
| Agrégation de score contestable | Moyen | Transparence, scores séparés, pas une seule vérité |
| Quotas / disponibilité Géorisques | Moyen | Cache agressif, snapshot périodique |
| Mauvaise interprétation utilisateur | Élevé | UX pédagogique, incertitudes visibles |
| Licence / attribution | Faible | Crédits Météo-France, Géorisques, Licence Ouverte |
| Responsabilité juridique | Moyen | CGU : outil informatif, pas un conseil |

---

## 9. Conclusion & recommandation

| Question | Verdict |
|----------|---------|
| La demande est-elle réelle ? | **Oui** — achat immobilier + anxiété climatique + manque d’outil de *comparaison* grand public. |
| Existe-t-il déjà ? | **Partiellement** — Climadiag (État), ClimaScore (privé), Géorisques (réglementaire). |
| Est-ce faisable ? | **Oui** pour un MVP commune + multi-aléas principaux, en s’appuyant sur l’open data. |
| Backend ? | **Oui** (ou pipeline batch + API légère) — indispensable pour scores et cache. |
| Budget données ? | **~0 €** en open data ; option accélération ClimaScore API (~300 €/mois). |
| Phénomènes tous couverts ? | **Non dès le départ** — grêle et orages futurs restent le point faible. |

**Go recommandé** si le positionnement est clair face à ClimaScore / Climadiag :  
*« Où vivre demain en France ? »* — classement et comparaison personnalisables (2030 / 2050), méthodologie ouverte, ancré TRACC/DRIAS + Géorisques.

**Next steps proposés**

**Next steps proposés**

**Next steps proposés**

1. ~~Scaffold monorepo Astro + Hono + Docker~~ ✅
2. ~~Méthodo score v1 + Postgres (Drizzle) + seed~~ ✅
3. ~~Carte MapLibre + filtres pondérations~~ ✅
4. ~~Proxy Géorisques (risques + CatNat sur fiche commune)~~ ✅
5. ~~ETL climat (Open-Meteo CMIP6 → scores Postgres, proxy DRIAS)~~ ✅
6. ~~Cache Redis partagé (Géorisques, fallback mémoire)~~ ✅
7. ~~Référentiel élargi (top communes geo.api.gouv.fr + ETL)~~ ✅
8. ~~ETL DRIAS / Explore2 officiel via RADIS~~ ✅
9. ~~Page comparaison 2–4 communes~~ ✅
10. ~~Référentiel top 100 + scores DRIAS~~ ✅
11. ~~Ensemble multi-modèles DRIAS (3 chaînes ADAMONT)~~ ✅
12. ~~Pipeline batch DRIAS (checkpoint/reprise) + `deploy.sh` (échantillon dev / full prod)~~ ✅
13. Couverture nationale complète en prod (`./deploy.sh --prod-data`) — à lancer hors poste de dev
14. ~~Horizons 2030 + 2050 (ETL + sélecteur UI)~~ ✅
15. Indicateurs TRACC Climadiag pré-agrégés (si export disponible)

## Annexes — liens utiles

- Géorisques : https://www.georisques.gouv.fr/
- Doc API Géorisques : https://www.georisques.gouv.fr/doc-api
- Climadiag Commune : https://meteofrance.com/climadiag-commune
- DRIAS : https://www.drias-climat.fr/
- DRIAS sur data.gouv : https://www.data.gouv.fr/datasets/drias-projections-climatiques-pour-ladaptation-de-nos-societes
- Données publiques Météo-France : https://meteo.data.gouv.fr/
- ClimaScore : https://climascore.fr/
- Open-Meteo : https://open-meteo.com/
- BAN / API Adresse : https://adresse.data.gouv.fr/
