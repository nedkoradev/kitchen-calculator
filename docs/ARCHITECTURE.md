# NED-IQ architecture: v2, v3 and shared code

This repository contains two separate product surfaces. The legacy frontend
and the NED-IQ v3 Cloud Run application share the repository and some
compatibility modules, but they must not be treated as the same entry point.

## Legacy v2

The legacy public frontend is Kitchen Designer / NED-IQ v2.

- Main entry: `index.html`
- Static assets and JavaScript modules: repository root
- Rendering and interaction: `app-shell.mjs`, `rendering.mjs`, `geometry.mjs`,
  `cabinet-generator*.mjs`, `inspector.mjs`, `document-tree.mjs`
- Projects and authentication: `cloud.js`, `project-model.mjs`,
  `project-store.mjs`, `project-ui.mjs`
- v2 release metadata: `_data/version.json`, `index.html`,
  `release.json`, `sw.js`
- Hosting: GitHub Pages
- Current source version: v2.96

Do not assume that changing `index.html` changes v3. A v2 change normally
requires the existing v2 release/version checks and browser regressions.

## NED-IQ v3

NED-IQ v3 is the workspace application served through Cloud Run.

- Container entry: `Dockerfile`
- HTTP host: `pilot/server.mjs`
- Public workspace adapter and server: `release-candidate/`
- Workspace format, persistence and UI bridge:
  `document-format/`, `workspace-context/`, `workspace-persistence/`,
  `workspace-ui/`
- Rollout and local staging: `rollout-preflight/`
- Deployment workflow: `.github/workflows/public-v3-candidate.yml`
- Deployment scripts: `scripts/deploy-public-production.sh`,
  `scripts/deploy-public-candidate.sh`, `scripts/check-public-cloud-access.sh`
- v3 visible release metadata: `release-candidate/release.mjs`

The v3 server also has a fallback path to the legacy renderer, but this is an
explicit compatibility mode. It is not evidence that `index.html` is the v3
entry point.

## Deployment state

- Confirmed public v3 release: v3.0.0
- Public production candidate: v3.0.1
- Production probe: GitHub Actions run #4500525259 completed successfully
- The probe found the candidate at 0% production traffic
- Automatic v3 deployment remains disabled
- DNS, IAM, Firestore rules/data, production traffic and the public cutover
  require separate approval and operator action

See `NEDIQ-3-DEPLOYMENT-AUTOMATION.md` and
`NEDIQ-3-PUBLIC-CUTOVER.md` before any deployment task.

## Shared code and instructions

Shared code includes CI workflows, npm scripts, tests, materials, documentation,
the workspace bridge and, for explicit compatibility behavior, a subset of v2
modules. Shared code can affect both products, but the affected product must
be identified before implementation.

Before changing code, answer:

1. Does this alter legacy v2 behavior or Pages?
2. Does this alter v3 Cloud Run behavior or a v3 document/API path?
3. Does it alter shared CI/tests without changing runtime behavior?

Then use the matching test and release procedure. Version v2 and v3
independently: v3-only runtime changes do not increment the v2 minor version.
