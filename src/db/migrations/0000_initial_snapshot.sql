CREATE TABLE "audit_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"operation" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"request_id" varchar(100),
	"previous_data" jsonb,
	"new_data" jsonb,
	"changes" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"error_message" text,
	"error_code" varchar(50),
	"stack_trace" text,
	"created_at" timestamp DEFAULT now(),
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"razorpay_payment_id" varchar(100),
	"razorpay_order_id" varchar(100),
	"razorpay_signature" text,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR',
	"status" varchar(20) NOT NULL,
	"method" varchar(50),
	"method_details" jsonb DEFAULT '{}'::jsonb,
	"description" text,
	"notes" jsonb DEFAULT '{}'::jsonb,
	"receipt" varchar(100),
	"billing_address" jsonb,
	"customer_details" jsonb,
	"gateway_response" jsonb,
	"gateway_fee" numeric(10, 2),
	"refund_amount" numeric(10, 2) DEFAULT '0.00',
	"refund_status" varchar(20),
	"refund_id" varchar(100),
	"refund_reason" text,
	"subscription_id" uuid,
	"plan_id" uuid,
	"risk_score" numeric(3, 2),
	"fraud_flags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_recurring" boolean DEFAULT false,
	"is_refunded" boolean DEFAULT false,
	"is_disputed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"paid_at" timestamp,
	"failed_at" timestamp,
	"refunded_at" timestamp,
	CONSTRAINT "payments_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email_address" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"phone_number" varchar(20),
	"account_confirmation" jsonb DEFAULT '{"status":false,"code":null,"token":null,"timestamp":null}'::jsonb,
	"password_reset" jsonb DEFAULT '{"token":null,"timestamp":null,"attempts":0}'::jsonb,
	"profile" jsonb DEFAULT '{"avatar":null,"bio":null,"location":null,"website":null}'::jsonb,
	"security" jsonb DEFAULT '{"twoFactorEnabled":false,"twoFactorSecret":null,"loginAttempts":0,"lockUntil":null,"lastLogin":null,"ipWhitelist":[]}'::jsonb,
	"preferences" jsonb DEFAULT '{"language":"en","timezone":"UTC","notifications":{"email":true,"push":true,"sms":false}}'::jsonb,
	"is_active" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"role" varchar(50) DEFAULT 'user',
	"organization_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_address_unique" UNIQUE("email_address")
);
--> statement-breakpoint
CREATE INDEX "audit_entity_type_idx" ON "audit_entries" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "audit_entity_id_idx" ON "audit_entries" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "audit_user_id_idx" ON "audit_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_organization_idx" ON "audit_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_status_idx" ON "audit_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_operation_idx" ON "audit_entries" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "audit_timestamp_idx" ON "audit_entries" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_composite_idx" ON "audit_entries" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_user_org_idx" ON "audit_entries" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "payments_user_id_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_organization_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_razorpay_payment_idx" ON "payments" USING btree ("razorpay_payment_id");--> statement-breakpoint
CREATE INDEX "payments_razorpay_order_idx" ON "payments" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_amount_idx" ON "payments" USING btree ("amount");--> statement-breakpoint
CREATE INDEX "payments_user_status_idx" ON "payments" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "payments_org_status_idx" ON "payments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email_address");--> statement-breakpoint
CREATE INDEX "users_organization_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");