export type HazardKey =
  | 'heat'
  | 'flood'
  | 'coastal'
  | 'drought'
  | 'wildfire'
  | 'clay'
  | 'radon'
  | 'seismic'
  | 'cavity'
export type Horizon = '2030' | '2050'

export const HORIZONS: Horizon[] = ['2030', '2050']
export const DEFAULT_HORIZON: Horizon = '2050'

export const HORIZON_LABELS: Record<Horizon, string> = {
  '2030': '2030',
  '2050': '2050',
}

export const HORIZON_PERIODS: Record<Horizon, string> = {
  '2030': '2020–2029',
  '2050': '2040–2049',
}

export function parseHorizon(raw: string | null | undefined): Horizon {
  return raw === '2030' || raw === '2050' ? raw : DEFAULT_HORIZON
}

export interface RegulatoryLayers {
  flood: number
  coastal: number
  clay: number
  wildfire: number
  radon: number
  seismic: number
  cavity: number
}

export interface CommuneScore {
  insee: string
  name: string
  department: string
  region: string
  /** Indice Ensemble 0–100 (API / pondération complète — pas affiché en UI primaire) */
  score: number
  /** Score Climat — évolue avec l’horizon */
  scoreClimate?: number
  /** Score Sol & bâti — stable entre horizons */
  scorePlace?: number
  hazards: Record<HazardKey, number>
  horizon: Horizon
  source?: string
  regulatory?: RegulatoryLayers | null
}

export const HAZARD_LABELS: Record<HazardKey, string> = {
  heat: 'Canicule',
  flood: 'Inondation',
  coastal: 'Littoral',
  drought: 'Sécheresse',
  wildfire: 'Feux',
  clay: 'Argiles',
  radon: 'Radon',
  seismic: 'Séisme',
  cavity: 'Cavités',
}

export const CLIMATE_KEYS: HazardKey[] = [
  'heat',
  'flood',
  'coastal',
  'drought',
  'wildfire',
]

export const PLACE_KEYS: HazardKey[] = [
  'clay',
  'radon',
  'seismic',
  'cavity',
]

export const STABLE_HAZARD_KEYS = PLACE_KEYS

export function isStableHazard(key: HazardKey): boolean {
  return (STABLE_HAZARD_KEYS as readonly string[]).includes(key)
}

/** Pondérations défaut (miroir API) pour recalcul local si besoin */
const DEFAULT_WEIGHTS: Record<HazardKey, number> = {
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

function groupScore(hazards: Record<HazardKey, number>, keys: HazardKey[]) {
  let total = 0
  let weightSum = 0
  for (const key of keys) {
    const w = DEFAULT_WEIGHTS[key] ?? 0
    total += (hazards[key] ?? 0) * w
    weightSum += w
  }
  if (weightSum <= 0) return 0
  return Math.round(total / weightSum)
}

export function climateScoreOf(commune: CommuneScore): number {
  return commune.scoreClimate ?? groupScore(commune.hazards, CLIMATE_KEYS)
}

export function placeScoreOf(commune: CommuneScore): number {
  return commune.scorePlace ?? groupScore(commune.hazards, PLACE_KEYS)
}

/** Courte explication grand public par aléa */
export const HAZARD_BLURBS: Record<HazardKey, string> = {
  heat: 'Jours très chauds (Tmax ≥ 30 °C) projetés sur la décennie.',
  flood:
    'Pluies intenses / extrêmes, ancrées sur les risques réglementaires d’inondation.',
  coastal:
    'Proximité du littoral et risques de submersion / érosion côtière.',
  drought:
    'Déficit hydrique (évaporation − pluie) et sécheresses climatiques.',
  wildfire:
    'Sécheresse pluviométrique et chaleur modérée, mêlées au risque feux réglementaire.',
  clay: 'Retrait-gonflement des argiles (RGA) — risque réglementaire sur le bâti.',
  radon:
    'Potentiel radon (classes ASNR 1–3) — gaz naturel, risque santé intérieur.',
  seismic:
    'Zonage sismique réglementaire (zones 1–5) — contraintes parasismiques au bâti.',
  cavity:
    'Cavités souterraines recensées (carrières, affaissements) — risque pour le sous-sol.',
}

/** Sources affichées sous chaque aléa (fiche commune) */
export const HAZARD_SOURCES: Record<HazardKey, string> = {
  heat: 'DRIAS / Explore2 · tasmax (RADIS)',
  flood: 'DRIAS prtot · Géorisques AZI / TRI / PPRN',
  coastal: 'Distance côte · Géorisques · CEREMA INEC',
  drought: 'DRIAS ETP FAO − pluie · jours secs (RADIS)',
  wildfire: 'DRIAS · Géorisques OLD/GASPAR · BDIFF (si importé)',
  clay: 'Géorisques rapport RGA (faible / modéré / important)',
  radon: 'Géorisques / ASNR — classes 1–3 (+ GASPAR 18)',
  seismic: 'Géorisques /zonage_sismique — zones 1–5 (+ GASPAR 13)',
  cavity: 'Géorisques /cavites — dénombrement (+ GASPAR 121 si count=0)',
}

export type RiskBand = 'low' | 'moderate' | 'high' | 'severe'

export function riskBand(score: number): RiskBand {
  if (score < 25) return 'low'
  if (score < 50) return 'moderate'
  if (score < 75) return 'high'
  return 'severe'
}

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  low: 'Faible',
  moderate: 'Modéré',
  high: 'Élevé',
  severe: 'Très élevé',
}

export function dominantHazard(
  hazards: Record<HazardKey, number>,
): { key: HazardKey; value: number } | null {
  const keys = Object.keys(hazards) as HazardKey[]
  if (!keys.length) return null
  let best = keys[0]!
  for (const key of keys) {
    if (hazards[key] > hazards[best]) best = key
  }
  return { key: best, value: hazards[best] }
}

/** URL API côté serveur (Docker / SSR) puis fallback navigateur */
export function getApiBaseUrl(): string {
  return (
    import.meta.env.API_URL ??
    import.meta.env.PUBLIC_API_URL ??
    'http://127.0.0.1:3000'
  )
}

export async function fetchScores(
  limit = 20,
  horizon: Horizon = DEFAULT_HORIZON,
): Promise<CommuneScore[]> {
  const res = await fetch(
    `${getApiBaseUrl()}/scores?limit=${limit}&horizon=${horizon}`,
  )
  if (!res.ok) {
    throw new Error(`API scores: ${res.status}`)
  }
  const data = (await res.json()) as { results: CommuneScore[] }
  return data.results
}

export async function fetchCommune(
  insee: string,
  horizon: Horizon = DEFAULT_HORIZON,
): Promise<CommuneScore | null> {
  const res = await fetch(
    `${getApiBaseUrl()}/communes/${insee}?horizon=${horizon}`,
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`API commune: ${res.status}`)
  }
  return (await res.json()) as CommuneScore
}

export interface GeorisquesLayerDetail {
  key: keyof RegulatoryLayers
  label: string
  score: number
  matched: Array<{ code: string; label: string }>
}

export interface GeorisquesSummary {
  insee: string
  commune: string | null
  risks: Array<{ code: string; label: string }>
  layers: RegulatoryLayers
  layerDetails: GeorisquesLayerDetail[]
  exposure?: {
    flood: {
      azi: boolean
      tri: boolean
      pprInondation: boolean
      pprInterdiction: boolean
      pprLabels: string[]
    }
    clay: { level: string; label: string | null }
    coastal: {
      risqueCotier: boolean
      reculTraitCote: boolean
      inecHits: number
      inecWorstTaux: number | null
    }
    wildfire: { feuForetRapport: boolean; oldPresent: boolean }
    radon?: { classe: number; label: string | null }
    seismic?: { zone: number; label: string | null }
    cavity?: { count: number }
  }
  catnat: {
    total: number
    recent: Array<{
      code: string
      label: string
      startDate: string | null
      endDate: string | null
      decreeDate: string | null
    }>
  }
  source: 'georisques'
  cached: boolean
  cacheStore?: 'redis' | 'memory'
  fetchedAt: string
}

export async function fetchGeorisques(
  insee: string,
): Promise<GeorisquesSummary | null> {
  const res = await fetch(`${getApiBaseUrl()}/communes/${insee}/georisques`)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`API géorisques: ${res.status}`)
  }
  return (await res.json()) as GeorisquesSummary
}
