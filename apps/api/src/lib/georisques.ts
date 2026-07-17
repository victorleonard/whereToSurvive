import { cacheGet, cacheSet } from './cache.js'
import { queryCeremaInec } from './cerema.js'
import {
  classifyFromEvidence,
  parseClayLevel,
  parseRadonClass,
  parseSeismicZone,
  radonClassFromLabel,
  type ClayLevel,
  type ExposureEvidence,
  type RadonClass,
  type SeismicZone,
  type RegulatoryLayerDetail,
  type RegulatoryLayers,
} from './regulatory.js'

const GEORISQUES_BASE = 'https://www.georisques.gouv.fr/api/v1'
const CACHE_TTL_SECONDS = 60 * 60 * 24 // 24h
const CACHE_VERSION = 'v5'

export interface GeorisqueRisk {
  code: string
  label: string
}

export interface CatNatEvent {
  code: string
  label: string
  startDate: string | null
  endDate: string | null
  decreeDate: string | null
}

export interface ExposureSnapshot {
  flood: {
    azi: boolean
    tri: boolean
    pprInondation: boolean
    pprInterdiction: boolean
    pprLabels: string[]
  }
  clay: {
    level: ClayLevel
    label: string | null
  }
  coastal: {
    risqueCotier: boolean
    reculTraitCote: boolean
    inecHits: number
    inecWorstTaux: number | null
  }
  wildfire: {
    feuForetRapport: boolean
    oldPresent: boolean
  }
  radon: {
    classe: RadonClass
    label: string | null
  }
  seismic: {
    zone: SeismicZone
    label: string | null
  }
  cavity: {
    count: number
  }
}

export interface GeorisquesSummary {
  insee: string
  commune: string | null
  risks: GeorisqueRisk[]
  layers: RegulatoryLayers
  layerDetails: RegulatoryLayerDetail[]
  exposure: ExposureSnapshot
  catnat: {
    total: number
    recent: CatNatEvent[]
  }
  source: 'georisques'
  cached: boolean
  cacheStore?: 'redis' | 'memory'
  fetchedAt: string
}

export interface BdiffStats {
  fires: number
  ha: number
  score: number
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 14_000)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OuVivreDemain/0.7 (+local-dev)',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Géorisques ${response.status} for ${url}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function presentFlag(node: unknown): boolean {
  const row = asRecord(node)
  return Boolean(row?.present === true)
}

function statutLabel(node: unknown): string | null {
  const row = asRecord(node)
  const label = row?.libelleStatutCommune
  return typeof label === 'string' && label.trim() ? label.trim() : null
}

function parsePprn(content: unknown[]): {
  pprInondation: boolean
  pprInterdiction: boolean
  pprLabels: string[]
} {
  let pprInondation = false
  let pprInterdiction = false
  const pprLabels: string[] = []

  for (const item of content) {
    const row = asRecord(item)
    if (!row) continue
    const modele = String(row.modeleProcedure ?? '')
    const lib = String(row.libPpr ?? modele)
    const isFlood =
      modele.includes('PPRN-I') ||
      modele.includes('PPRN-Multi') ||
      /inond/i.test(lib)
    if (isFlood) {
      pprInondation = true
      pprLabels.push(lib)
    }

    const zonage = asRecord(row.zonageReglementaire)
    const types = Array.isArray(zonage?.listTypeReg) ? zonage.listTypeReg : []
    for (const t of types) {
      const z = asRecord(t)
      if (!z) continue
      const code = String(z.code ?? '')
      const libelle = String(z.libelle ?? '')
      if (
        code === '03' ||
        code === '04' ||
        /interdiction/i.test(libelle) ||
        /rouge/i.test(String(z.codeZone ?? ''))
      ) {
        if (isFlood) pprInterdiction = true
      }
    }
  }

  return { pprInondation, pprInterdiction, pprLabels }
}

export async function getGeorisquesSummary(
  insee: string,
  options?: {
    lat?: number | null
    lon?: number | null
    bdiff?: BdiffStats | null
  },
): Promise<GeorisquesSummary> {
  const cacheKey = `georisques:${CACHE_VERSION}:${insee}`
  const cachedRaw = await cacheGet(cacheKey)

  if (cachedRaw && !options?.bdiff) {
    const parsed = JSON.parse(cachedRaw) as GeorisquesSummary
    return {
      ...parsed,
      cached: true,
      cacheStore: parsed.cacheStore ?? 'redis',
    }
  }

  const [
    risquesRaw,
    catnatRaw,
    triRaw,
    aziRaw,
    pprnRaw,
    rapportRaw,
    oldRaw,
    radonRaw,
    seismicRaw,
    cavitiesRaw,
  ] = await Promise.all([
      fetchJson(`${GEORISQUES_BASE}/gaspar/risques?code_insee=${insee}`),
      fetchJson(
        `${GEORISQUES_BASE}/gaspar/catnat?code_insee=${insee}&page=1&page_size=8`,
      ),
      fetchJson(
        `${GEORISQUES_BASE}/gaspar/tri?code_insee=${insee}&page=1&page_size=5`,
      ),
      fetchJson(
        `${GEORISQUES_BASE}/gaspar/azi?code_insee=${insee}&page=1&page_size=5`,
      ),
      fetchJson(
        `${GEORISQUES_BASE}/gaspar/pprn?codeInsee=${insee}&page=1&page_size=20`,
      ),
      fetchJson(
        `${GEORISQUES_BASE}/resultats_rapport_risque?code_insee=${insee}`,
      ),
      fetchJson(`${GEORISQUES_BASE}/old?code_insee=${insee}`).catch(() => null),
      fetchJson(`${GEORISQUES_BASE}/radon?code_insee=${insee}`).catch(() => null),
      fetchJson(
        `${GEORISQUES_BASE}/zonage_sismique?code_insee=${insee}`,
      ).catch(() => null),
      fetchJson(
        `${GEORISQUES_BASE}/cavites?code_insee=${insee}&page=1&page_size=1`,
      ).catch(() => null),
    ])

  const risquesPayload = asRecord(risquesRaw)
  const catnatPayload = asRecord(catnatRaw)
  const triPayload = asRecord(triRaw)
  const aziPayload = asRecord(aziRaw)
  const pprnPayload = asRecord(pprnRaw)
  const rapportPayload = asRecord(rapportRaw)

  const risquesData = Array.isArray(risquesPayload?.data)
    ? risquesPayload.data
    : []
  const firstCommune = asRecord(risquesData[0])
  const details = Array.isArray(firstCommune?.risques_detail)
    ? firstCommune.risques_detail
    : []

  const risks: GeorisqueRisk[] = details
    .map((item) => {
      const row = asRecord(item)
      if (!row) return null
      const code = String(row.num_risque ?? '')
      const label = String(row.libelle_risque_long ?? '')
      if (!code || !label) return null
      return { code, label }
    })
    .filter((item): item is GeorisqueRisk => item !== null)

  const triCount =
    typeof triPayload?.results === 'number'
      ? triPayload.results
      : Array.isArray(triPayload?.data)
        ? triPayload.data.length
        : 0
  const aziCount =
    typeof aziPayload?.results === 'number'
      ? aziPayload.results
      : Array.isArray(aziPayload?.data)
        ? aziPayload.data.length
        : 0

  const pprnContent = Array.isArray(pprnPayload?.content)
    ? pprnPayload.content
    : []
  const pprn = parsePprn(pprnContent)

  const naturels = asRecord(rapportPayload?.risquesNaturels)
  const clayLabel = statutLabel(naturels?.retraitGonflementArgile)
  const clayLevel = parseClayLevel(clayLabel)
  const risqueCotier = presentFlag(naturels?.risqueCotier)
  const reculTraitCote = presentFlag(naturels?.reculTraitCote)
  const feuForetRapport = presentFlag(naturels?.feuForet)
  const radonLabel = statutLabel(naturels?.radon)
  const seismicLabel = statutLabel(naturels?.seisme)

  const radonPayload = asRecord(radonRaw)
  const radonData = Array.isArray(radonPayload?.data) ? radonPayload.data : []
  const radonFirst = asRecord(radonData[0])
  let radonClasse = parseRadonClass(
    radonFirst?.classe_potentiel as string | number | null | undefined,
  )
  if (radonClasse === 0) {
    radonClasse = radonClassFromLabel(radonLabel)
  }

  const seismicPayload = asRecord(seismicRaw)
  const seismicData = Array.isArray(seismicPayload?.data)
    ? seismicPayload.data
    : []
  const seismicFirst = asRecord(seismicData[0])
  const seismicZone = parseSeismicZone(
    seismicFirst?.code_zone as string | number | null | undefined,
  )
  const seismicZoneLabel =
    typeof seismicFirst?.zone_sismicite === 'string' &&
    seismicFirst.zone_sismicite.trim()
      ? seismicFirst.zone_sismicite.trim()
      : seismicZone > 0
        ? `Zone sismique ${seismicZone}`
        : null

  const cavitiesPayload = asRecord(cavitiesRaw)
  const cavityCount =
    typeof cavitiesPayload?.results === 'number' ? cavitiesPayload.results : 0

  const oldPresent = Array.isArray(oldRaw)
    ? oldRaw.length > 0
    : Array.isArray(asRecord(oldRaw)?.data)
      ? (asRecord(oldRaw)!.data as unknown[]).length > 0
      : false

  let inecHits = 0
  let inecWorstTaux: number | null = null
  const lat = options?.lat
  const lon = options?.lon
  const maybeCoastal =
    risqueCotier ||
    reculTraitCote ||
    risks.some((r) => r.code === '117' || r.code === '126') ||
    (lat != null &&
      lon != null &&
      (lon < -0.5 || lon > 2.5) &&
      lat > 42 &&
      lat < 52)

  if (lat != null && lon != null && maybeCoastal) {
    const inec = await queryCeremaInec(lat, lon)
    inecHits = inec.hits
    inecWorstTaux = inec.worstTaux
  }

  const evidence: ExposureEvidence = {
    flood: {
      gasparCount: 0,
      azi: aziCount > 0,
      tri: triCount > 0,
      pprInondation: pprn.pprInondation,
      pprInterdiction: pprn.pprInterdiction,
    },
    clay: {
      gasparPresent: false,
      level: clayLevel,
      label: clayLabel,
    },
    coastal: {
      gasparCount: 0,
      risqueCotier,
      reculTraitCote,
      inecTaux: inecWorstTaux,
      inecHits,
    },
    wildfire: {
      gasparPresent: false,
      feuForetRapport,
      oldPresent,
      bdiffScore: options?.bdiff?.score ?? null,
      bdiffFires: options?.bdiff?.fires ?? null,
      bdiffHa: options?.bdiff?.ha ?? null,
    },
    radon: {
      gasparPresent: false,
      classe: radonClasse,
      label: radonLabel,
    },
    seismic: {
      gasparPresent: false,
      zone: seismicZone,
      label: seismicLabel ?? seismicZoneLabel,
    },
    cavity: {
      gasparPresent: false,
      count: cavityCount,
    },
  }

  const { layers, details: layerDetails } = classifyFromEvidence(
    risks,
    evidence,
  )

  const catnatData = Array.isArray(catnatPayload?.data) ? catnatPayload.data : []
  const recent: CatNatEvent[] = catnatData
    .map((item) => {
      const row = asRecord(item)
      if (!row) return null
      return {
        code: String(row.code_national_catnat ?? ''),
        label: String(row.libelle_risque_jo ?? ''),
        startDate: row.date_debut_evt ? String(row.date_debut_evt) : null,
        endDate: row.date_fin_evt ? String(row.date_fin_evt) : null,
        decreeDate: row.date_publication_arrete
          ? String(row.date_publication_arrete)
          : null,
      }
    })
    .filter((item): item is CatNatEvent => item !== null && Boolean(item.code))

  const exposure: ExposureSnapshot = {
    flood: {
      azi: evidence.flood.azi,
      tri: evidence.flood.tri,
      pprInondation: evidence.flood.pprInondation,
      pprInterdiction: evidence.flood.pprInterdiction,
      pprLabels: pprn.pprLabels,
    },
    clay: {
      level: clayLevel,
      label: clayLabel,
    },
    coastal: {
      risqueCotier,
      reculTraitCote,
      inecHits,
      inecWorstTaux,
    },
    wildfire: {
      feuForetRapport,
      oldPresent,
    },
    radon: {
      classe: radonClasse,
      label: radonLabel,
    },
    seismic: {
      zone: seismicZone,
      label: seismicLabel ?? seismicZoneLabel,
    },
    cavity: {
      count: cavityCount,
    },
  }

  const summary: GeorisquesSummary = {
    insee,
    commune: firstCommune?.libelle_commune
      ? String(firstCommune.libelle_commune)
      : rapportPayload?.commune
        ? String(
            asRecord(rapportPayload.commune)?.libelleCommune ??
              asRecord(rapportPayload.commune)?.nom ??
              '',
          ) || null
        : null,
    risks,
    layers,
    layerDetails,
    exposure,
    catnat: {
      total:
        typeof catnatPayload?.results === 'number'
          ? catnatPayload.results
          : recent.length,
      recent,
    },
    source: 'georisques',
    cached: false,
    fetchedAt: new Date().toISOString(),
  }

  const store = options?.bdiff
    ? undefined
    : await cacheSet(cacheKey, JSON.stringify(summary), CACHE_TTL_SECONDS)

  return { ...summary, cacheStore: store }
}
