CREATE TABLE "pending_email_link" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "pending_email_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "pending_email_link" ADD CONSTRAINT "pending_email_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
