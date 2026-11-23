import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/pilot-deploy.yml', 'utf8');
const image = 'europe-west1-docker.pkg.dev/kitchen-designer-9d437/nediq/nediq-v3-pilot';
const sha = 'a'.repeat(40);
const digest = 'sha256:' + 'b'.repeat(64);

function step(name) {
  const section = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0];
  assert.ok(section, `Missing step: ${name}`);
  const script = section.split('        run: |\n')[1];
  assert.ok(script, `Missing script: ${name}`);
  return script.split('\n').map(line => line.replace(/^          /, '')).join('\n');
}

test('pilot image attempts build, test, publish and resolve the same unique tag', () => {
  assert.match(workflow, /IMAGE_TAG: \$\{\{ inputs\.release_sha \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  const scratch = mkdtempSync(join(tmpdir(), 'pilot-image-'));
  try {
    const writeMock = (name, body) => writeFileSync(join(scratch, name), `#!/bin/bash\nset -euo pipefail\n${body}\n`, {mode: 0o755});
    writeMock('git', 'echo "$RELEASE_SHA"');
    writeMock('bash', 'echo "smoke $*" >> "$MOCK_LOG"');
    writeMock('docker', `
echo "docker $*" >> "$MOCK_LOG"
if [[ "$1" == push ]]; then
  tag="\${2##*:}"
  [[ ! -e "$MOCK_STATE/$tag" ]]
  touch "$MOCK_STATE/$tag"
fi`);
    writeMock('gcloud', `
echo "gcloud $*" >> "$MOCK_LOG"
if [[ "$1 $2 $3" == "artifacts repositories describe" ]]; then echo "\${MOCK_IMMUTABLE:-true}"
elif [[ "$1 $2 $3 $4" == "artifacts docker images describe" ]]; then echo "$MOCK_DIGEST"
fi`);
    const base = {
      ...process.env, PATH: `${scratch}:${process.env.PATH}`, RELEASE_SHA: sha, IMAGE: image,
      PROJECT: 'project', REGION: 'region', REGISTRY: 'registry', REPOSITORY: 'repo',
      MOCK_LOG: join(scratch, 'log'), MOCK_STATE: scratch, MOCK_DIGEST: digest,
      GITHUB_OUTPUT: join(scratch, 'output')
    };
    const build = step('Build and smoke-test the exact Linux image');
    const publish = step('Publish the immutable attempt tag');
    for (const [run, attempt] of [[123, 1], [123, 2], [124, 1]]) {
      const tag = `${sha}-${run}-${attempt}`;
      const env = {...base, IMAGE_TAG: tag};
      execFileSync('/bin/bash', ['-e', '-c', build], {env});
      execFileSync('/bin/bash', ['-e', '-c', publish], {env});
      const log = readFileSync(base.MOCK_LOG, 'utf8');
      assert.ok(log.includes(`--label org.opencontainers.image.revision=${sha} -t ${image}:${tag} .`));
      assert.ok(log.includes(`smoke tests/pilot-container-smoke.sh ${image}:${tag}`));
      assert.ok(log.includes(`docker push ${image}:${tag}`));
      assert.ok(log.includes(`gcloud artifacts docker images describe ${image}:${tag} `));
    }
    assert.deepEqual(readFileSync(base.GITHUB_OUTPUT, 'utf8').trim().split('\n'), Array(3).fill(`ref=${image}@${digest}`));
    const denied = {...base, IMAGE_TAG: `${sha}-125-1`, MOCK_IMMUTABLE: 'false'};
    assert.notEqual(spawnSync('/bin/bash', ['-e', '-c', publish], {env: denied}).status, 0);
    assert.ok(!readFileSync(base.MOCK_LOG, 'utf8').includes(`docker push ${image}:${denied.IMAGE_TAG}`));
    const invalid = {...base, IMAGE_TAG: `${sha}-126-1`, MOCK_DIGEST: 'invalid'};
    assert.notEqual(spawnSync('/bin/bash', ['-e', '-c', publish], {env: invalid}).status, 0);
    assert.equal(readFileSync(base.GITHUB_OUTPUT, 'utf8').trim().split('\n').length, 3);
    assert.match(workflow, /IMAGE_REF: \$\{\{ steps\.image\.outputs\.ref \}\}/);
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
});
