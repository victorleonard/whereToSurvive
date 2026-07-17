import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive'

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 5,
})

export const db = drizzle(client, { schema })

export async function checkDb(): Promise<boolean> {
  try {
    await client`select 1`
    return true
  } catch {
    return false
  }
}
