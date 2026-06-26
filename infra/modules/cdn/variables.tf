variable "bucket_regional_domain_name" {
  description = "Regional domain name of the S3 data bucket (CloudFront origin domain)"
  type        = string
}

variable "bucket_id" {
  description = "S3 bucket ID (name), used for OAC naming"
  type        = string
}

variable "domain_name" {
  description = "Custom domain for the CloudFront distribution (e.g. barometer.vinny.dev)"
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain (must already exist)"
  type        = string
}
