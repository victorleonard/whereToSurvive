/**
 * Import BDIFF (Base de données des incendies de forêt).
 *
 * Optionnel : sans ce fichier, les feux s’appuient sur DRIAS + Géorisques (OLD/GASPAR).
 *
 * Pas d’API publique. Le portail bdiff.agriculture.gouv.fr est parfois inaccessible ;
 * data.gouv ne publie pas de CSV miroir (lien vers le portail uniquement).
 * Quand un export est disponible : le placer dans data/bdiff.csv puis
 * `npm run etl:bdiff` puis `npm run etl:regulatory`.
 *
 * Colonnes attendues (noms souples) :
 *   code_insee | insee | Code INSEE
 *   surface_ha | Surface (ha) | superficie
 *   annee | Année | year
 *
 * Usage: npm run etl:bdiff --workspace=@wheretosurvive/api
 *        BDIFF_CSV=/chemin/export.csv npm run etl:bdiff
 */
import { config } from 'dotenv'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
config({ path: resolve(root, '.env') })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { scoreBdiff } from '../lib/regulatory.js'
import { communeBdiff, communes } from '../db/schema.js'
import { inArray } from 'drizzle-orm'

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive'

const csvPath =
  process.env.BDIFF_CSV?.trim() || resolve(root, 'data/bdiff.csv')

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && ch === sep) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function detectSep(header: string): string {
  const semi = (header.match(/;/g) || []).length
  const comma = (header.match(/,/g) || []).length
  return semi >= comma ? ';' : ','
}

function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase())
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c))
    if (i >= 0) return i
  }
  return -1
}

type Agg = {
  fires: number
  ha: number
  yearMin: number | null
  yearMax: number | null
}

async function loadCsv(path: string): Promise<Map<string, Agg>> {
  const stream = createReadStream(path, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  let sep = ';'
  let headers: string[] = []
  let inseeIdx = -1
  let haIdx = -1
  let yearIdx = -1
  const map = new Map<string, Agg>()
  let lineNo = 0

  for await (const line of rl) {
    if (!line.trim()) continue
    lineNo += 1
    if (lineNo === 1) {
      sep = detectSep(line)
      headers = splitCsvLine(line, sep)
      inseeIdx = findCol(headers, ['insee', 'code_insee', 'code insee'])
      haIdx = findCol(headers, ['surface', 'superficie', 'ha'])
      yearIdx = findCol(headers, ['annee', 'année', 'year'])
      if (inseeIdx < 0) {
        throw new Error(
          `Colonne INSEE introuvable dans ${path}. En-têtes: ${headers.join(' | ')}`,
        )
      }
      continue
    }

    const cols = splitCsvLine(line, sep)
    const insee = (cols[inseeIdx] ?? '').replace(/\D/g, '').padStart(5, '0').slice(-5)
    if (!/^\d{5}$/.test(insee)) continue

    const haRaw = haIdx >= 0 ? cols[haIdx] ?? '0' : '0'
    const ha = Number(String(haRaw).replace(',', '.')) || 0
    const year =
      yearIdx >= 0 ? Number(String(cols[yearIdx] ?? '').slice(0, 4)) || null : null

    const prev = map.get(insee) ?? {
      fires: 0,
      ha: 0,
      yearMin: null,
      yearMax: null,
    }
    prev.fires += 1
    prev.ha += ha
    if (year != null) {
      prev.yearMin = prev.yearMin == null ? year : Math.min(prev.yearMin, year)
      prev.yearMax = prev.yearMax == null ? year : Math.max(prev.yearMax, year)
    }
    map.set(insee, prev)
  }

  return map
}

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

try {
  const fs = await import('node:fs/promises')
  await fs.access(csvPath)
} catch {
  console.error(
    `Fichier BDIFF introuvable: ${csvPath}\n` +
      'BDIFF est optionnel (pas d’API ; portail parfois hors ligne).\n' +
      'Quand un export CSV est dispo : data/bdiff.csv ou BDIFF_CSV=…\n' +
      'Fiche : https://www.data.gouv.fr/datasets/base-de-donnees-sur-les-incendies-de-forets-en-france-bdiff\n' +
      'Portail : https://bdiff.agriculture.gouv.fr/incendies',
  )
  await client.end()
  process.exit(2)
}

console.log(`Import BDIFF ← ${csvPath}`)
const agg = await loadCsv(csvPath)
console.log(`${agg.size} communes avec au moins un feu dans le fichier`)

const known = await db.select({ insee: communes.insee }).from(communes)
const knownSet = new Set(known.map((r) => r.insee))

let written = 0
const batch: Array<{
  insee: string
  fires: number
  ha: number
  yearMin: number | null
  yearMax: number | null
  score: number
}> = []

for (const [insee, row] of agg) {
  if (!knownSet.has(insee)) continue
  const years =
    row.yearMin != null && row.yearMax != null
      ? Math.max(1, row.yearMax - row.yearMin + 1)
      : 20
  batch.push({
    insee,
    fires: row.fires,
    ha: Math.round(row.ha * 10) / 10,
    yearMin: row.yearMin,
    yearMax: row.yearMax,
    score: scoreBdiff(row.fires, row.ha, years),
  })
}

for (let i = 0; i < batch.length; i += 50) {
  const slice = batch.slice(i, i + 50)
  for (const row of slice) {
    await db
      .insert(communeBdiff)
      .values({
        insee: row.insee,
        fires: row.fires,
        ha: row.ha,
        yearMin: row.yearMin,
        yearMax: row.yearMax,
        score: row.score,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: communeBdiff.insee,
        set: {
          fires: row.fires,
          ha: row.ha,
          yearMin: row.yearMin,
          yearMax: row.yearMax,
          score: row.score,
          updatedAt: new Date(),
        },
      })
    written += 1
  }
}

console.log(
  `BDIFF importé: ${written} communes scorées (sur ${known.length} en base). Relancer npm run etl:regulatory.`,
)
await client.end()
