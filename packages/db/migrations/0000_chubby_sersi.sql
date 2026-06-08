CREATE TYPE "public"."decided_by" AS ENUM('regulation', 'extraTime', 'penalties');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'in_progress', 'final', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('group', 'R32', 'R16', 'QF', 'SF', 'Final', 'bronze');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('upcoming', 'active', 'finished');--> statement-breakpoint
CREATE TYPE "public"."edit_source" AS ENUM('manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."finish_match" AS ENUM('final', 'bronze');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"display_name" text DEFAULT '' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "actual_answers" (
	"tournament_id" text NOT NULL,
	"bet_key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "actual_answers_tournament_id_bet_key_pk" PRIMARY KEY("tournament_id","bet_key")
);
--> statement-breakpoint
CREATE TABLE "actual_group_order" (
	"tournament_id" text NOT NULL,
	"group_id" text NOT NULL,
	"position" integer NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "actual_group_order_tournament_id_group_id_position_pk" PRIMARY KEY("tournament_id","group_id","position")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text NOT NULL,
	"tournament_id" text NOT NULL,
	"stage" "stage" NOT NULL,
	"group_id" text,
	"home_team_id" text,
	"away_team_id" text,
	"kickoff" timestamp with time zone NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"winner_team_id" text,
	"decided_by" "decided_by",
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	CONSTRAINT "matches_tournament_id_id_pk" PRIMARY KEY("tournament_id","id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"tournament_id" text NOT NULL,
	"player_id" text NOT NULL,
	"name" text NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "players_tournament_id_player_id_pk" PRIMARY KEY("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "stage_group_teams" (
	"tournament_id" text NOT NULL,
	"group_id" text NOT NULL,
	"team_id" text NOT NULL,
	"seed_order" integer NOT NULL,
	CONSTRAINT "stage_group_teams_tournament_id_group_id_team_id_pk" PRIMARY KEY("tournament_id","group_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "stage_groups" (
	"tournament_id" text NOT NULL,
	"id" text NOT NULL,
	CONSTRAINT "stage_groups_tournament_id_id_pk" PRIMARY KEY("tournament_id","id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"tournament_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "teams_tournament_id_id_pk" PRIMARY KEY("tournament_id","id")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"first_kickoff" timestamp with time zone NOT NULL,
	"scoring_config" jsonb NOT NULL,
	"status" "tournament_status" DEFAULT 'upcoming' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_kicks" (
	"pool_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_kicks_pool_id_user_id_pk" PRIMARY KEY("pool_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pool_members" (
	"pool_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"invite_token_hash" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_edits" (
	"id" text PRIMARY KEY NOT NULL,
	"prediction_id" text NOT NULL,
	"editor_user_id" text NOT NULL,
	"field_path" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"source" "edit_source" NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_finish_scores" (
	"prediction_id" text NOT NULL,
	"match" "finish_match" NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	CONSTRAINT "prediction_finish_scores_prediction_id_match_pk" PRIMARY KEY("prediction_id","match")
);
--> statement-breakpoint
CREATE TABLE "prediction_group_scores" (
	"prediction_id" text NOT NULL,
	"match_id" text NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	CONSTRAINT "prediction_group_scores_prediction_id_match_id_pk" PRIMARY KEY("prediction_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "prediction_knockout_picks" (
	"prediction_id" text NOT NULL,
	"bracket_match_key" text NOT NULL,
	"winner_team_id" text NOT NULL,
	CONSTRAINT "prediction_knockout_picks_prediction_id_bracket_match_key_pk" PRIMARY KEY("prediction_id","bracket_match_key")
);
--> statement-breakpoint
CREATE TABLE "prediction_specials" (
	"prediction_id" text NOT NULL,
	"bet_key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "prediction_specials_prediction_id_bet_key_pk" PRIMARY KEY("prediction_id","bet_key")
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tournament_id" text NOT NULL,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"pool_id" text NOT NULL,
	"user_id" text NOT NULL,
	"points_total" integer DEFAULT 0 NOT NULL,
	"breakdown" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_pool_id_user_id_pk" PRIMARY KEY("pool_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_answers" ADD CONSTRAINT "actual_answers_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_group_order" ADD CONSTRAINT "actual_group_order_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_group_teams" ADD CONSTRAINT "stage_group_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_groups" ADD CONSTRAINT "stage_groups_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_kicks" ADD CONSTRAINT "pool_kicks_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_kicks" ADD CONSTRAINT "pool_kicks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_edits" ADD CONSTRAINT "prediction_edits_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_edits" ADD CONSTRAINT "prediction_edits_editor_user_id_user_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_finish_scores" ADD CONSTRAINT "prediction_finish_scores_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_group_scores" ADD CONSTRAINT "prediction_group_scores_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_knockout_picks" ADD CONSTRAINT "prediction_knockout_picks_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_specials" ADD CONSTRAINT "prediction_specials_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pool_members_pool_user_uniq" ON "pool_members" USING btree ("pool_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pools_invite_token_hash_uniq" ON "pools" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_pool_user_uniq" ON "predictions" USING btree ("pool_id","user_id");