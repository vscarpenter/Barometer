output "schedule_arn" {
  description = "ARN of the EventBridge Scheduler schedule"
  value       = aws_scheduler_schedule.engine.arn
}
