#!/usr/bin/env bash

COMMON_AWS_GLOBAL_DNS_HOSTS=("cloudfront.amazonaws.com")
COMMON_AWS_US_EAST_1_DNS_HOSTS=("sns.us-east-1.amazonaws.com")

terraform_lock_hint() {
  if [[ -f infra/.terraform.tfstate.lock.info ]]; then
    cat >&2 <<'EOF'
!! Terraform left a local state lock at infra/.terraform.tfstate.lock.info.
   If no terraform/provider process is still running, remove it with:
   node -e "require('fs').unlinkSync('infra/.terraform.tfstate.lock.info')"
EOF
  fi
}

require_native_terraform() {
  local tf
  tf="$(command -v terraform || true)"
  if [[ -z "${tf}" ]]; then
    echo "!! terraform not found on PATH" >&2
    return 1
  fi

  local desc
  desc="$(file "${tf}")"
  if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" && "${desc}" != *"arm64"* ]]; then
    cat >&2 <<EOF
!! Terraform must be the native arm64 binary on this Apple-Silicon Mac.
   Found: ${tf}
   file:  ${desc}
   Expected the Homebrew arm64 build, usually /opt/homebrew/bin/terraform.
EOF
    return 1
  fi

  TERRAFORM_BIN="${tf}"
  export TERRAFORM_BIN
}

require_aws_dns() {
  local region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
  local hosts=(
    "${COMMON_AWS_GLOBAL_DNS_HOSTS[@]}"
    "${COMMON_AWS_US_EAST_1_DNS_HOSTS[@]}"
    "s3.${region}.amazonaws.com"
  )

  if [[ "${region}" != "us-east-1" ]]; then
    hosts+=("sns.${region}.amazonaws.com")
  fi

  local host
  for host in "${hosts[@]}"; do
    if ! node -e "require('dns').lookup(process.argv[1], (err) => process.exit(err ? 1 : 0))" "${host}"; then
      cat >&2 <<EOF
!! Cannot resolve common AWS endpoint ${host}.
   Terraform needs AWS API DNS working before it can plan/apply.
   This preflight checks common Barometer endpoints only; Terraform may touch others.
   Check network/VPN/DNS, then retry. Quick local check:
   node -e "require('dns').lookup('${host}', console.log)"
EOF
      return 1
    fi
  done
}

terraform_infra() {
  require_native_terraform || return $?

  local had_errexit=0
  case $- in
    *e*)
      had_errexit=1
      set +e
      ;;
  esac

  "${TERRAFORM_BIN}" -chdir=infra "$@"
  local exit_code=$?

  if (( had_errexit )); then
    set -e
  fi

  # terraform plan -detailed-exitcode returns 2 for "changes present"; that is
  # not a failure and should not print the lock hint.
  if (( exit_code != 0 && exit_code != 2 )); then
    terraform_lock_hint
  fi
  return "${exit_code}"
}
