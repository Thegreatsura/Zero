CREATE TABLE "mail0_label_order" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"label_id" text NOT NULL,
	"order" integer DEFAULT 999999 NOT NULL,
	"custom_color" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail0_label_order_connection_id_label_id_unique" UNIQUE("connection_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "mail0_label_order" ADD CONSTRAINT "mail0_label_order_connection_id_mail0_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mail0_connection"("id") ON DELETE cascade ON UPDATE no action;