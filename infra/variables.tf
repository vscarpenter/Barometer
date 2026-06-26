variable "region" {
  description = "AWS region for the deployment (ACM certificate is always created in us-east-1 regardless)"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix applied to named AWS resources (Lambda, SNS topic, alarms, schedule)"
  type        = string
  default     = "barometer"
}

variable "bucket_name" {
  description = "S3 bucket name — must be globally unique across all AWS accounts. Change the default if taken."
  type        = string
  default     = "barometer-data"
}

variable "domain_name" {
  description = "Custom domain for the CloudFront distribution"
  type        = string
  default     = "barometer.vinny.dev"
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain. The hosted zone must already exist. Find with: aws route53 list-hosted-zones-by-name --dns-name <domain>"
  type        = string
  # No default — this is account-specific and must be supplied.
}

variable "alert_email" {
  description = "Email address to receive outage and recovery alerts via SNS. AWS will send a subscription confirmation email."
  type        = string
  # No default — must be supplied.
}

variable "check_interval_minutes" {
  description = "How often EventBridge Scheduler triggers the Barometer engine (minutes)"
  type        = number
  default     = 5
}

variable "retention_recent_hours" {
  description = "Hours of 5-minute samples to retain in history/recent.json"
  type        = number
  default     = 48
}

variable "retention_rollup_days" {
  description = "Days of daily rollup buckets to retain in history/rollups.json"
  type        = number
  default     = 90
}

variable "providers_json" {
  description = "Optional JSON string to override the compiled-in provider list at runtime (sets BAROMETER_PROVIDERS_JSON on the Lambda). Leave empty to use the defaults compiled into the bundle."
  type        = string
  default     = ""
}
