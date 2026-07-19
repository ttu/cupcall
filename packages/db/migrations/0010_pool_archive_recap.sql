ALTER TABLE "pool_archive_entries" ADD COLUMN "points_history" jsonb;--> statement-breakpoint
ALTER TABLE "pool_archive_entries" ADD COLUMN "stage_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "pool_archives" ADD COLUMN "recap" jsonb;