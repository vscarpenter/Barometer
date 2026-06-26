# ── Required ───────────────────────────────────────────────────────────────────

# Route53 hosted zone ID for barometer.vinny.dev (or your domain_name below).
# Find with: aws route53 list-hosted-zones-by-name --dns-name barometer.vinny.dev
route53_zone_id = "Z0123456789ABCDEFGHIJ"

# Email address to receive outage/recovery alerts.
# AWS will send a subscription confirmation email to this address — you must click it.
alert_email = "you@example.com"

# ── Optional overrides (shown with their defaults) ─────────────────────────────

# AWS region for the stack. ACM cert is always created in us-east-1 regardless.
# region = "us-east-1"

# S3 bucket name — must be globally unique. If "barometer-data" is taken, change this.
# bucket_name = "barometer-data"

# Prefix for Lambda, SNS topic, alarms, and schedule names.
# name_prefix = "barometer"

# Custom domain served by CloudFront.
# domain_name = "barometer.vinny.dev"

# How often EventBridge Scheduler triggers the engine.
# check_interval_minutes = 5

# Hours of 5-minute samples kept in history/recent.json.
# retention_recent_hours = 48

# Days of daily rollup buckets kept in history/rollups.json.
# retention_rollup_days = 90

# JSON string to override the compiled-in provider list at runtime.
# Leave empty to use the 9-provider list compiled into the Lambda bundle.
# providers_json = ""
