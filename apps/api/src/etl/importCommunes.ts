import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
config({ path: resolve(root, '.env') })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { communeGeo, communes } from '../db/schema.js'

const GEO_API =
  'https://geo.api.gouv.fr/communes?fields=nom,code,centre,population,departement,region&format=json&geometry=centre'

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive'

const rawLimit = process.env.COMMUNE_LIMIT ?? '100'
const importAll =
  rawLimit === 'all' || rawLimit === '0' || rawLimit === ''
const limit = importAll ? Number.POSITIVE_INFINITY : Number(rawLimit)

if (!importAll && (!Number.isFinite(limit) || limit <= 0)) {
  throw new Error(
    `COMMUNE_LIMIT invalide: "${rawLimit}" (nombre, "all" ou "0")`,
  )
}

type GeoCommune = {
  code: string
  nom: string
  population?: number
  centre?: { type: string; coordinates: [number, number] }
  departement?: { code: string; nom: string }
  region?: { code: string; nom: string }
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

console.log(
  importAll
    ? 'Import communes (métropole, toutes)…'
    : `Import communes (top ${limit} par population)…`,
)

const response = await fetch(GEO_API, {
  headers: { Accept: 'application/json', 'User-Agent': 'OuVivreDemain/0.5' },
})
if (!response.ok) {
  throw new Error(`geo.api.gouv.fr ${response.status}`)
}

const all = (await response.json()) as GeoCommune[]
const filtered = all
  .filter((c) => {
    if (!c.population || c.centre?.coordinates?.length !== 2) return false
    // Métropole uniquement (exclut DOM-TOM 97x / 98x)
    return !c.code.startsWith('97') && !c.code.startsWith('98')
  })
  .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))

const ranked = importAll ? filtered : filtered.slice(0, limit)

console.log(`${all.length} communes reçues → ${ranked.length} à importer`)

let upserted = 0
for (const c of ranked) {
  const [lon, lat] = c.centre!.coordinates

  await db
    .insert(communes)
    .values({
      insee: c.code,
      name: c.nom,
      department: c.departement?.code ?? '00',
      region: c.region?.nom ?? 'Inconnue',
    })
    .onConflictDoUpdate({
      target: communes.insee,
      set: {
        name: c.nom,
        department: c.departement?.code ?? '00',
        region: c.region?.nom ?? 'Inconnue',
      },
    })

  await db
    .insert(communeGeo)
    .values({ insee: c.code, lat, lon })
    .onConflictDoUpdate({
      target: communeGeo.insee,
      set: { lat, lon },
    })

  upserted += 1
  if (upserted % 20 === 0 || upserted === ranked.length) {
    console.log(`… ${upserted}/${ranked.length}`)
  }
}

console.log(
  `Import OK. Lance ensuite: npm run etl:drias  (scores DRIAS pour les communes en base)`,
)
await client.end()
