import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
config({ path: resolve(root, '.env') })

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { computeScore, parseHorizon } from '../lib/methodology.js'
import { communeGeo, communeScores, communes } from '../db/schema.js'
import {
  computeRawFromDaily,
  scoreHazardsFromRaw,
  type ClimateRawIndicators,
} from './climateIndicators.js'
import {
  CLIMATE_MODEL,
  climatePeriodFor,
  fetchClimateDaily,
  fetchElevation,
} from './openMeteoClimate.js'

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive'

const horizon = parseHorizon(process.env.ETL_HORIZON)
const period = climatePeriodFor(horizon)

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

async function sleep(ms: number) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

const rows = await db
  .select({
    insee: communes.insee,
    name: communes.name,
    lat: communeGeo.lat,
    lon: communeGeo.lon,
  })
  .from(communes)
  .innerJoin(communeGeo, eq(communes.insee, communeGeo.insee))

const targets = rows.filter(
  (row) => row.lat != null && row.lon != null,
) as Array<{ insee: string; name: string; lat: number; lon: number }>

if (targets.length === 0) {
  console.error('Aucune commune avec coordonnées. Lance d’abord: npm run import:communes')
  await client.end()
  process.exit(1)
}

console.log(
  `ETL climat (${CLIMATE_MODEL}, horizon ${horizon} · ${period.label}) — ${targets.length} communes`,
)
console.log(
  'Source: Open-Meteo CMIP6 (proxy DRIAS). Retry auto sur 429.',
)

type SuccessRow = {
  commune: { insee: string; name: string; lat: number; lon: number }
  raw: ClimateRawIndicators
}

const successes: SuccessRow[] = []

for (const commune of targets) {
  process.stdout.write(`→ ${commune.name} (${commune.insee})… `)
  try {
    const [daily, elevation] = await Promise.all([
      fetchClimateDaily(commune.lat, commune.lon, horizon),
      fetchElevation(commune.lat, commune.lon),
    ])

    const raw = computeRawFromDaily({
      dates: daily.dates,
      tmax: daily.tmax,
      precip: daily.precip,
      elevation,
      lat: commune.lat,
      lon: commune.lon,
    })
    successes.push({ commune, raw })
    console.log(
      `heat30=${raw.heatDays30}/an rain20=${raw.heavyRainDays}/an dry=${raw.dryDays}/an coast=${raw.coastDistanceKm}km`,
    )
  } catch (error) {
    console.log('SKIP')
    console.error(
      `  ${error instanceof Error ? error.message : error}`,
    )
  }

  await sleep(800)
}

if (successes.length === 0) {
  console.error('Aucun score calculé.')
  await client.end()
  process.exit(1)
}

const hazardScores = scoreHazardsFromRaw(successes.map((s) => s.raw))

for (let i = 0; i < successes.length; i += 1) {
  const { commune } = successes[i]
  const hazards = hazardScores[i]
  const score = computeScore(hazards)

  await db
    .insert(communeScores)
    .values({
      insee: commune.insee,
      horizon,
      heat: hazards.heat,
      flood: hazards.flood,
      coastal: hazards.coastal,
      drought: hazards.drought,
      wildfire: hazards.wildfire,
      clay: hazards.clay ?? 0,
      radon: hazards.radon ?? 0,
      seismic: hazards.seismic ?? 0,
      cavity: hazards.cavity ?? 0,
      score,
      source: 'open-meteo-cmip6',
    })
    .onConflictDoUpdate({
      target: [communeScores.insee, communeScores.horizon],
      set: {
        heat: hazards.heat,
        flood: hazards.flood,
        coastal: hazards.coastal,
        drought: hazards.drought,
        wildfire: hazards.wildfire,
        clay: hazards.clay ?? 0,
        radon: hazards.radon ?? 0,
        seismic: hazards.seismic ?? 0,
        cavity: hazards.cavity ?? 0,
        score,
        source: 'open-meteo-cmip6',
        updatedAt: new Date(),
      },
    })

  console.log(`✓ ${commune.name}: score=${score}`)
}

console.log(`ETL terminé: ${successes.length}/${targets.length} communes scorées.`)
await client.end()
