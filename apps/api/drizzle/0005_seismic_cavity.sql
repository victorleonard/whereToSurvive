ALTER TABLE "commune_scores" ADD COLUMN IF NOT EXISTS "seismic" integer DEFAULT 0 NOT NULL;
ALTER TABLE "commune_scores" ADD COLUMN IF NOT EXISTS "cavity" integer DEFAULT 0 NOT NULL;
ALTER TABLE "commune_regulatory" ADD COLUMN IF NOT EXISTS "seismic" integer DEFAULT 0 NOT NULL;
ALTER TABLE "commune_regulatory" ADD COLUMN IF NOT EXISTS "cavity" integer DEFAULT 0 NOT NULL;
