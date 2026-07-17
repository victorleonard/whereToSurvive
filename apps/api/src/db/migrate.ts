import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
config({ path: resolve(root, '.env') })

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://wheretosurvive:wheretosurvive@localhost:5432/wheretosurvive'

const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

const migrationsFolder = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../drizzle',
)

console.log('Migrations →', migrationsFolder)
await migrate(db, { migrationsFolder })
console.log('Migrations OK')
await client.end()
