#!/usr/bin/env bash
set -euo pipefail

if [[ ! "${WIF_PROVIDER:-}" =~ ^projects/[0-9]+/locations/global/workloadIdentityPools/ned-iq-public-github/providers/[^/]+$ ]]; then
  echo "::error::Set PUBLIC_V3_WIF_PROVIDER to the full provider resource name in the ned-iq-public-github pool."
  exit 1
fi

if [[ "${DEPLOY_ACCOUNT:-}" != "ned-iq-public-deployer@kitchen-designer-9d437.iam.gserviceaccount.com" ]]; then
  echo "::error::Set PUBLIC_V3_DEPLOY_SERVICE_ACCOUNT to ned-iq-public-deployer@kitchen-designer-9d437.iam.gserviceaccount.com."
  exit 1
fi
