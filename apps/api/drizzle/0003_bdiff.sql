CREATE TABLE IF NOT EXISTS "commune_bdiff" (
  "insee" text PRIMARY KEY NOT NULL,
  "fires" integer DEFAULT 0 NOT NULL,
  "ha" real DEFAULT 0 NOT NULL,
  "year_min" integer,
  "year_max" integer,
  "score" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commune_bdiff" DROP CONSTRAINT IF EXISTS "commune_bdiff_insee_communes_insee_fk";
--> statement-breakpoint
ALTER TABLE "commune_bdiff" ADD CONSTRAINT "commune_bdiff_insee_communes_insee_fk" FOREIGN KEY ("insee") REFERENCES "communes"("insee") ON DELETE cascade ON UPDATE no action;
