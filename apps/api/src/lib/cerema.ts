/**
 * CEREMA — Indicateur national de l’érosion côtière (INEC)
 * ArcGIS REST MapServer public.
 */
const INEC_LAYER =
  'https://gisdata.cerema.fr/arcgis/rest/services/CH1_Erosion_c%C3%B4ti%C3%A8re/MapServer/0/query'

export interface CeremaInecResult {
  hits: number
  /** Taux le plus érosif (m/an), négatif = recul */
  worstTaux: number | null
  avgTaux: number | null
  source: 'cerema-inec'
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OuVivreDemain/0.7 (+local-dev)',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`CEREMA ${response.status}`)
    }
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Interroge l’INEC autour d’un centroïde (buffer mètres).
 * Hors littoral → hits = 0.
 */
export async function queryCeremaInec(
  lat: number,
  lon: number,
  bufferMeters = 3000,
): Promise<CeremaInecResult> {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(bufferMeters),
    units: 'esriSRUnit_Meter',
    outFields: 'taux,duree,marqueur,amenagemen,product',
    returnGeometry: 'false',
    f: 'json',
  })

  try {
    const raw = await fetchJson(`${INEC_LAYER}?${params}`)
    const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const features = Array.isArray(payload?.features) ? payload.features : []

    const rates: number[] = []
    for (const feature of features) {
      const row =
        feature && typeof feature === 'object'
          ? (feature as Record<string, unknown>).attributes
          : null
      const attrs =
        row && typeof row === 'object' ? (row as Record<string, unknown>) : null
      if (!attrs) continue
      const taux = Number(attrs.taux)
      if (Number.isFinite(taux)) rates.push(taux)
    }

    if (!rates.length) {
      return { hits: 0, worstTaux: null, avgTaux: null, source: 'cerema-inec' }
    }

    const worstTaux = rates.reduce((a, b) => (a < b ? a : b))
    const avgTaux = rates.reduce((a, b) => a + b, 0) / rates.length

    return {
      hits: rates.length,
      worstTaux,
      avgTaux,
      source: 'cerema-inec',
    }
  } catch {
    return { hits: 0, worstTaux: null, avgTaux: null, source: 'cerema-inec' }
  }
}
