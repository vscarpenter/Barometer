locals {
  # EventBridge Scheduler rate expressions require singular unit when value = 1
  rate_unit = var.check_interval_minutes == 1 ? "minute" : "minutes"
}

# ── Scheduler execution role ───────────────────────────────────────────────────
resource "aws_iam_role" "scheduler" {
  name = "${var.schedule_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SchedulerAssumeRole"
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Inline policy: may only invoke this specific Lambda function, nothing else.
resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "invoke-engine"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "InvokeEngine"
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = var.function_arn
    }]
  })
}

# ── EventBridge Scheduler schedule ────────────────────────────────────────────
resource "aws_scheduler_schedule" "engine" {
  name = var.schedule_name

  schedule_expression = "rate(${var.check_interval_minutes} ${local.rate_unit})"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.function_arn
    role_arn = aws_iam_role.scheduler.arn
  }
}
