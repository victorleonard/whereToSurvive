import { Redis } from 'ioredis'

const CACHE_TTL_SECONDS = 60 * 60 * 24 // 24h
const KEY_PREFIX = 'wts:cache:'

type MemoryEntry = {
  expiresAt: number
  value: string
}

const memory = new Map<string, MemoryEntry>()

let redis: Redis | null = null
let redisReady: boolean | null = null
let redisInitAttempted = false

function getRedisUrl() {
  return process.env.REDIS_URL ?? 'redis://localhost:6379'
}

async function ensureRedis(): Promise<Redis | null> {
  if (redisInitAttempted) return redisReady ? redis : null
  redisInitAttempted = true

  try {
    const client = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      retryStrategy: () => null,
    })

    client.on('error', () => {
      // Evite un crash process ; le fallback mémoire prend le relais.
    })

    const pong = await Promise.race([
      client.ping(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), 2000),
      ),
    ])

    if (pong !== 'PONG') {
      client.disconnect()
      throw new Error('Redis ping failed')
    }

    redis = client
    redisReady = true
    console.log('Cache: Redis connecté')
    return redis
  } catch (error) {
    redisReady = false
    if (redis) {
      try {
        redis.disconnect()
      } catch {
        // ignore
      }
    }
    redis = null
    console.warn(
      'Cache: Redis indisponible — fallback mémoire',
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  const fullKey = `${KEY_PREFIX}${key}`
  const client = await ensureRedis()

  if (client) {
    try {
      return await client.get(fullKey)
    } catch {
      // fallback mémoire
    }
  }

  const local = memory.get(fullKey)
  if (!local) return null
  if (local.expiresAt <= Date.now()) {
    memory.delete(fullKey)
    return null
  }
  return local.value
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds = CACHE_TTL_SECONDS,
): Promise<'redis' | 'memory'> {
  const fullKey = `${KEY_PREFIX}${key}`
  const client = await ensureRedis()

  if (client) {
    try {
      await client.set(fullKey, value, 'EX', ttlSeconds)
      return 'redis'
    } catch {
      // fallback mémoire
    }
  }

  memory.set(fullKey, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    value,
  })
  return 'memory'
}

export async function checkRedis(): Promise<boolean> {
  const client = await ensureRedis()
  if (!client) return false
  try {
    const pong = await client.ping()
    return pong === 'PONG'
  } catch {
    return false
  }
}
