variable "topic_name" {
  description = "Name for the SNS alerts topic"
  type        = string
}

variable "alert_email" {
  description = "Email address to receive outage and recovery alerts"
  type        = string
}
