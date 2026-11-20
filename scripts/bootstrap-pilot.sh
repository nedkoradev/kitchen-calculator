#!/usr/bin/env bash
# NED-IQ pilot: one-time GitHub OIDC / Cloud Run bootstrap.
# Default is read-only. Use --apply only after reviewing the plan.
set -euo pipefail
PROJECT=kitchen-designer-9d437
REGION=europe-west1
SERVICE=nediq-v3-pilot
REPO=nedkoradev/kitchen-calculator
POOL=nediq-pilot-github
PROVIDER=pilot-main
DEPLOYER="nediq-pilot-deployer@${PROJECT}.iam.gserviceaccount.com"
MODE="${1:---check}"
[[ "$MODE" == --check || "$MODE" == --apply ]] || { echo 'Usage: bash scripts/bootstrap-pilot.sh [--check|--apply]'; exit 2; }
for cmd in gcloud gh jq; do command -v "$cmd" >/dev/null || { echo "Missing $cmd"; exit 1; }; done
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . || { echo 'Sign in to gcloud first'; exit 1; }
gh auth status >/dev/null
[[ "$(gh repo view "$REPO" --json nameWithOwner --jq .nameWithOwner)" == "$REPO" ]]
[[ "$(gcloud projects describe "$PROJECT" --format='value(projectId)')" == "$PROJECT" ]]
RUNTIME="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')"
[[ -n "$RUNTIME" ]] || { echo 'Pilot runtime identity missing'; exit 1; }
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
REPO_ID="$(gh api "repos/$REPO" --jq .id)"
IMMUTABLE="$(gcloud artifacts repositories describe nediq --project "$PROJECT" --location "$REGION" --format='value(dockerConfig.immutableTags)')"
[[ "${IMMUTABLE,,}" == true ]] || { echo 'STOP: Artifact Registry nediq requires immutable tags; this is a repository-wide setting, review separately.'; exit 1; }
echo "Target: $PROJECT / $REGION / $SERVICE"
echo "Runtime account: $RUNTIME"
echo "GitHub: $REPO (repository ID $REPO_ID)"
echo "Cloud project number: $PROJECT_NUMBER"
echo "Deploy identity: $DEPLOYER"
echo 'Changes if --apply: create dedicated deployer, OIDC pool/provider; grant Artifact Registry writer, Cloud Run developer, runtime actAs; configure two GitHub pilot environment variables.'
if [[ "$MODE" == --check ]]; then echo 'Read-only checks complete. No changes made.'; exit 0; fi
read -r -p 'Type APPLY-PILOT to authorize the changes above: ' CONFIRM
[[ "$CONFIRM" == APPLY-PILOT ]] || { echo 'Cancelled'; exit 1; }
if ! gcloud iam service-accounts describe "$DEPLOYER" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create nediq-pilot-deployer --project "$PROJECT"
fi
if ! gcloud iam workload-identity-pools describe "$POOL" --project "$PROJECT" --location global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" --project "$PROJECT" --location global
fi
CONDITION="assertion.repository_id == '$REPO_ID' && assertion.ref == 'refs/heads/main' && assertion.environment == 'pilot' && assertion.event_name == 'workflow_dispatch' && assertion.workflow_ref == '$REPO/.github/workflows/pilot-deploy.yml@refs/heads/main'"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$PROJECT" --location global --workload-identity-pool "$POOL" >/dev/null 2>&1; then
  echo 'STOP: provider already exists; verify its conditions manually. No automatic widening of existing trust.'
  exit 1
fi
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$PROJECT" --location global --workload-identity-pool "$POOL" \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping 'google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
  --attribute-condition "$CONDITION"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --project "$PROJECT" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$REPO_ID"
gcloud artifacts repositories add-iam-policy-binding nediq --project "$PROJECT" --location "$REGION" \
  --member "serviceAccount:$DEPLOYER" --role roles/artifactregistry.writer
gcloud run services add-iam-policy-binding "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --member "serviceAccount:$DEPLOYER" --role roles/run.developer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project "$PROJECT" \
  --member "serviceAccount:$DEPLOYER" --role roles/iam.serviceAccountUser
gh variable set PILOT_WIF_PROVIDER --env pilot --repo "$REPO" --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
gh variable set PILOT_DEPLOY_SERVICE_ACCOUNT --env pilot --repo "$REPO" --body "$DEPLOYER"
echo 'Bootstrap complete. Verify GitHub environment pilot is limited to main. No deployment was triggered.'
