import type { HazardKey } from '../lib/methodology.js'

export interface ClimateRawIndicators {
  /** Jours/an moyens avec Tmax ≥ 30 °C (2040–2049) */
  heatDays30: number
  /** Jours/an moyens avec précipitations ≥ 20 mm */
  heavyRainDays: number
  /** Jours secs/an (précip < 0,1 mm) */
  dryDays: number
  /** Max de jours secs consécutifs (moyenne annuelle approx) */
  maxDrySpell: number
  /** Altitude (m) */
  elevation: number
  /** Distance approximative au littoral (km) */
  coastDistanceKm: number
}

export interface ClimateHazardScores {
  hazards: Record<HazardKey, number>
  raw: ClimateRawIndicators
  model: string
  period: string
  source: 'open-meteo-cmip6'
}

/** Points approximatifs du littoral métropolitain pour un proxy « submersion / littoral » */
const COAST_POINTS: Array<[number, number]> = [
  [51.05, 2.35],
  [50.72, 1.6],
  [49.93, 1.08],
  [49.49, 0.1],
  [48.65, -2.0],
  [48.39, -4.49],
  [47.75, -3.37],
  [47.27, -2.2],
  [46.16, -1.15],
  [44.66, -1.17],
  [43.49, -1.56],
  [42.7, 3.03],
  [43.12, 3.1],
  [43.3, 5.37],
  [43.12, 5.93],
  [43.55, 7.02],
  [42.7, 9.45],
]

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function coastDistanceKm(lat: number, lon: number): number {
  let min = Number.POSITIVE_INFINITY
  for (const [clat, clon] of COAST_POINTS) {
    min = Math.min(min, haversineKm(lat, lon, clat, clon))
  }
  return Math.round(min * 10) / 10
}

function maxConsecutive(predicate: boolean[]): number {
  let best = 0
  let current = 0
  for (const hit of predicate) {
    if (hit) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }
  return best
}

function yearsInSeries(dates: string[]): number {
  const years = new Set(dates.map((d) => d.slice(0, 4)))
  return Math.max(years.size, 1)
}

/** Normalise une série de risques bruts en scores 0–100 (plus haut = plus de risque). */
export function normalizeRisk(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 50)
  return values.map((v) => Math.round(100 * ((v - min) / (max - min))))
}

/** @deprecated alias — conserver pour imports existants */
export const invertNormalize = normalizeRisk

export function computeRawFromDaily(input: {
  dates: string[]
  tmax: number[]
  precip: number[]
  elevation: number
  lat: number
  lon: number
}): ClimateRawIndicators {
  const years = yearsInSeries(input.dates)
  const heatDays30 =
    input.tmax.filter((t) => t >= 30).length / years
  const heavyRainDays =
    input.precip.filter((p) => p >= 20).length / years
  const dryFlags = input.precip.map((p) => p < 0.1)
  const dryDays = dryFlags.filter(Boolean).length / years
  const maxDrySpell = maxConsecutive(dryFlags) / years

  return {
    heatDays30: Math.round(heatDays30 * 10) / 10,
    heavyRainDays: Math.round(heavyRainDays * 10) / 10,
    dryDays: Math.round(dryDays * 10) / 10,
    maxDrySpell: Math.round(maxDrySpell * 10) / 10,
    elevation: input.elevation,
    coastDistanceKm: coastDistanceKm(input.lat, input.lon),
  }
}

/**
 * Transforme les indicateurs bruts d’un ensemble de communes en scores relatifs.
 * Feux : surtout sécheresse pluie, faible part chaleur (évite double-compte).
 * Argiles : 0 côté climat (rempli par Géorisques).
 */
export function scoreHazardsFromRaw(
  rows: ClimateRawIndicators[],
): Array<Record<HazardKey, number>> {
  const heat = normalizeRisk(rows.map((r) => r.heatDays30))
  const flood = normalizeRisk(rows.map((r) => r.heavyRainDays))
  const drought = normalizeRisk(
    rows.map((r) => r.dryDays * 0.6 + r.maxDrySpell * 0.4),
  )
  const wildfire = normalizeRisk(
    rows.map((r) => r.dryDays * 0.5 + r.maxDrySpell * 0.3 + r.heatDays30 * 0.2),
  )

  const coastalRisk = rows.map((r) => {
    const proximity = Math.max(0, 120 - r.coastDistanceKm) / 120
    const lowElev = Math.max(0, 80 - r.elevation) / 80
    return proximity * 0.7 + lowElev * 0.3
  })
  const coastal = normalizeRisk(coastalRisk)

  return rows.map((_, i) => ({
    heat: heat[i],
    flood: flood[i],
    drought: drought[i],
    wildfire: wildfire[i],
    coastal: coastal[i],
    clay: 0,
    radon: 0,
    seismic: 0,
    cavity: 0,
  }))
}
