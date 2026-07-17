import { integer, pgTable, primaryKey, real, text, timestamp } from 'drizzle-orm/pg-core'

export const communes = pgTable('communes', {
  insee: text('insee').primaryKey(),
  name: text('name').notNull(),
  department: text('department').notNull(),
  region: text('region').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const communeScores = pgTable(
  'commune_scores',
  {
    insee: text('insee')
      .notNull()
      .references(() => communes.insee, { onDelete: 'cascade' }),
    horizon: text('horizon').notNull().default('2050'),
    heat: integer('heat').notNull(),
    flood: integer('flood').notNull(),
    coastal: integer('coastal').notNull(),
    drought: integer('drought').notNull(),
    wildfire: integer('wildfire').notNull(),
    clay: integer('clay').notNull().default(0),
    radon: integer('radon').notNull().default(0),
    seismic: integer('seismic').notNull().default(0),
    cavity: integer('cavity').notNull().default(0),
    /** Score précalculé avec les pondérations par défaut */
    score: integer('score').notNull(),
    source: text('source').notNull().default('stub'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.insee, table.horizon] })],
)

/** Centroïde pour la carte (PostGIS plus tard) */
export const communeGeo = pgTable('commune_geo', {
  insee: text('insee')
    .primaryKey()
    .references(() => communes.insee, { onDelete: 'cascade' }),
  lat: real('lat'),
  lon: real('lon'),
})

/** Ancrage réglementaire Géorisques (indépendant de l’horizon climatique) */
export const communeRegulatory = pgTable('commune_regulatory', {
  insee: text('insee')
    .primaryKey()
    .references(() => communes.insee, { onDelete: 'cascade' }),
  flood: integer('flood').notNull().default(0),
  coastal: integer('coastal').notNull().default(0),
  clay: integer('clay').notNull().default(0),
  wildfire: integer('wildfire').notNull().default(0),
  radon: integer('radon').notNull().default(0),
  seismic: integer('seismic').notNull().default(0),
  cavity: integer('cavity').notNull().default(0),
  rawJson: text('raw_json'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

/** Historique feux BDIFF (agrégé communal) */
export const communeBdiff = pgTable('commune_bdiff', {
  insee: text('insee')
    .primaryKey()
    .references(() => communes.insee, { onDelete: 'cascade' }),
  fires: integer('fires').notNull().default(0),
  ha: real('ha').notNull().default(0),
  yearMin: integer('year_min'),
  yearMax: integer('year_max'),
  score: integer('score').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})
