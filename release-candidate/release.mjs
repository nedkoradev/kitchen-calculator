export const version = '3.0.4';
export const probeHost = 'release-check---nediq-v3-public-inu5wh5ola-ew.a.run.app';

export function releaseMetadata(env) {
  if (!env.NEDIQ_RELEASE_SHA) return null;
  const {NEDIQ_RELEASE_SHA: sha, NEDIQ_RELEASE_DIGEST: digest, K_REVISION: revision,
    NEDIQ_RELEASE_TIME: deployedAt, NEDIQ_RELEASE_RUN: run} = env;
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^sha256:[a-f0-9]{64}$/.test(digest ?? '') ||
      !/^nediq-v3-public-gh-\d+-\d+$/.test(revision ?? '') ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(deployedAt ?? '') ||
      !/^\d+$/.test(run ?? '')) throw new Error('Invalid public release metadata');
  return {version, sha, digest, revision, deployedAt,
    tests: {result: 'success', run: 'https://github.com/nedkoradev/kitchen-calculator/actions/runs/' + run}};
}
