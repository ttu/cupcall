CREATE TABLE "user_login_token" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_login_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "user_login_token" ADD CONSTRAINT "user_login_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
