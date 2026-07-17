/**
 * Ancrage réglementaire / exposition officielle → scores 0–100
 * et fusion avec les scores climatiques.
 *
 * Sources :
 * - GASPAR (présence)
 * - TRI / AZI / PPRN (inondation réglementaire)
 * - Rapport Géorisques (RGA niveaux, littoral, feux, radon, séisme)
 * - API radon (classe potentielle ASNR 1/2/3)
 * - API zonage sismique + cavités
 * - OLD (obligation débroussaillement)
 * - BDIFF (historique feux, optionnel)
 * - CEREMA INEC (taux d’érosion côtière)
 */

export type RegulatoryLayer =
  | 'flood'
  | 'coastal'
  | 'clay'
  | 'wildfire'
  | 'radon'
  | 'seismic'
  | 'cavity'

export interface RegulatoryLayers {
  flood: number
  coastal: number
  clay: number
  wildfire: number
  radon: number
  seismic: number
  cavity: number
}

export interface RegulatoryLayerDetail {
  key: RegulatoryLayer
  label: string
  score: number
  matched: Array<{ code: string; label: string }>
}

export type ClayLevel = 'none' | 'faible' | 'moyen' | 'fort'
export type RadonClass = 0 | 1 | 2 | 3
export type SeismicZone = 0 | 1 | 2 | 3 | 4 | 5

export interface FloodExposure {
  gasparCount: number
  azi: boolean
  tri: boolean
  pprInondation: boolean
  pprInterdiction: boolean
}

export interface ClayExposure {
  gasparPresent: boolean
  level: ClayLevel
  label: string | null
}

export interface CoastalExposure {
  gasparCount: number
  risqueCotier: boolean
  reculTraitCote: boolean
  /** Taux d’érosion CEREMA INEC (m/an), négatif = recul */
  inecTaux: number | null
  inecHits: number
}

export interface WildfireExposure {
  gasparPresent: boolean
  feuForetRapport: boolean
  oldPresent: boolean
  /** Score 0–100 dérivé BDIFF si disponible */
  bdiffScore: number | null
  bdiffFires: number | null
  bdiffHa: number | null
}

export interface RadonExposure {
  gasparPresent: boolean
  /** Classe potentielle ASNR / Géorisques (1–3), 0 = inconnu */
  classe: RadonClass
  label: string | null
}

export interface SeismicExposure {
  gasparPresent: boolean
  /** Zone sismique réglementaire (1–5), 0 = inconnu */
  zone: SeismicZone
  label: string | null
}

export interface CavityExposure {
  gasparPresent: boolean
  /** Nombre de cavités recensées (API /cavites) */
  count: number
}

export interface ExposureEvidence {
  flood: FloodExposure
  clay: ClayExposure
  coastal: CoastalExposure
  wildfire: WildfireExposure
  radon: RadonExposure
  seismic: SeismicExposure
  cavity: CavityExposure
}

const LAYER_CODES: Record<RegulatoryLayer, Set<string>> = {
  flood: new Set(['11', '111', '112', '113', '114', '115', '116']),
  coastal: new Set(['117', '126']),
  clay: new Set(['127']),
  wildfire: new Set(['16']),
  radon: new Set(['18']),
  seismic: new Set(['13']),
  /** Affaissements / cavités anthropiques — pas le code 12 générique (glissements, etc.) */
  cavity: new Set(['121']),
}

const LAYER_LABELS: Record<RegulatoryLayer, string> = {
  flood: 'Inondation',
  coastal: 'Littoral / submersion',
  clay: 'Argiles (RGA)',
  wildfire: 'Feux de forêt',
  radon: 'Radon',
  seismic: 'Séisme',
  cavity: 'Cavités / sous-sol',
}

function scoreFromMatches(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 65
  if (count === 2) return 85
  return 100
}

export function parseClayLevel(label: string | null | undefined): ClayLevel {
  if (!label) return 'none'
  const t = label.toLowerCase()
  if (t.includes('important') || t.includes('fort')) return 'fort'
  if (t.includes('modér') || t.includes('moder')) return 'moyen'
  if (t.includes('faible')) return 'faible'
  if (t.includes('existant') || t.includes('présent') || t.includes('present')) {
    return 'moyen'
  }
  return 'none'
}

export function parseRadonClass(
  raw: string | number | null | undefined,
): RadonClass {
  if (raw == null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (n === 1 || n === 2 || n === 3) return n
  return 0
}

/** Fallback quand l’API /radon est vide mais le rapport donne un libellé. */
export function radonClassFromLabel(
  label: string | null | undefined,
): RadonClass {
  const level = parseClayLevel(label)
  if (level === 'fort') return 3
  if (level === 'moyen') return 2
  if (level === 'faible') return 1
  return 0
}

export function scoreClayLevel(level: ClayLevel): number {
  switch (level) {
    case 'faible':
      return 35
    case 'moyen':
      return 65
    case 'fort':
      return 90
    default:
      return 0
  }
}

export function scoreRadonClass(classe: RadonClass): number {
  switch (classe) {
    case 1:
      return 25
    case 2:
      return 55
    case 3:
      return 90
    default:
      return 0
  }
}

export function parseSeismicZone(
  raw: string | number | null | undefined,
): SeismicZone {
  if (raw == null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (n >= 1 && n <= 5) return n as SeismicZone
  return 0
}

export function scoreSeismicZone(zone: SeismicZone): number {
  switch (zone) {
    case 1:
      return 15
    case 2:
      return 30
    case 3:
      return 55
    case 4:
      return 75
    case 5:
      return 95
    default:
      return 0
  }
}

/** Fallback rapport `risquesNaturels.seisme.libelleStatutCommune`. */
export function scoreSeismicFromLabel(
  label: string | null | undefined,
): number {
  if (!label) return 0
  const t = label.toLowerCase()
  if (t.includes('important') || t.includes('fort')) return 75
  if (t.includes('modér') || t.includes('moder')) return 55
  if (t.includes('faible')) return 30
  if (t.includes('existant') || t.includes('présent') || t.includes('present')) {
    return 55
  }
  return 0
}

export function scoreCavityCount(count: number): number {
  if (count <= 0) return 0
  if (count <= 2) return 35
  if (count <= 9) return 55
  if (count <= 49) return 75
  return 90
}

export function scoreFloodExposure(e: FloodExposure): number {
  let score = scoreFromMatches(e.gasparCount)
  if (e.azi) score = Math.max(score, 40)
  if (e.tri) score = Math.max(score, 60)
  if (e.pprInondation) score = Math.max(score, 75)
  if (e.pprInterdiction) score = Math.max(score, 90)
  return score
}

export function scoreClayExposure(e: ClayExposure): number {
  const fromLevel = scoreClayLevel(e.level)
  if (fromLevel > 0) return fromLevel
  return e.gasparPresent ? 65 : 0
}

export function scoreCoastalExposure(e: CoastalExposure): number {
  let score = scoreFromMatches(e.gasparCount)
  if (e.risqueCotier) score = Math.max(score, 70)
  if (e.reculTraitCote) score = Math.max(score, 85)

  if (e.inecTaux != null && e.inecHits > 0) {
    const retreat = Math.abs(Math.min(0, e.inecTaux))
    if (retreat >= 1.5) score = Math.max(score, 95)
    else if (retreat >= 0.5) score = Math.max(score, 80)
    else if (retreat > 0.05) score = Math.max(score, 55)
    else if (e.inecHits > 0 && score < 40) score = Math.max(score, 35)
  }

  return score
}

export function scoreWildfireExposure(e: WildfireExposure): number {
  let reg = 0
  if (e.gasparPresent) reg = Math.max(reg, 65)
  if (e.feuForetRapport) reg = Math.max(reg, 70)
  if (e.oldPresent) reg = Math.max(reg, 80)
  if (e.bdiffScore != null) reg = Math.max(reg, e.bdiffScore)
  return reg
}

export function scoreRadonExposure(e: RadonExposure): number {
  const fromClass = scoreRadonClass(e.classe)
  if (fromClass > 0) return fromClass
  return e.gasparPresent ? 55 : 0
}

export function scoreSeismicExposure(e: SeismicExposure): number {
  const fromZone = scoreSeismicZone(e.zone)
  if (fromZone > 0) return fromZone
  const fromLabel = scoreSeismicFromLabel(e.label)
  if (fromLabel > 0) return fromLabel
  return e.gasparPresent ? 40 : 0
}

export function scoreCavityExposure(e: CavityExposure): number {
  const fromCount = scoreCavityCount(e.count)
  if (fromCount > 0) return fromCount
  return e.gasparPresent ? 35 : 0
}

export function classifyFromEvidence(
  risks: Array<{ code: string; label: string }>,
  evidence: ExposureEvidence,
): {
  layers: RegulatoryLayers
  details: RegulatoryLayerDetail[]
} {
  const buckets: Record<
    RegulatoryLayer,
    Array<{ code: string; label: string }>
  > = {
    flood: [],
    coastal: [],
    clay: [],
    wildfire: [],
    radon: [],
    seismic: [],
    cavity: [],
  }

  for (const risk of risks) {
    const code = risk.code.trim()
    const labelLower = risk.label.toLowerCase()
    for (const key of Object.keys(LAYER_CODES) as RegulatoryLayer[]) {
      if (LAYER_CODES[key].has(code)) {
        buckets[key].push(risk)
      }
    }
    if (
      (labelLower.includes('séisme') || labelLower.includes('seisme')) &&
      !buckets.seismic.some((item) => item.code === code)
    ) {
      buckets.seismic.push(risk)
    }
  }

  const scores: RegulatoryLayers = {
    flood: scoreFloodExposure({
      ...evidence.flood,
      gasparCount: buckets.flood.length || evidence.flood.gasparCount,
    }),
    coastal: scoreCoastalExposure({
      ...evidence.coastal,
      gasparCount: buckets.coastal.length || evidence.coastal.gasparCount,
    }),
    clay: scoreClayExposure({
      ...evidence.clay,
      gasparPresent: evidence.clay.gasparPresent || buckets.clay.length > 0,
    }),
    wildfire: scoreWildfireExposure({
      ...evidence.wildfire,
      gasparPresent:
        evidence.wildfire.gasparPresent || buckets.wildfire.length > 0,
    }),
    radon: scoreRadonExposure({
      ...evidence.radon,
      gasparPresent: evidence.radon.gasparPresent || buckets.radon.length > 0,
    }),
    seismic: scoreSeismicExposure({
      ...evidence.seismic,
      gasparPresent:
        evidence.seismic.gasparPresent || buckets.seismic.length > 0,
    }),
    cavity: scoreCavityExposure({
      ...evidence.cavity,
      gasparPresent: evidence.cavity.gasparPresent || buckets.cavity.length > 0,
    }),
  }

  const extras: Record<
    RegulatoryLayer,
    Array<{ code: string; label: string }>
  > = {
    flood: [
      ...(evidence.flood.azi
        ? [{ code: 'AZI', label: 'Atlas des zones inondables' }]
        : []),
      ...(evidence.flood.tri
        ? [{ code: 'TRI', label: 'Territoire à risque important d’inondation' }]
        : []),
      ...(evidence.flood.pprInondation
        ? [{ code: 'PPRN-I', label: 'PPRN inondation' }]
        : []),
      ...(evidence.flood.pprInterdiction
        ? [{ code: 'PPR-rouge', label: 'Zonage PPR interdiction' }]
        : []),
    ],
    coastal: [
      ...(evidence.coastal.risqueCotier
        ? [{ code: 'cotier', label: 'Risque côtier (rapport)' }]
        : []),
      ...(evidence.coastal.reculTraitCote
        ? [{ code: 'recul', label: 'Recul du trait de côte' }]
        : []),
      ...(evidence.coastal.inecHits > 0
        ? [
            {
              code: 'INEC',
              label: `CEREMA INEC (${evidence.coastal.inecHits} segments)`,
            },
          ]
        : []),
    ],
    clay: [
      ...(evidence.clay.label
        ? [{ code: 'RGA', label: evidence.clay.label }]
        : []),
    ],
    wildfire: [
      ...(evidence.wildfire.oldPresent
        ? [{ code: 'OLD', label: 'Obligation légale de débroussaillement' }]
        : []),
      ...(evidence.wildfire.bdiffFires != null &&
      evidence.wildfire.bdiffFires > 0
        ? [
            {
              code: 'BDIFF',
              label: `${evidence.wildfire.bdiffFires} feux · ${evidence.wildfire.bdiffHa ?? 0} ha`,
            },
          ]
        : []),
    ],
    radon: [
      ...(evidence.radon.classe > 0
        ? [
            {
              code: `classe-${evidence.radon.classe}`,
              label: `Potentiel radon classe ${evidence.radon.classe}`,
            },
          ]
        : []),
      ...(evidence.radon.label
        ? [{ code: 'rapport', label: evidence.radon.label }]
        : []),
    ],
    seismic: [
      ...(evidence.seismic.zone > 0
        ? [
            {
              code: `zone-${evidence.seismic.zone}`,
              label: `Zone sismique ${evidence.seismic.zone}`,
            },
          ]
        : []),
      ...(evidence.seismic.label
        ? [{ code: 'rapport', label: evidence.seismic.label }]
        : []),
    ],
    cavity: [
      ...(evidence.cavity.count > 0
        ? [
            {
              code: 'cavites',
              label: `${evidence.cavity.count} cavité(s) recensée(s)`,
            },
          ]
        : []),
    ],
  }

  const details: RegulatoryLayerDetail[] = (
    Object.keys(LAYER_LABELS) as RegulatoryLayer[]
  ).map((key) => ({
    key,
    label: LAYER_LABELS[key],
    score: scores[key],
    matched: [...buckets[key], ...extras[key]],
  }))

  return { layers: scores, details }
}

/** @deprecated Prefer classifyFromEvidence — conservé pour stubs */
export function classifyGeorisquesRisks(
  risks: Array<{ code: string; label: string }>,
): {
  layers: RegulatoryLayers
  details: RegulatoryLayerDetail[]
} {
  return classifyFromEvidence(risks, {
    flood: {
      gasparCount: 0,
      azi: false,
      tri: false,
      pprInondation: false,
      pprInterdiction: false,
    },
    clay: { gasparPresent: false, level: 'none', label: null },
    coastal: {
      gasparCount: 0,
      risqueCotier: false,
      reculTraitCote: false,
      inecTaux: null,
      inecHits: 0,
    },
    wildfire: {
      gasparPresent: false,
      feuForetRapport: false,
      oldPresent: false,
      bdiffScore: null,
      bdiffFires: null,
      bdiffHa: null,
    },
    radon: { gasparPresent: false, classe: 0, label: null },
    seismic: { gasparPresent: false, zone: 0, label: null },
    cavity: { gasparPresent: false, count: 0 },
  })
}

/**
 * Fusion climat + réglementaire enrichi.
 * - flood / coastal / clay / radon / seismic / cavity : max
 * - wildfire : 40 % climat + 60 % réglementaire (PPR/OLD/BDIFF)
 */
export function blendClimateWithRegulatory(
  climate: {
    heat: number
    flood: number
    coastal: number
    drought: number
    wildfire: number
    clay: number
    radon: number
    seismic: number
    cavity: number
  },
  reg: RegulatoryLayers,
): {
  heat: number
  flood: number
  coastal: number
  drought: number
  wildfire: number
  clay: number
  radon: number
  seismic: number
  cavity: number
} {
  return {
    heat: climate.heat,
    flood: Math.max(climate.flood, reg.flood),
    coastal: Math.max(climate.coastal, reg.coastal),
    drought: climate.drought,
    wildfire: Math.round(climate.wildfire * 0.4 + reg.wildfire * 0.6),
    clay: Math.max(climate.clay, reg.clay),
    radon: Math.max(climate.radon, reg.radon),
    seismic: Math.max(climate.seismic, reg.seismic),
    cavity: Math.max(climate.cavity, reg.cavity),
  }
}

/** Score BDIFF 0–100 à partir du nombre de feux et ha cumulés (fenêtre longue). */
export function scoreBdiff(fires: number, ha: number, years = 20): number {
  if (fires <= 0 && ha <= 0) return 0
  const freq = fires / Math.max(years, 1)
  const area = Math.log1p(Math.max(ha, 0))
  const raw = freq * 25 + area * 12
  return Math.max(0, Math.min(100, Math.round(raw)))
}
