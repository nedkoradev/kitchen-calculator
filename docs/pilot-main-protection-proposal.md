# Proposed main protection (NOT APPLIED)

Repository: `nedkoradev/kitchen-calculator`. This document is a review proposal, not an enabled rule.

1. In **Settings → Rules → Rulesets**, create a branch ruleset targeting exactly `main`, with enforcement **Active** only after owner approval.
2. Require a pull request before merging; set required approving reviews to **0** for the sole owner. Require conversation resolution. Do not enable a mandatory independent reviewer.
3. Require the exact CI check `Node 24 / unit, release, Chromium and diff` from `.github/workflows/pr-checks.yml`; confirm the name against a completed PR run before activating.
4. Block force pushes and branch deletion. Do not configure an unrestricted bypass.
5. Check GitHub plan support and effective ruleset behavior in the UI before enabling. A PR requirement with zero approvals still requires a PR.
6. Test that a Draft PR cannot be merged and that a green, non-Draft PR can be merged by the sole owner after checks; avoid locking out the owner.

**Never activate this ruleset as part of bootstrap or CI.** Activation requires separate explicit approval.

## Pilot bootstrap security review

`scripts/bootstrap-pilot.sh --check` is intended to be read-only. The script must fail closed if an existing OIDC provider differs from the approved repository ID, `main` ref, `pilot` environment, manual dispatch, and workflow reference. Existing service accounts, pools and IAM bindings require manual review before applying a partial setup. Do not interpret permission errors as absent resources.

## Separate deployment follow-up

Prepare a separate PR for `scripts/deploy-pilot.sh`: candidate HTTP smoke test before 100% traffic promotion, verification after promotion, and rollback on post-promotion failure. Cloud Run revision readiness alone does not demonstrate application health. Do not deploy from this PR.

## Approval gates

No merge, GitHub ruleset activation, IAM changes, Firestore Rules changes, or Cloud Run deployments without explicit owner approval. Production NED-IQ v2.95 is out of scope.
