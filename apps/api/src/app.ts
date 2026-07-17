import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { z } from 'zod'
import { checkDb } from './db/client.js'
import {
  compareCommunes,
  getCommuneByInsee,
  listScores,
  searchCommunes,
} from './db/queries.js'
import { communesForHorizon } from './data/communes.js'
import {
  computeClimateScore,
  computePlaceScore,
  computeScore,
  DEFAULT_HORIZON,
  DEFAULT_WEIGHTS,
  HAZARD_KEYS,
  METHODOLOGY,
  parseHorizon,
  type HazardKey,
} from './lib/methodology.js'
import { getGeorisquesSummary } from './lib/georisques.js'
import { checkRedis } from './lib/cache.js'

const app = new Hono()

let dbReady: boolean | null = null

async function useDb(): Promise<boolean> {
  if (dbReady === null) {
    dbReady = await checkDb()
    if (dbReady) console.log('API: Postgres connecté')
    else console.warn('API: Postgres indisponible — fallback mémoire (stubs)')
  }
  return dbReady
}

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'OPTIONS'],
  }),
)

app.get('/health', async (c) => {
  const [database, redis] = await Promise.all([useDb(), checkRedis()])
  return c.json({
    ok: true,
    service: 'wheretosurvive-api',
    version: '0.5.0',
    database,
    redis,
    methodology: METHODOLOGY.version,
    horizons: METHODOLOGY.horizons,
    georisques: true,
  })
})

app.get('/methodology', (c) => c.json(METHODOLOGY))

app.get('/communes/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const horizon = parseHorizon(c.req.query('horizon'))
  if (q.length < 2) {
    return c.json({ results: [], horizon })
  }

  if (await useDb()) {
    const results = await searchCommunes(q, 20, horizon)
    return c.json({ results, horizon })
  }

  const results = communesForHorizon(horizon)
    .filter(
      (commune) =>
        commune.name.toLowerCase().includes(q) ||
        commune.insee.startsWith(q) ||
        commune.department === q,
    )
    .slice(0, 20)

  return c.json({ results, horizon })
})

app.get('/communes/:insee', async (c) => {
  const { insee } = c.req.param()
  const horizon = parseHorizon(c.req.query('horizon'))

  if (await useDb()) {
    const commune = await getCommuneByInsee(insee, horizon)
    if (!commune) return c.json({ error: 'Commune introuvable' }, 404)
    return c.json(commune)
  }

  const commune = communesForHorizon(horizon).find((item) => item.insee === insee)
  if (!commune) return c.json({ error: 'Commune introuvable' }, 404)
  return c.json(commune)
})

app.get('/communes/:insee/georisques', async (c) => {
  const { insee } = c.req.param()
  const horizon = parseHorizon(c.req.query('horizon'))

  if (!/^\d{5}$/.test(insee)) {
    return c.json({ error: 'Code INSEE invalide' }, 400)
  }

  const known =
    (await useDb())
      ? await getCommuneByInsee(insee, horizon)
      : communesForHorizon(horizon).find((item) => item.insee === insee)

  if (!known) {
    return c.json({ error: 'Commune introuvable dans Où Vivre Demain' }, 404)
  }

  try {
    const summary = await getGeorisquesSummary(insee, {
      lat: 'lat' in known ? known.lat : null,
      lon: 'lon' in known ? known.lon : null,
    })
    return c.json(summary)
  } catch (error) {
    console.error('Géorisques proxy error', error)
    return c.json(
      {
        error: 'Impossible de joindre Géorisques',
        details: error instanceof Error ? error.message : 'unknown',
      },
      502,
    )
  }
})

const scoresQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(20),
  sort: z.enum(['score', 'name']).default('score'),
  hazard: z.enum(HAZARD_KEYS).optional(),
  horizon: z.enum(['2030', '2050']).default(DEFAULT_HORIZON),
  w_heat: z.coerce.number().min(0).max(1).optional(),
  w_flood: z.coerce.number().min(0).max(1).optional(),
  w_coastal: z.coerce.number().min(0).max(1).optional(),
  w_drought: z.coerce.number().min(0).max(1).optional(),
  w_wildfire: z.coerce.number().min(0).max(1).optional(),
  w_clay: z.coerce.number().min(0).max(1).optional(),
  w_radon: z.coerce.number().min(0).max(1).optional(),
  w_seismic: z.coerce.number().min(0).max(1).optional(),
  w_cavity: z.coerce.number().min(0).max(1).optional(),
})

function weightsFromQuery(
  data: z.infer<typeof scoresQuerySchema>,
): Record<HazardKey, number> | undefined {
  const custom = {
    heat: data.w_heat,
    flood: data.w_flood,
    coastal: data.w_coastal,
    drought: data.w_drought,
    wildfire: data.w_wildfire,
    clay: data.w_clay,
    radon: data.w_radon,
    seismic: data.w_seismic,
    cavity: data.w_cavity,
  }
  const hasCustom = Object.values(custom).some((v) => v !== undefined)
  if (!hasCustom) return undefined

  return {
    heat: custom.heat ?? DEFAULT_WEIGHTS.heat,
    flood: custom.flood ?? DEFAULT_WEIGHTS.flood,
    coastal: custom.coastal ?? DEFAULT_WEIGHTS.coastal,
    drought: custom.drought ?? DEFAULT_WEIGHTS.drought,
    wildfire: custom.wildfire ?? DEFAULT_WEIGHTS.wildfire,
    clay: custom.clay ?? DEFAULT_WEIGHTS.clay,
    radon: custom.radon ?? DEFAULT_WEIGHTS.radon,
    seismic: custom.seismic ?? DEFAULT_WEIGHTS.seismic,
    cavity: custom.cavity ?? DEFAULT_WEIGHTS.cavity,
  }
}

function parseScoresQuery(c: { req: { query: (k: string) => string | undefined } }) {
  return scoresQuerySchema.safeParse({
    limit: c.req.query('limit'),
    sort: c.req.query('sort') ?? undefined,
    hazard: c.req.query('hazard') ?? undefined,
    horizon: c.req.query('horizon') ?? undefined,
    w_heat: c.req.query('w_heat') ?? undefined,
    w_flood: c.req.query('w_flood') ?? undefined,
    w_coastal: c.req.query('w_coastal') ?? undefined,
    w_drought: c.req.query('w_drought') ?? undefined,
    w_wildfire: c.req.query('w_wildfire') ?? undefined,
    w_clay: c.req.query('w_clay') ?? undefined,
    w_radon: c.req.query('w_radon') ?? undefined,
    w_seismic: c.req.query('w_seismic') ?? undefined,
    w_cavity: c.req.query('w_cavity') ?? undefined,
  })
}

app.get('/scores', async (c) => {
  const parsed = parseScoresQuery(c)

  if (!parsed.success) {
    return c.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten() },
      400,
    )
  }

  const { limit, sort, hazard, horizon } = parsed.data
  const weights = weightsFromQuery(parsed.data)

  if (await useDb()) {
    const { count, results } = await listScores({
      limit,
      sort,
      hazard,
      weights,
      horizon,
    })
    return c.json({
      horizon,
      count,
      weights: weights ?? DEFAULT_WEIGHTS,
      results,
    })
  }

  const ranked = communesForHorizon(horizon)
    .map((commune) => {
      const w = weights ?? DEFAULT_WEIGHTS
      return {
        ...commune,
        score: weights ? computeScore(commune.hazards, weights) : commune.score,
        scoreClimate: computeClimateScore(commune.hazards, w),
        scorePlace: computePlaceScore(commune.hazards, w),
      }
    })
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'fr')
      const scoreA = hazard ? a.hazards[hazard] : a.score
      const scoreB = hazard ? b.hazards[hazard] : b.score
      return scoreA - scoreB
    })

  return c.json({
    horizon,
    count: ranked.length,
    weights: weights ?? DEFAULT_WEIGHTS,
    results: ranked.slice(0, limit),
  })
})

app.get('/geojson/communes', async (c) => {
  const parsed = parseScoresQuery({
    req: {
      query: (k) => {
        if (k === 'limit') return c.req.query('limit') ?? '5000'
        if (k === 'sort') return c.req.query('sort') ?? 'score'
        return c.req.query(k)
      },
    },
  })

  if (!parsed.success) {
    return c.json(
      { error: 'Paramètres invalides', details: parsed.error.flatten() },
      400,
    )
  }

  const { limit, sort, hazard, horizon } = parsed.data
  const weights = weightsFromQuery(parsed.data) ?? DEFAULT_WEIGHTS
  const database = await useDb()

  const payload = database
    ? await listScores({ limit, sort, hazard, weights, horizon })
    : {
        count: communesForHorizon(horizon).length,
        results: communesForHorizon(horizon)
          .map((commune) => ({
            ...commune,
            score: hazard
              ? commune.hazards[hazard]
              : computeScore(commune.hazards, weights),
            scoreClimate: computeClimateScore(commune.hazards, weights),
            scorePlace: computePlaceScore(commune.hazards, weights),
          }))
          .sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name, 'fr')
            return a.score - b.score
          }),
      }

  const features = payload.results
    .filter(
      (commune) =>
        'lat' in commune &&
        'lon' in commune &&
        commune.lat != null &&
        commune.lon != null,
    )
    .map((commune) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [commune.lon as number, commune.lat as number],
      },
      properties: {
        insee: commune.insee,
        name: commune.name,
        region: commune.region,
        score: commune.score,
        scoreClimate: commune.scoreClimate,
        scorePlace: commune.scorePlace,
        horizon: commune.horizon,
        heat: commune.hazards.heat,
        flood: commune.hazards.flood,
        coastal: commune.hazards.coastal,
        drought: commune.hazards.drought,
        wildfire: commune.hazards.wildfire,
        clay: commune.hazards.clay,
        radon: commune.hazards.radon,
        seismic: commune.hazards.seismic,
        cavity: commune.hazards.cavity,
      },
    }))

  return c.json({
    type: 'FeatureCollection',
    horizon,
    weights,
    hazard: hazard ?? null,
    features,
  })
})

app.get('/compare', async (c) => {
  const raw = c.req.query('insee') ?? ''
  const horizon = parseHorizon(c.req.query('horizon'))
  const codes = raw
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)

  if (codes.length < 2 || codes.length > 4) {
    return c.json(
      { error: 'Fournir entre 2 et 4 codes INSEE séparés par des virgules' },
      400,
    )
  }

  if (await useDb()) {
    const results = await compareCommunes(codes, horizon)
    return c.json({ results, horizon })
  }

  const stubs = communesForHorizon(horizon)
  const results = codes.map((insee) => {
    const found = stubs.find((item) => item.insee === insee)
    return found ?? { insee, error: 'introuvable' }
  })

  return c.json({ results, horizon })
})

export default app
