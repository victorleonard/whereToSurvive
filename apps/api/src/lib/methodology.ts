/**
 * Méthodologie — indice multi-aléas grand public.
 * Plus le score est élevé (0–100), plus le risque relatif est élevé.
 *
 * Deux familles :
 * - Climat : évolue avec l’horizon 2030 / 2050
 * - Sol & bâti : ancrage réglementaire, stable entre horizons
 */

export const HAZARD_KEYS = [
  'heat',
  'flood',
  'coastal',
  'drought',
  'wildfire',
  'clay',
  'radon',
  'seismic',
  'cavity',
] as const

export type HazardKey = (typeof HAZARD_KEYS)[number]

/** Aléas liés au climat / horizon (projections + planchers hydro/feux). */
export const CLIMATE_KEYS = [
  'heat',
  'flood',
  'coastal',
  'drought',
  'wildfire',
] as const satisfies readonly HazardKey[]

export type ClimateKey = (typeof CLIMATE_KEYS)[number]

/** Aléas sol & bâti — ne changent pas avec l’horizon. */
export const PLACE_KEYS = [
  'clay',
  'radon',
  'seismic',
  'cavity',
] as const satisfies readonly HazardKey[]

export type PlaceKey = (typeof PLACE_KEYS)[number]

/** Alias explicite : tous les aléas « stables » = famille sol & bâti. */
export const STABLE_HAZARD_KEYS = PLACE_KEYS

/** Horizons climatiques supportés (décennies DRIAS / alignement TRACC). */
export const HORIZONS = ['2030', '2050'] as const
export type Horizon = (typeof HORIZONS)[number]
export const DEFAULT_HORIZON: Horizon = '2050'

export const HORIZON_PERIODS: Record<
  Horizon,
  { start: string; end: string; label: string }
> = {
  '2030': {
    start: '2020-01-01',
    end: '2029-12-31',
    label: '2020–2029',
  },
  '2050': {
    start: '2040-01-01',
    end: '2049-12-31',
    label: '2040–2049',
  },
}

export function parseHorizon(raw: string | undefined | null): Horizon {
  if (raw === '2030' || raw === '2050') return raw
  return DEFAULT_HORIZON
}

export const HAZARD_LABELS: Record<HazardKey, string> = {
  heat: 'Canicule',
  flood: 'Inondation',
  coastal: 'Littoral / submersion',
  drought: 'Sécheresse',
  wildfire: 'Feux de forêt',
  clay: 'Argiles (RGA)',
  radon: 'Radon',
  seismic: 'Séisme',
  cavity: 'Cavités / sous-sol',
}

/** Pondérations par défaut (somme = 1) — score « ensemble ». */
export const DEFAULT_WEIGHTS: Record<HazardKey, number> = {
  heat: 0.18,
  flood: 0.18,
  coastal: 0.1,
  drought: 0.12,
  wildfire: 0.1,
  clay: 0.11,
  radon: 0.08,
  seismic: 0.08,
  cavity: 0.05,
}

export function isStableHazard(key: HazardKey): boolean {
  return (STABLE_HAZARD_KEYS as readonly string[]).includes(key)
}

export function isClimateHazard(key: HazardKey): boolean {
  return (CLIMATE_KEYS as readonly string[]).includes(key)
}

function computeGroupScore(
  hazards: Record<HazardKey, number>,
  keys: readonly HazardKey[],
  weights: Record<HazardKey, number> = DEFAULT_WEIGHTS,
): number {
  let total = 0
  let weightSum = 0
  for (const key of keys) {
    const w = weights[key] ?? 0
    total += (hazards[key] ?? 0) * w
    weightSum += w
  }
  if (weightSum <= 0) return 0
  return Math.round(total / weightSum)
}

/** Score climat (horizon-dépendant), poids renormalisés sur la famille. */
export function computeClimateScore(
  hazards: Record<HazardKey, number>,
  weights: Record<HazardKey, number> = DEFAULT_WEIGHTS,
): number {
  return computeGroupScore(hazards, CLIMATE_KEYS, weights)
}

/** Score sol & bâti (stable entre horizons). */
export function computePlaceScore(
  hazards: Record<HazardKey, number>,
  weights: Record<HazardKey, number> = DEFAULT_WEIGHTS,
): number {
  return computeGroupScore(hazards, PLACE_KEYS, weights)
}

/** Score ensemble = moyenne pondérée des 9 aléas. */
export function computeScore(
  hazards: Record<HazardKey, number>,
  weights: Record<HazardKey, number> = DEFAULT_WEIGHTS,
): number {
  return computeGroupScore(hazards, HAZARD_KEYS, weights)
}

export function computeScoreBundle(
  hazards: Record<HazardKey, number>,
  weights: Record<HazardKey, number> = DEFAULT_WEIGHTS,
): { climate: number; place: number; total: number } {
  return {
    climate: computeClimateScore(hazards, weights),
    place: computePlaceScore(hazards, weights),
    total: computeScore(hazards, weights),
  }
}

export const METHODOLOGY = {
  version: '2.2',
  horizons: HORIZONS,
  defaultHorizon: DEFAULT_HORIZON,
  periods: HORIZON_PERIODS,
  positioning: 'grand-public-choix',
  description:
    'Où Vivre Demain compare les communes pour aider à choisir où s’installer : le climat à venir (2030 / 2050) d’un côté, les risques du sol et du logement aujourd’hui de l’autre. Plus le score est élevé, plus l’exposition relative est forte. Ce n’est pas un diagnostic immobilier opposable.',
  scoreFamilies: {
    climate: {
      label: 'Climat',
      keys: CLIMATE_KEYS,
      blurb:
        'Projections du climat à l’horizon choisi (canicule, eau, feux). Peut évoluer entre 2030 et 2050.',
    },
    place: {
      label: 'Sol & bâti',
      keys: PLACE_KEYS,
      blurb:
        'Risques du terrain et du logement aujourd’hui (argiles, radon, séisme, cavités).',
    },
  },
  sources: {
    current: 'drias-explore2-hydro-ensemble-3+geo',
    detail:
      'Climat : projections DRIAS. Sol & bâti et ancrages réglementaires : Géorisques, complétés si besoin par d’autres sources publiques (littoral, feux…).',
    links: [
      {
        name: 'DRIAS',
        role: 'Projections du climat en France',
        url: 'https://www.drias-climat.fr/',
      },
      {
        name: 'Explore2 / DRIAS-Eau',
        role: 'Eau, pluies et sécheresse dans le futur',
        url: 'https://www.drias-climat.fr/',
      },
      {
        name: 'RADIS (INRAE G-EAU)',
        role: 'Accès aux données climatiques de recherche',
        url: 'https://api.g-eau.fr/',
      },
      {
        name: 'Géorisques',
        role: 'Risques officiels connus aujourd’hui (État)',
        url: 'https://www.georisques.gouv.fr/',
      },
      {
        name: 'API Géorisques',
        role: 'Données Géorisques pour le site',
        url: 'https://www.georisques.gouv.fr/doc-api',
      },
      {
        name: 'CEREMA — INEC',
        role: 'Érosion du littoral',
        url: 'https://gisdata.cerema.fr/arcgis/rest/services/CH1_Erosion_c%C3%B4ti%C3%A8re/MapServer',
      },
      {
        name: 'BDIFF',
        role: 'Incendies de forêt recensés (quand disponible)',
        url: 'https://www.data.gouv.fr/datasets/base-de-donnees-sur-les-incendies-de-forets-en-france-bdiff',
      },
      {
        name: 'TRACC',
        role: 'Référence nationale sur l’adaptation au changement climatique',
        url: 'https://www.ecologie.gouv.fr/politiques-publiques/trajectoire-rechauffement-reference-ladaptation-changement-climatique-tracc',
      },
      {
        name: 'geo.api.gouv.fr',
        role: 'Noms et localisations des communes',
        url: 'https://geo.api.gouv.fr/',
      },
    ],
    planned: [
      'Indicateurs TRACC Climadiag (si API/export)',
      'Débits DRIAS-Eau quand exposés en API',
      'RGA BRGM SHP 2026 (% surface par niveau)',
      'Couverture nationale',
    ],
  },
  weights: DEFAULT_WEIGHTS,
  labels: HAZARD_LABELS,
  notes: [
    'Deux regards séparés : Climat et Sol & bâti.',
    'Climat : canicule, inondation, littoral, sécheresse, feux.',
    'Sol & bâti : argiles, radon, séisme, cavités.',
    'Horizons 2030 et 2050 : concernent seulement le climat.',
    'Chaque indicateur va de 0 à 100 ; plus c’est haut, plus l’exposition relative est forte.',
    'Les classements mettent en avant les scores les plus bas (moins de risque relatif).',
  ],
}
