# The bucket policy lives in the ROOT (aws_s3_bucket_policy.allow_cloudfront) rather
# than here. This breaks the storage↔cdn circular dependency: the cdn module needs
# the bucket's regional domain name (output below) to create the distribution, and
# the bucket policy needs the distribution ARN that cdn outputs. Splitting the policy
# to root makes the dependency graph linear: storage → cdn → bucket_policy.

resource "aws_s3_bucket" "data" {
  bucket = var.bucket_name

  tags = {
    Name = var.bucket_name
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
