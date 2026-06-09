ALTER TABLE "pools" ADD COLUMN "view_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "pools_view_token_uniq" ON "pools" ("view_token");
