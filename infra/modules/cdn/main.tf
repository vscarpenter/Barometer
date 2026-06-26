terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
      # This module must receive both the default aws provider and an aliased
      # aws.us_east_1 provider. CloudFront ACM certificates must live in us-east-1.
      configuration_aliases = [aws.us_east_1]
    }
  }
}

# ── Origin Access Control ──────────────────────────────────────────────────────
resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.bucket_id}-oac"
  description                       = "OAC for Barometer S3 bucket — all requests signed with SigV4"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── ACM Certificate (must be in us-east-1 for CloudFront) ─────────────────────
resource "aws_acm_certificate" "cert" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "cert" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ── Security response headers (CSP / HSTS / nosniff / frame / referrer) ────────
#
# CSP: the built SPA loads one external module script and one external stylesheet
# (no inline <script>), so script-src can be strict 'self' — which also blocks
# javascript: URIs as defense-in-depth alongside the render-time href allowlist.
# img-src allows data: for the inline-SVG favicon. style-src permits 'unsafe-inline'
# to cover the runtime CSSOM tints (element.style --c / background); style injection
# is low risk since all text is written via textContent, never innerHTML.
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${var.bucket_id}-security-headers"

  security_headers_config {
    content_security_policy {
      content_security_policy = join(" ", [
        "default-src 'self';",
        "script-src 'self';",
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data:;",
        "connect-src 'self';",
        "font-src 'self';",
        "object-src 'none';",
        "base-uri 'self';",
        "frame-ancestors 'none';",
        "form-action 'self';",
        "upgrade-insecure-requests",
      ])
      override = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000 # 2 years
      include_subdomains         = true
      preload                    = false # opt into hstspreload.org separately; it is hard to reverse
      override                   = true
    }

    content_type_options {
      override = true # X-Content-Type-Options: nosniff
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

# ── CloudFront Distribution ────────────────────────────────────────────────────
#
# Routing design — two origins, same S3 bucket, different origin paths:
#
#   "s3-app"  (origin_path = "/app"):  default behavior.
#     GET / → CloudFront appends default_root_object "index.html" → S3 /app/index.html
#     GET /assets/main-abc123.js → S3 /app/assets/main-abc123.js
#     Vite builds with base="/", so asset references are /assets/... (no /app/ prefix).
#     Cache-Control is set per-object at deploy time:
#       index.html  → Cache-Control: no-cache
#       hashed assets → Cache-Control: max-age=31536000, immutable
#
#   "s3-data" (no origin_path): ordered behaviors for status/* and history/*.
#     GET /status/current.json → S3 /status/current.json
#     GET /history/recent.json → S3 /history/recent.json
#     Short TTL (60s) matches the Lambda write cadence of 5 minutes.
#
resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = "PriceClass_100"

  # Origin: SPA assets, prefixed under /app on S3
  origin {
    domain_name              = var.bucket_regional_domain_name
    origin_id                = "s3-app"
    origin_path              = "/app"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # Origin: data files at the bucket root (status/*, history/*)
  origin {
    domain_name              = var.bucket_regional_domain_name
    origin_id                = "s3-data"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # Default behavior: SPA (everything not matched by ordered behaviors below)
  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "s3-app"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    # Let per-object Cache-Control headers (set at deploy time) drive effective TTLs.
    # CloudFront respects Cache-Control: no-cache for index.html and
    # Cache-Control: max-age=31536000,immutable for hashed assets.
    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  # status/* — short TTL; Lambda writes every 5 min, cache for 60 s
  ordered_cache_behavior {
    path_pattern               = "status/*"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "s3-data"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 60
    max_ttl     = 60
  }

  # history/* — same short TTL cadence as status/
  ordered_cache_behavior {
    path_pattern               = "history/*"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "s3-data"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 60
    max_ttl     = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cert.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ── Route53 alias records ──────────────────────────────────────────────────────
resource "aws_route53_record" "a" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.cdn.domain_name
    zone_id                = aws_cloudfront_distribution.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "aaaa" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.cdn.domain_name
    zone_id                = aws_cloudfront_distribution.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}
