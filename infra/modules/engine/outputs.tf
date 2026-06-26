output "function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.engine.arn
}

output "function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.engine.function_name
}
