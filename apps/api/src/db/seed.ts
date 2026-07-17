import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
config({ path: resolve(root, '.env') })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { COMMUNES, COMMUNES_2030 } from '../data/communes.js'
import { computeScore } from '../lib/methodology.js'
import { communeGeo, communeScores, communes } from './schema.js'

const GEO: Record<string, { lat: number; lon: number }> = {
  '29019': { lat: 48.3904, lon: -4.4861 },
  '14118': { lat: 49.1829, lon: -0.3707 },
  '63113': { lat: 45.7772, lon: 3.087 },
  '13055': { lat: 43.2965, lon: 5.3698 },
  '31555': { lat: 43.6047, lon: 1.4442 },
  '67482': { lat: 48.5734, lon: 7.7521 },
  '33063': { lat: 44.8378, lon: -0.5792 },
  '44109': { lat: 47.2184, lon: -1.5536 },
}

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive'

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

console.log(`Seed de ${COMMUNES.length} communes × 2 horizons…`)

for (const c of COMMUNES) {
  await db
    .insert(communes)
    .values({
      insee: c.insee,
      name: c.name,
      department: c.department,
      region: c.region,
    })
    .onConflictDoUpdate({
      target: communes.insee,
      set: {
        name: c.name,
        department: c.department,
        region: c.region,
      },
    })

  for (const row of [c, COMMUNES_2030.find((x) => x.insee === c.insee)!]) {
    const score = computeScore(row.hazards)
    await db
      .insert(communeScores)
      .values({
        insee: row.insee,
        horizon: row.horizon,
        heat: row.hazards.heat,
        flood: row.hazards.flood,
        coastal: row.hazards.coastal,
        drought: row.hazards.drought,
        wildfire: row.hazards.wildfire,
        clay: row.hazards.clay,
        radon: row.hazards.radon ?? 0,
        seismic: row.hazards.seismic ?? 0,
        cavity: row.hazards.cavity ?? 0,
        score,
        source: 'stub',
      })
      .onConflictDoUpdate({
        target: [communeScores.insee, communeScores.horizon],
        set: {
          heat: row.hazards.heat,
          flood: row.hazards.flood,
          coastal: row.hazards.coastal,
          drought: row.hazards.drought,
          wildfire: row.hazards.wildfire,
          clay: row.hazards.clay,
          radon: row.hazards.radon ?? 0,
          seismic: row.hazards.seismic ?? 0,
          cavity: row.hazards.cavity ?? 0,
          score,
          source: 'stub',
          updatedAt: new Date(),
        },
      })
  }

  const geo = GEO[c.insee]
  if (geo) {
    await db
      .insert(communeGeo)
      .values({ insee: c.insee, lat: geo.lat, lon: geo.lon })
      .onConflictDoUpdate({
        target: communeGeo.insee,
        set: { lat: geo.lat, lon: geo.lon },
      })
  }
}

console.log('Seed OK')
await client.end()
