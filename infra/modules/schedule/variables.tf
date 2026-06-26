variable "schedule_name" {
  description = "Name of the EventBridge Scheduler schedule"
  type        = string
}

variable "function_arn" {
  description = "ARN of the Lambda function to invoke on the schedule"
  type        = string
}

variable "check_interval_minutes" {
  description = "How often to invoke the engine (minutes)"
  type        = number
  default     = 5

  validation {
    condition     = var.check_interval_minutes >= 1
    error_message = "check_interval_minutes must be at least 1."
  }
}
