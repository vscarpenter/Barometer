# ── Dependency ordering note ───────────────────────────────────────────────────
#
# storage and cdn have a mutual dependency that is broken by splitting the bucket
# policy out of the storage module:
#
#   module.storage  →  creates bucket + access block  →  outputs regional domain name
#        ↓
#   module.cdn      →  uses bucket domain to create distribution  →  outputs distribution ARN
#        ↓
#   aws_s3_bucket_policy  →  uses both bucket_id (storage) AND distribution_arn (cdn)
#
# This keeps each module cycle-free while the root resource has both values available.

# ── Alerting (no upstream dependencies) ───────────────────────────────────────
module "alerting" {
  source = "./modules/alerting"

  topic_name  = "${var.name_prefix}-alerts"
  alert_email = var.alert_email
}

# ── Storage: bucket + public-access block only (no policy yet) ─────────────────
module "storage" {
  source = "./modules/storage"

  bucket_name = var.bucket_name
}

# ── CDN: distribution + ACM cert + Route53 records ────────────────────────────
# Receives both the default and aliased AWS providers; ACM must be in us-east-1.
module "cdn" {
  source = "./modules/cdn"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  bucket_regional_domain_name = module.storage.bucket_regional_domain_name
  bucket_id                   = module.storage.bucket_id
  domain_name                 = var.domain_name
  route53_zone_id             = var.route53_zone_id
}

# ── Bucket policy: lives here (not in storage) to break the circular dep ───────
# The OAC condition grants ONLY this specific CloudFront distribution s3:GetObject.
# No other principal — not public, not Lambda (Lambda uses its IAM role, not OAC).
resource "aws_s3_bucket_policy" "allow_cloudfront" {
  bucket = module.storage.bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontOACRead"
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "${module.storage.bucket_arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = module.cdn.distribution_arn
        }
      }
    }]
  })
}

# ── Engine: Lambda + log group + IAM ──────────────────────────────────────────
module "engine" {
  source = "./modules/engine"

  function_name          = "${var.name_prefix}-engine"
  bucket_name            = module.storage.bucket_id
  bucket_arn             = module.storage.bucket_arn
  sns_topic_arn          = module.alerting.topic_arn
  retention_recent_hours = var.retention_recent_hours
  retention_rollup_days  = var.retention_rollup_days
  providers_json         = var.providers_json
}

# ── Schedule: EventBridge Scheduler + invocation role ─────────────────────────
module "schedule" {
  source = "./modules/schedule"

  schedule_name          = "${var.name_prefix}-engine-schedule"
  function_arn           = module.engine.function_arn
  check_interval_minutes = var.check_interval_minutes
}

# ── Monitoring: CloudWatch alarms → SNS ───────────────────────────────────────
module "monitoring" {
  source = "./modules/monitoring"

  function_name = module.engine.function_name
  sns_topic_arn = module.alerting.topic_arn
  alarm_prefix  = var.name_prefix
}
