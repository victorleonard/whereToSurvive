/**
 * Snapshot Géorisques enrichi (PPR/TRI/AZI + RGA + radon + séisme + cavités + OLD + CEREMA INEC)
 * + fusion BDIFF si présent + blend dans commune_scores.
 *
 * FORCE_GEO=1 → re-blend même si source contient déjà +geo
 * (nécessite des scores climatiques « purs » — relancer etl:drias avant).
 *
 * Usage: npm run etl:regulatory --workspace=@wheretosurvive/api
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
config({ path: resolve(root, '.env') })

import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { computeScore } from '../lib/methodology.js'
import { getGeorisquesSummary } from '../lib/georisques.js'
import { blendClimateWithRegulatory } from '../lib/regulatory.js'
import {
  communeBdiff,
  communeGeo,
  communeRegulatory,
  communeScores,
  communes,
} from '../db/schema.js'

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive'

const FORCE_GEO = process.env.FORCE_GEO === '1'

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(
  insee: string,
  opts: Parameters<typeof getGeorisquesSummary>[1],
  attempts = 3,
) {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await getGeorisquesSummary(insee, opts)
    } catch (error) {
      last = error
      await sleep(800 * (i + 1))
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

function regulatoryPayload(
  summary: Awaited<ReturnType<typeof getGeorisquesSummary>>,
  bdiff: {
    fires: number
    ha: number
    score: number
    yearMin: number | null
    yearMax: number | null
  } | null,
) {
  const { layers, exposure } = summary
  return {
    flood: layers.flood,
    coastal: layers.coastal,
    clay: layers.clay,
    wildfire: layers.wildfire,
    radon: layers.radon,
    seismic: layers.seismic,
    cavity: layers.cavity,
    rawJson: JSON.stringify({
      risks: summary.risks,
      layerDetails: summary.layerDetails,
      exposure,
      bdiff: bdiff
        ? {
            fires: bdiff.fires,
            ha: bdiff.ha,
            score: bdiff.score,
            yearMin: bdiff.yearMin,
            yearMax: bdiff.yearMax,
          }
        : null,
      fetchedAt: summary.fetchedAt,
    }),
    updatedAt: new Date(),
  }
}

const scoredInsees = await db
  .selectDistinct({ insee: communeScores.insee })
  .from(communeScores)

const scoredSet = new Set(scoredInsees.map((r) => r.insee))

const allCommunes = await db
  .select({
    insee: communes.insee,
    name: communes.name,
    lat: communeGeo.lat,
    lon: communeGeo.lon,
  })
  .from(communes)
  .leftJoin(communeGeo, eq(communes.insee, communeGeo.insee))
  .orderBy(communes.name)

const rows = allCommunes.filter((c) => scoredSet.has(c.insee))

const bdiffRows = await db.select().from(communeBdiff)
const bdiffByInsee = new Map(bdiffRows.map((r) => [r.insee, r]))

console.log(
  `ETL réglementaire enrichi — ${rows.length} communes scorées` +
    (FORCE_GEO ? ' · FORCE_GEO=1' : '') +
    (bdiffByInsee.size ? ` · BDIFF=${bdiffByInsee.size}` : ' · BDIFF absent'),
)

let ok = 0
let fail = 0
let skipped = 0
let regPatched = 0

for (const commune of rows) {
  const scoreRows = await db
    .select()
    .from(communeScores)
    .where(eq(communeScores.insee, commune.insee))

  const needsFullBlend =
    FORCE_GEO || scoreRows.some((row) => !row.source.includes('+geo'))

  let needsRegPatch = false
  if (!needsFullBlend) {
    const [regRow] = await db
      .select({ rawJson: communeRegulatory.rawJson })
      .from(communeRegulatory)
      .where(eq(communeRegulatory.insee, commune.insee))
      .limit(1)
    const rawJson = regRow?.rawJson ?? ''
    needsRegPatch =
      !rawJson.includes('"radon":{') ||
      !rawJson.includes('"seismic":{') ||
      !rawJson.includes('"cavity":{')
  }

  if (!needsFullBlend && !needsRegPatch) {
    skipped += scoreRows.length
    console.log(`→ ${commune.name} (${commune.insee})… déjà fusionné`)
    continue
  }

  process.stdout.write(
    `→ ${commune.name} (${commune.insee})… ${needsFullBlend ? '' : 'reg patch… '}`,
  )
  try {
    const bdiff = bdiffByInsee.get(commune.insee)
    const summary = await fetchWithRetry(commune.insee, {
      lat: commune.lat,
      lon: commune.lon,
      bdiff: bdiff
        ? { fires: bdiff.fires, ha: bdiff.ha, score: bdiff.score }
        : null,
    })
    const { layers, exposure } = summary
    const payload = regulatoryPayload(
      summary,
      bdiff
        ? {
            fires: bdiff.fires,
            ha: bdiff.ha,
            score: bdiff.score,
            yearMin: bdiff.yearMin,
            yearMax: bdiff.yearMax,
          }
        : null,
    )

    await db
      .insert(communeRegulatory)
      .values({ insee: commune.insee, ...payload })
      .onConflictDoUpdate({
        target: communeRegulatory.insee,
        set: payload,
      })

    let blendedCount = 0
    for (const row of scoreRows) {
      if (needsFullBlend) {
        if (!FORCE_GEO && row.source.includes('+geo')) {
          skipped += 1
          continue
        }

        const blended = blendClimateWithRegulatory(
          {
            heat: row.heat,
            flood: row.flood,
            coastal: row.coastal,
            drought: row.drought,
            wildfire: row.wildfire,
            clay: row.clay ?? 0,
            radon: row.radon ?? 0,
            seismic: row.seismic ?? 0,
            cavity: row.cavity ?? 0,
          },
          layers,
        )
        const score = computeScore(blended)
        const baseSource = row.source.replace(/\+geo.*$/, '') || 'unknown'

        await db
          .update(communeScores)
          .set({
            flood: blended.flood,
            coastal: blended.coastal,
            drought: blended.drought,
            wildfire: blended.wildfire,
            clay: blended.clay,
            radon: blended.radon,
            seismic: blended.seismic,
            cavity: blended.cavity,
            score,
            source: `${baseSource}+geo`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(communeScores.insee, row.insee),
              eq(communeScores.horizon, row.horizon),
            ),
          )
        blendedCount += 1
      } else {
        const radon = Math.max(row.radon ?? 0, layers.radon)
        const seismic = Math.max(row.seismic ?? 0, layers.seismic)
        const cavity = Math.max(row.cavity ?? 0, layers.cavity)
        const hazards = {
          heat: row.heat,
          flood: row.flood,
          coastal: row.coastal,
          drought: row.drought,
          wildfire: row.wildfire,
          clay: row.clay ?? 0,
          radon,
          seismic,
          cavity,
        }
        await db
          .update(communeScores)
          .set({
            radon,
            seismic,
            cavity,
            score: computeScore(hazards),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(communeScores.insee, row.insee),
              eq(communeScores.horizon, row.horizon),
            ),
          )
        regPatched += 1
      }
    }

    ok += 1
    console.log(
      `f=${layers.flood} c=${layers.coastal} a=${layers.clay} feu=${layers.wildfire} rn=${layers.radon} sism=${layers.seismic} cav=${layers.cavity}` +
        (exposure.flood.tri ? ' TRI' : '') +
        (exposure.flood.pprInondation ? ' PPR' : '') +
        (exposure.clay.level !== 'none' ? ` RGA=${exposure.clay.level}` : '') +
        (exposure.radon.classe
          ? ` Rn=${exposure.radon.classe}`
          : '') +
        (exposure.seismic.zone
          ? ` Sism=${exposure.seismic.zone}`
          : '') +
        (exposure.cavity.count > 0
          ? ` Cav=${exposure.cavity.count}`
          : '') +
        (exposure.coastal.inecHits ? ` INEC=${exposure.coastal.inecHits}` : '') +
        (bdiff ? ` BDIFF=${bdiff.score}` : '') +
        ` · scores=${blendedCount}`,
    )
  } catch (error) {
    fail += 1
    console.log('SKIP')
    console.error(`  ${error instanceof Error ? error.message : error}`)
  }

  await sleep(250)
}

console.log(
  `Terminé: ${ok} OK · ${fail} erreurs · ${skipped} scores déjà fusionnés · ${regPatched} scores réglementaires patchés`,
)
await client.end()
