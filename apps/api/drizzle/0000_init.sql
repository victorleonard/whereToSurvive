CREATE TABLE IF NOT EXISTS "communes" (
  "insee" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "department" text NOT NULL,
  "region" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commune_scores" (
  "insee" text NOT NULL,
  "horizon" text DEFAULT '2050' NOT NULL,
  "heat" integer NOT NULL,
  "flood" integer NOT NULL,
  "coastal" integer NOT NULL,
  "drought" integer NOT NULL,
  "wildfire" integer NOT NULL,
  "score" integer NOT NULL,
  "source" text DEFAULT 'stub' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "commune_scores_pkey" PRIMARY KEY ("insee", "horizon")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commune_geo" (
  "insee" text PRIMARY KEY NOT NULL,
  "lat" real,
  "lon" real
);
--> statement-breakpoint
ALTER TABLE "commune_scores" DROP CONSTRAINT IF EXISTS "commune_scores_insee_communes_insee_fk";
--> statement-breakpoint
ALTER TABLE "commune_scores" ADD CONSTRAINT "commune_scores_insee_communes_insee_fk" FOREIGN KEY ("insee") REFERENCES "communes"("insee") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commune_geo" DROP CONSTRAINT IF EXISTS "commune_geo_insee_communes_insee_fk";
--> statement-breakpoint
ALTER TABLE "commune_geo" ADD CONSTRAINT "commune_geo_insee_communes_insee_fk" FOREIGN KEY ("insee") REFERENCES "communes"("insee") ON DELETE cascade ON UPDATE no action;
