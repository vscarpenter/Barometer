# ── Lambda execution role ──────────────────────────────────────────────────────
resource "aws_iam_role" "lambda_exec" {
  name = "${var.function_name}-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "LambdaAssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# ── S3: GetObject + PutObject scoped to /status/* and /history/* only ──────────
# The Lambda must never read or write /app/* (that prefix belongs to the frontend deploy).
resource "aws_iam_role_policy" "lambda_s3" {
  name = "s3-status-history"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "S3StatusHistory"
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:PutObject"]
      Resource = [
        "${var.bucket_arn}/status/*",
        "${var.bucket_arn}/history/*"
      ]
    }]
  })
}

# ── SNS: Publish scoped to this specific topic only ───────────────────────────
resource "aws_iam_role_policy" "lambda_sns" {
  name = "sns-publish"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "SnsPublish"
      Effect   = "Allow"
      Action   = "sns:Publish"
      Resource = var.sns_topic_arn
    }]
  })
}

# ── CloudWatch: PutMetricData restricted to the "Barometer" namespace ──────────
# PutMetricData cannot be scoped by resource ARN (AWS limitation), so we use a
# namespace condition as the least-privilege constraint instead.
resource "aws_iam_role_policy" "lambda_cloudwatch_metrics" {
  name = "cloudwatch-metrics"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "PutBarometerMetrics"
      Effect   = "Allow"
      Action   = "cloudwatch:PutMetricData"
      Resource = "*" # PutMetricData has no resource-level support; condition below restricts scope
      Condition = {
        StringEquals = {
          "cloudwatch:namespace" = "Barometer"
        }
      }
    }]
  })
}

# ── CloudWatch Logs: write to this function's log group only ──────────────────
# logs:CreateLogGroup is intentionally omitted — the log group is managed by
# Terraform (aws_cloudwatch_log_group.lambda in main.tf), so Lambda must not
# create it. CreateLogStream + PutLogEvents are the only log permissions needed.
resource "aws_iam_role_policy" "lambda_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "WriteLogs"
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = [
        aws_cloudwatch_log_group.lambda.arn,
        "${aws_cloudwatch_log_group.lambda.arn}:*"
      ]
    }]
  })
}
