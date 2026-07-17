CREATE TABLE IF NOT EXISTS "commune_regulatory" (
  "insee" text PRIMARY KEY NOT NULL,
  "flood" integer DEFAULT 0 NOT NULL,
  "coastal" integer DEFAULT 0 NOT NULL,
  "clay" integer DEFAULT 0 NOT NULL,
  "wildfire" integer DEFAULT 0 NOT NULL,
  "raw_json" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commune_regulatory" DROP CONSTRAINT IF EXISTS "commune_regulatory_insee_communes_insee_fk";
--> statement-breakpoint
ALTER TABLE "commune_regulatory" ADD CONSTRAINT "commune_regulatory_insee_communes_insee_fk" FOREIGN KEY ("insee") REFERENCES "communes"("insee") ON DELETE cascade ON UPDATE no action;
