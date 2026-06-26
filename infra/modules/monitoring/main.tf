# ── Lambda error alarm ─────────────────────────────────────────────────────────
# Fires if the Lambda throws any errors in a 5-minute window.
# treat_missing_data = notBreaching: no invocations → no alarm (Scheduler stopped = separate alert).
resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${var.alarm_prefix}-lambda-errors"
  alarm_description   = "Barometer Lambda threw errors — check logs for adapter failures or panics"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  period              = 300
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.function_name
  }

  alarm_actions = [var.sns_topic_arn]
}

# ── RunSuccess "watch the watcher" alarm ───────────────────────────────────────
# The Lambda emits RunSuccess=1 (namespace: Barometer) on every successful run.
# If two consecutive 15-minute windows pass without that metric the engine is stuck.
# treat_missing_data = breaching makes a dead Lambda visible rather than silently green.
resource "aws_cloudwatch_metric_alarm" "run_success" {
  alarm_name          = "${var.alarm_prefix}-run-success"
  alarm_description   = "No RunSuccess metric for 2 consecutive 15-min periods — Barometer engine may be down"
  namespace           = "Barometer"
  metric_name         = "RunSuccess"
  statistic           = "Sum"
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  period              = 900
  evaluation_periods  = 2
  treat_missing_data  = "breaching"

  alarm_actions = [var.sns_topic_arn]
}
