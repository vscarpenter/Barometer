output "distribution_arn" {
  description = "CloudFront distribution ARN (used by the S3 bucket policy OAC condition)"
  value       = aws_cloudfront_distribution.cdn.arn
}

output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.cdn.id
}

output "distribution_domain_name" {
  description = "CloudFront-assigned domain name (e.g. d1234.cloudfront.net)"
  value       = aws_cloudfront_distribution.cdn.domain_name
}

output "url" {
  description = "Public URL of the Barometer dashboard"
  value       = "https://${var.domain_name}"
}
