import { and, eq, ilike, inArray, or } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  communeGeo,
  communeRegulatory,
  communeScores,
  communes,
} from '../db/schema.js'
import {
  computeClimateScore,
  computePlaceScore,
  computeScore,
  DEFAULT_HORIZON,
  DEFAULT_WEIGHTS,
  type HazardKey,
  type Horizon,
  HAZARD_KEYS,
} from '../lib/methodology.js'

export interface RegulatoryDto {
  flood: number
  coastal: number
  clay: number
  wildfire: number
  radon: number
  seismic: number
  cavity: number
}

export interface CommuneScoreDto {
  insee: string
  name: string
  department: string
  region: string
  /** Score Ensemble (9 aléas) */
  score: number
  /** Score Climat — évolue avec l’horizon */
  scoreClimate: number
  /** Score Sol & bâti — stable entre horizons */
  scorePlace: number
  hazards: Record<HazardKey, number>
  horizon: Horizon
  source?: string
  lat?: number | null
  lon?: number | null
  regulatory?: RegulatoryDto | null
}

function rowToDto(
  row: {
    insee: string
    name: string
    department: string
    region: string
    heat: number
    flood: number
    coastal: number
    drought: number
    wildfire: number
    clay: number
    radon?: number | null
    seismic?: number | null
    cavity?: number | null
    score: number
    horizon: string
    source: string
    lat?: number | null
    lon?: number | null
    regFlood?: number | null
    regCoastal?: number | null
    regClay?: number | null
    regWildfire?: number | null
    regRadon?: number | null
    regSeismic?: number | null
    regCavity?: number | null
  },
  weights?: Record<HazardKey, number>,
): CommuneScoreDto {
  const hazards = {
    heat: row.heat,
    flood: row.flood,
    coastal: row.coastal,
    drought: row.drought,
    wildfire: row.wildfire,
    clay: row.clay,
    radon: row.radon ?? 0,
    seismic: row.seismic ?? 0,
    cavity: row.cavity ?? 0,
  }
  const score = weights ? computeScore(hazards, weights) : row.score
  const scoreClimate = computeClimateScore(hazards, weights ?? DEFAULT_WEIGHTS)
  const scorePlace = computePlaceScore(hazards, weights ?? DEFAULT_WEIGHTS)
  const horizon: Horizon =
    row.horizon === '2030' || row.horizon === '2050'
      ? row.horizon
      : DEFAULT_HORIZON

  const regulatory =
    row.regFlood != null
      ? {
          flood: row.regFlood,
          coastal: row.regCoastal ?? 0,
          clay: row.regClay ?? 0,
          wildfire: row.regWildfire ?? 0,
          radon: row.regRadon ?? 0,
          seismic: row.regSeismic ?? 0,
          cavity: row.regCavity ?? 0,
        }
      : null

  return {
    insee: row.insee,
    name: row.name,
    department: row.department,
    region: row.region,
    score,
    scoreClimate,
    scorePlace,
    hazards,
    horizon,
    source: row.source,
    lat: row.lat ?? null,
    lon: row.lon ?? null,
    regulatory,
  }
}

const scoreSelect = {
  insee: communes.insee,
  name: communes.name,
  department: communes.department,
  region: communes.region,
  heat: communeScores.heat,
  flood: communeScores.flood,
  coastal: communeScores.coastal,
  drought: communeScores.drought,
  wildfire: communeScores.wildfire,
  clay: communeScores.clay,
  radon: communeScores.radon,
  seismic: communeScores.seismic,
  cavity: communeScores.cavity,
  score: communeScores.score,
  horizon: communeScores.horizon,
  source: communeScores.source,
  lat: communeGeo.lat,
  lon: communeGeo.lon,
} as const

export async function searchCommunes(
  q: string,
  limit = 20,
  horizon: Horizon = DEFAULT_HORIZON,
) {
  const pattern = `%${q}%`
  const rows = await db
    .select(scoreSelect)
    .from(communes)
    .innerJoin(communeScores, eq(communes.insee, communeScores.insee))
    .leftJoin(communeGeo, eq(communes.insee, communeGeo.insee))
    .where(
      and(
        eq(communeScores.horizon, horizon),
        or(
          ilike(communes.name, pattern),
          ilike(communes.insee, `${q}%`),
          eq(communes.department, q),
        ),
      ),
    )
    .limit(limit)

  return rows.map((r) => rowToDto(r))
}

export async function getCommuneByInsee(
  insee: string,
  horizon: Horizon = DEFAULT_HORIZON,
) {
  const rows = await db
    .select({
      ...scoreSelect,
      regFlood: communeRegulatory.flood,
      regCoastal: communeRegulatory.coastal,
      regClay: communeRegulatory.clay,
      regWildfire: communeRegulatory.wildfire,
      regRadon: communeRegulatory.radon,
      regSeismic: communeRegulatory.seismic,
      regCavity: communeRegulatory.cavity,
    })
    .from(communes)
    .innerJoin(communeScores, eq(communes.insee, communeScores.insee))
    .leftJoin(communeGeo, eq(communes.insee, communeGeo.insee))
    .leftJoin(communeRegulatory, eq(communes.insee, communeRegulatory.insee))
    .where(and(eq(communes.insee, insee), eq(communeScores.horizon, horizon)))
    .limit(1)

  if (!rows[0]) return null
  return rowToDto(rows[0])
}

export async function listScores(options: {
  limit: number
  sort: 'score' | 'name'
  hazard?: HazardKey
  weights?: Record<HazardKey, number>
  horizon?: Horizon
}) {
  const {
    limit,
    sort,
    hazard,
    weights,
    horizon = DEFAULT_HORIZON,
  } = options

  const rows = await db
    .select(scoreSelect)
    .from(communes)
    .innerJoin(communeScores, eq(communes.insee, communeScores.insee))
    .leftJoin(communeGeo, eq(communes.insee, communeGeo.insee))
    .where(eq(communeScores.horizon, horizon))

  let dtos = rows.map((r) => rowToDto(r, weights))

  dtos.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'fr')
    const scoreA = hazard ? a.hazards[hazard] : a.score
    const scoreB = hazard ? b.hazards[hazard] : b.score
    return scoreA - scoreB
  })

  return {
    count: dtos.length,
    results: dtos.slice(0, limit),
  }
}

export async function compareCommunes(
  codes: string[],
  horizon: Horizon = DEFAULT_HORIZON,
) {
  const rows = await db
    .select({
      insee: communes.insee,
      name: communes.name,
      department: communes.department,
      region: communes.region,
      heat: communeScores.heat,
      flood: communeScores.flood,
      coastal: communeScores.coastal,
      drought: communeScores.drought,
      wildfire: communeScores.wildfire,
      clay: communeScores.clay,
      radon: communeScores.radon,
      seismic: communeScores.seismic,
      cavity: communeScores.cavity,
      score: communeScores.score,
      horizon: communeScores.horizon,
      source: communeScores.source,
    })
    .from(communes)
    .innerJoin(communeScores, eq(communes.insee, communeScores.insee))
    .where(
      and(inArray(communes.insee, codes), eq(communeScores.horizon, horizon)),
    )

  const byInsee = new Map(rows.map((r) => [r.insee, rowToDto(r)]))

  return codes.map(
    (insee) => byInsee.get(insee) ?? { insee, error: 'introuvable' as const },
  )
}

export { DEFAULT_WEIGHTS, HAZARD_KEYS, DEFAULT_HORIZON }
