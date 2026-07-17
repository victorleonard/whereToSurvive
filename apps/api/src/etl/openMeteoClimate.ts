import { HORIZON_PERIODS, type Horizon, parseHorizon } from '../lib/methodology.js'

const CLIMATE_API = 'https://climate-api.open-meteo.com/v1/climate'
const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation'
export const CLIMATE_MODEL = 'EC_Earth3P_HR'

export function climatePeriodFor(horizon: Horizon) {
  const p = HORIZON_PERIODS[horizon]
  return {
    start: p.start,
    end: p.end,
    label: p.label.replace('–', '-'),
  }
}

export const CLIMATE_PERIOD = climatePeriodFor(
  parseHorizon(process.env.ETL_HORIZON),
).label

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, attempts = 5): Promise<Response> {
  let lastError: Error | null = null
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(url)
    if (res.ok) return res
    if (res.status === 429 || res.status >= 500) {
      const wait = 1500 * 2 ** i
      await sleep(wait)
      lastError = new Error(`HTTP ${res.status}`)
      continue
    }
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  throw lastError ?? new Error(`Failed after ${attempts} attempts`)
}

export async function fetchElevation(lat: number, lon: number): Promise<number> {
  const url = `${ELEVATION_API}?latitude=${lat}&longitude=${lon}`
  const res = await fetchWithRetry(url)
  const data = (await res.json()) as { elevation?: number[] }
  return data.elevation?.[0] ?? 0
}

export async function fetchClimateDaily(
  lat: number,
  lon: number,
  horizon: Horizon = parseHorizon(process.env.ETL_HORIZON),
): Promise<{ dates: string[]; tmax: number[]; precip: number[] }> {
  const period = climatePeriodFor(horizon)
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: period.start,
    end_date: period.end,
    models: CLIMATE_MODEL,
    daily: 'temperature_2m_max,precipitation_sum',
    timezone: 'Europe/Paris',
  })

  const res = await fetchWithRetry(`${CLIMATE_API}?${params}`)
  const data = (await res.json()) as {
    daily?: {
      time: string[]
      temperature_2m_max: number[]
      precipitation_sum: number[]
    }
  }

  if (!data.daily?.time?.length) {
    throw new Error(`Climate API empty for ${lat},${lon}`)
  }

  return {
    dates: data.daily.time,
    tmax: data.daily.temperature_2m_max,
    precip: data.daily.precipitation_sum,
  }
}
