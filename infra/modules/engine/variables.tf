variable "function_name" {
  description = "Lambda function name"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name (used as the BUCKET env var for the Lambda)"
  type        = string
}

variable "bucket_arn" {
  description = "S3 bucket ARN (used for IAM resource scoping)"
  type        = string
}

variable "sns_topic_arn" {
  description = "SNS topic ARN the Lambda may publish alerts to"
  type        = string
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
  description = "Optional JSON to override the compiled-in provider list at runtime (BAROMETER_PROVIDERS_JSON). Leave empty to use defaults."
  type        = string
  default     = ""
}

variable "bundle_dir" {
  description = "Path to the directory containing handler.mjs. Defaults to packages/engine/dist relative to the repo root."
  type        = string
  default     = ""
}
