resource "aws_sns_topic" "alerts" {
  name = var.topic_name
}

# Subscriber must confirm the subscription via the confirmation email AWS sends.
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
