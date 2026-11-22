# Risk Gate: read-only prototype

This is **not an enforced risk gate**. It does not create checks or reviews,
merge PRs, hold credentials, or deploy. Do not configure it as a required
check, replace a human approval with it, or enable auto-deployment.

`classify.mjs` compares complete Git trees and release file contents at two
full commit SHAs. It accepts only a single ordinary-file change consisting
solely of a v3 patch increment by one. Everything else fails closed. The
base must be an ancestor of the head. This is classification, not a proof
that a deployment is safe.

`github-dry-run.mjs` obtains PR and current main metadata directly from the
public GitHub API, classifies the fetched commit objects, and checks the
metadata again. It requires a ready PR from the same repository against
current main. Its two reads do **not** make a later approval or merge atomic.
The sample workflow is deliberately outside `.github/workflows` and cannot
run in this repository. It uses no App token and never executes target code.

Run locally against an already fetched repository:

```text
node risk-gate-prototype/github-dry-run.mjs . 151
node --test tests/risk-gate-prototype.test.mjs
```

## Browser-only dry run

1. The owner creates a separate private control repository with access limited
   to the owner, and protects its default branch and Actions configuration.
   The Copilot/PR identity must not have write, admin, Actions or secrets
   access to it. Do not add any App keys or tokens for this dry run.
2. After reviewing this prototype, the owner copies `classify.mjs` and
   `github-dry-run.mjs` into its `risk-gate-prototype` directory and copies
   `dry-run-workflow.yml` to `.github/workflows/risk-dry-run.yml` there.
   Enable Actions only in that isolated repository and run the workflow
   manually with PR number `151`. Verify that the report contains the expected
   base and head SHAs; test a separate PR with an additional change and
   confirm that it fails. No checks are posted on the application PR.
3. Keep `main` protections and `NEDIQ_V3_AUTO_DEPLOY` unchanged. The
   assistant can develop and test the prototype, but the owner must establish
   the isolation and install and administer any Apps without sharing keys.

## Before any real activation

- Implement and independently test a separate Risk App and control workflow,
  including full PR diff and rename handling, exact base/head binding, stale
  and revoked owner approvals, API failures, and mandatory fail-closed checks
  bound to that App. Define and test atomic merge/base-update protection.
- Implement a separately scoped PR/merge App without ruleset, admin, secrets
  or bypass rights. Test App-created PRs, owner reviews and CI triggers in an
  isolated repository; PR #151 was created by the owner and cannot be
  self-approved. Approval by a Risk App for low-risk changes would change the
  human-review policy and needs separate acceptance after these tests.
- Remove owner/admin credentials from the Copilot execution identity. A
  ruleset with no bypass does not prevent an administrator from editing that
  ruleset. Owner-only control of the control repository and keys is essential.
- Independently verify the existing deployment and rollback protections.
  A runner terminated during deployment may not execute its rollback trap;
  investigate safe isolated fault-injection and recovery before activation.
  Automatic deployment may skip intermediate pushes, and commits with no
  v3 version increase can fail the production version guard.

Until all of these conditions are actually implemented and verified, this
prototype is **not ready** for autonomous merges or production deployment.
