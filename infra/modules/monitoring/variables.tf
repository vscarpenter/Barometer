variable "function_name" {
  description = "Lambda function name to monitor"
  type        = string
}

variable "sns_topic_arn" {
  description = "SNS topic ARN to notify when an alarm fires"
  type        = string
}

variable "alarm_prefix" {
  description = "Prefix for CloudWatch alarm names (e.g. 'barometer')"
  type        = string
}
