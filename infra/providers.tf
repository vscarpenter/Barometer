terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

# Default provider — used for all resources except ACM (which must be us-east-1).
provider "aws" {
  region = var.region
}

# Aliased provider for us-east-1 — required for the ACM certificate because
# CloudFront only accepts certificates from us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
