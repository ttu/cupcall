CREATE TABLE "pool_archive_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"archive_id" text NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"rank" integer NOT NULL,
	"points_total" integer NOT NULL,
	"breakdown" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_archives" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"pool_name" text NOT NULL,
	"tournament_id" text NOT NULL,
	"tournament_name" text NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_by" text
);
--> statement-breakpoint
ALTER TABLE "pool_archive_entries" ADD CONSTRAINT "pool_archive_entries_archive_id_pool_archives_id_fk" FOREIGN KEY ("archive_id") REFERENCES "public"."pool_archives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_archive_entries" ADD CONSTRAINT "pool_archive_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_archives" ADD CONSTRAINT "pool_archives_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_archives" ADD CONSTRAINT "pool_archives_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pool_archives_pool_id_uniq" ON "pool_archives" USING btree ("pool_id");
