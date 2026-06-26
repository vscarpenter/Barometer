locals {
  # Resolve bundle directory: explicit var takes precedence over repo-relative default.
  # path.module = infra/modules/engine, so ../../../packages/engine/dist reaches the dist dir.
  bundle_dir = var.bundle_dir != "" ? var.bundle_dir : "${path.module}/../../../packages/engine/dist"
}

# ── Lambda bundle zip ──────────────────────────────────────────────────────────
# Zips handler.mjs (and any other files in dist/) into lambda.zip.
# The zip is regenerated whenever source_code_hash changes.
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = local.bundle_dir
  output_path = "${path.module}/lambda.zip"
}

# ── CloudWatch Log Group ───────────────────────────────────────────────────────
# Managed explicitly so we control retention and it's deleted cleanly on destroy.
# Lambda would auto-create this group on first invocation, but that bypasses retention.
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 14
}

# ── Lambda Function ────────────────────────────────────────────────────────────
resource "aws_lambda_function" "engine" {
  function_name    = var.function_name
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "handler.handler" # handler.mjs exports { handler }
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  # 60s headroom for the single-wave fetch of all providers when several are slow
  # and hit retry backoff. Billed per actual ms, so the ceiling is free unless used.
  timeout     = 60
  memory_size = 256

  environment {
    variables = merge(
      {
        BUCKET                 = var.bucket_name
        SNS_TOPIC_ARN          = var.sns_topic_arn
        RETENTION_RECENT_HOURS = tostring(var.retention_recent_hours)
        RETENTION_ROLLUP_DAYS  = tostring(var.retention_rollup_days)
      },
      # Only inject BAROMETER_PROVIDERS_JSON when a non-empty override is supplied.
      var.providers_json != "" ? { BAROMETER_PROVIDERS_JSON = var.providers_json } : {}
    )
  }

  # Ensure the log group exists before Lambda can write its first log stream.
  depends_on = [aws_cloudwatch_log_group.lambda]
}
