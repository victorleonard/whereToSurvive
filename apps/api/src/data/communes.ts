import {
  computeClimateScore,
  computePlaceScore,
  computeScore,
  type HazardKey,
  type Horizon,
  DEFAULT_HORIZON,
} from '../lib/methodology.js'

export type { HazardKey, Horizon }

export interface CommuneScore {
  insee: string
  name: string
  department: string
  region: string
  /** Indice Ensemble 0–100 (plus élevé = plus de risque) */
  score: number
  scoreClimate: number
  scorePlace: number
  hazards: Record<HazardKey, number>
  horizon: Horizon
  lat?: number
  lon?: number
}

const RAW = [
  {
    insee: '29019',
    name: 'Brest',
    department: '29',
    region: 'Bretagne',
    lat: 48.3904,
    lon: -4.4861,
    hazards: { heat: 18, flood: 30, coastal: 45, drought: 12, wildfire: 10, clay: 0, radon: 0, seismic: 0, cavity: 0 },
  },
  {
    insee: '14118',
    name: 'Caen',
    department: '14',
    region: 'Normandie',
    lat: 49.1829,
    lon: -0.3707,
    hazards: { heat: 25, flood: 35, coastal: 40, drought: 20, wildfire: 15, clay: 20, radon: 0, seismic: 0, cavity: 0 },
  },
  {
    insee: '63113',
    name: 'Clermont-Ferrand',
    department: '63',
    region: 'Auvergne-Rhône-Alpes',
    lat: 45.7772,
    lon: 3.087,
    hazards: { heat: 52, flood: 28, coastal: 0, drought: 45, wildfire: 42, clay: 55, radon: 0, seismic: 0, cavity: 0 },
  },
  {
    insee: '13055',
    name: 'Marseille',
    department: '13',
    region: "Provence-Alpes-Côte d'Azur",
    lat: 43.2965,
    lon: 5.3698,
    hazards: { heat: 72, flood: 45, coastal: 55, drought: 65, wildfire: 60, clay: 65, radon: 0, seismic: 0, cavity: 0 },
  },
  {
    insee: '31555',
    name: 'Toulouse',
    department: '31',
    region: 'Occitanie',
    lat: 43.6047,
    lon: 1.4442,
    hazards: { heat: 65, flood: 42, coastal: 0, drought: 60, wildfire: 55, clay: 40, radon: 0, seismic: 0, cavity: 0 },
  },
  {
    insee: '67482',
    name: 'Strasbourg',
    department: '67',
    region: 'Grand Est',
    lat: 48.5734,
    lon: 7.7521,
    hazards: { heat: 42, flood: 38, coastal: 0, drought: 30, wildfire: 25, clay: 50, radon: 0, seismic: 0, cavity: 0 },
  },
  {
    insee: '33063',
    name: 'Bordeaux',
    department: '33',
    region: 'Nouvelle-Aquitaine',
    lat: 44.8378,
    lon: -0.5792,
    hazards: { heat: 55, flood: 52, coastal: 30, drought: 50, wildfire: 45, clay: 55, radon: 0, seismic: 0, cavity: 0 },
  },
  {
    insee: '44109',
    name: 'Nantes',
    department: '44',
    region: 'Pays de la Loire',
    lat: 47.2184,
    lon: -1.5536,
    hazards: { heat: 28, flood: 40, coastal: 35, drought: 25, wildfire: 20, clay: 35, radon: 0, seismic: 0, cavity: 0 },
  },
] as const

function scaleHazards(
  hazards: Record<HazardKey, number>,
  factor: number,
): Record<HazardKey, number> {
  const out = {} as Record<HazardKey, number>
  for (const key of Object.keys(hazards) as HazardKey[]) {
    out[key] = Math.max(0, Math.min(100, Math.round(hazards[key] * factor)))
  }
  return out
}

function buildForHorizon(horizon: Horizon, factor: number): CommuneScore[] {
  return RAW.map((c) => {
    const hazards = scaleHazards({ ...c.hazards }, factor)
    return {
      ...c,
      hazards,
      score: computeScore(hazards),
      scoreClimate: computeClimateScore(hazards),
      scorePlace: computePlaceScore(hazards),
      horizon,
    }
  })
}

/** Stubs 2050 (référence) */
export const COMMUNES: CommuneScore[] = buildForHorizon('2050', 1)

/** Stubs 2030 : aléas un peu plus bas (climat moins avancé) */
export const COMMUNES_2030: CommuneScore[] = buildForHorizon('2030', 0.82)

export function communesForHorizon(
  horizon: Horizon = DEFAULT_HORIZON,
): CommuneScore[] {
  return horizon === '2030' ? COMMUNES_2030 : COMMUNES
}
