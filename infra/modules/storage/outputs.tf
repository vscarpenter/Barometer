output "bucket_id" {
  description = "S3 bucket name (used as bucket ID in all resource references)"
  value       = aws_s3_bucket.data.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.data.arn
}

output "bucket_regional_domain_name" {
  description = "Region-specific domain name for the S3 bucket (used as CloudFront origin domain)"
  value       = aws_s3_bucket.data.bucket_regional_domain_name
}
