#!/usr/bin/env bash
set -euo pipefail

provider=projects/123456/locations/global/workloadIdentityPools/ned-iq-public-github/providers/github
account=ned-iq-public-deployer@kitchen-designer-9d437.iam.gserviceaccount.com

expect_rejected() {
  local output
  if output=$(WIF_PROVIDER="$1" DEPLOY_ACCOUNT="$2" bash scripts/check-public-wif.sh); then
    echo "Invalid WIF settings were accepted" >&2
    exit 1
  fi
  [[ "$output" == *"$3"* ]]
}

expect_rejected '' "$account" PUBLIC_V3_WIF_PROVIDER
expect_rejected "${provider/ned-iq-public-github/other-pool}" "$account" PUBLIC_V3_WIF_PROVIDER
expect_rejected "$provider" '' PUBLIC_V3_DEPLOY_SERVICE_ACCOUNT
expect_rejected "$provider" "${account/ned-iq/nediq}" PUBLIC_V3_DEPLOY_SERVICE_ACCOUNT
expect_rejected "$provider" "ned-iq-v3-public@${account#*@}" PUBLIC_V3_DEPLOY_SERVICE_ACCOUNT
WIF_PROVIDER="$provider" DEPLOY_ACCOUNT="$account" bash scripts/check-public-wif.sh
echo 'PASS public WIF accepts the configured pool and deployer only'
