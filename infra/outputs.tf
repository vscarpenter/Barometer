output "url" {
  description = "Public URL of the Barometer dashboard"
  value       = module.cdn.url
}

output "bucket_id" {
  description = "S3 bucket name"
  value       = module.storage.bucket_id
}

output "distribution_id" {
  description = "CloudFront distribution ID (needed for cache invalidations on deploy)"
  value       = module.cdn.distribution_id
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = module.engine.function_name
}

output "sns_topic_arn" {
  description = "SNS alerts topic ARN"
  value       = module.alerting.topic_arn
}
