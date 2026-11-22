import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validateRollbackRevision} from '../scripts/validate-public-rollback.mjs';

const workflowPath = '.github/workflows/public-v3-candidate.yml';
const workflow = readFileSync(workflowPath, 'utf8');
const productionScript = readFileSync('scripts/deploy-public-production.sh', 'utf8');

function checksShouldRun({eventName, mode, autoDeploy, repository, ref}) {
  if (repository !== 'nedkoradev/kitchen-calculator') return false;
  if (ref !== 'refs/heads/main') return false;
  if (mode === 'rollback') return false;
  if (eventName === 'workflow_dispatch') return true;
  if (eventName === 'push') return autoDeploy === '1';
  return false;
}

function candidateShouldRun({eventName, mode, checksResult, repository, ref}) {
  if (repository !== 'nedkoradev/kitchen-calculator') return false;
  if (ref !== 'refs/heads/main') return false;
  if (checksResult === 'success') return mode !== 'rollback';
  return eventName === 'workflow_dispatch' &&
    checksResult === 'skipped' &&
    mode === 'rollback';
}

test('public delivery workflow separates push automation from manual dispatch', () => {
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event_name == 'push' && vars\.NEDIQ_V3_AUTO_DEPLOY == '1'/);
  assert.doesNotMatch(
    workflow,
    /\(github\.event_name == 'push' \|\| inputs\.mode == 'production'\)[\s\S]*?NEDIQ_V3_AUTO_DEPLOY/
  );
});

test('manual production dispatch executes checks and candidate without auto deploy', () => {
  const context = {
    eventName: 'workflow_dispatch',
    mode: 'production',
    autoDeploy: '0',
    repository: 'nedkoradev/kitchen-calculator',
    ref: 'refs/heads/main'
  };
  assert.equal(checksShouldRun(context), true);
  assert.equal(candidateShouldRun({...context, checksResult: 'success'}), true);
});

test('all public delivery event and mode combinations', () => {
  const modes = ['image-only', 'candidate', 'production-probe', 'production', 'rollback'];
  const repositories = ['nedkoradev/kitchen-calculator', 'other/repository'];
  const refs = ['refs/heads/main', 'refs/heads/feature'];
  const autoValues = ['0', '1', undefined];

  for (const eventName of ['push', 'workflow_dispatch', 'pull_request']) {
    for (const mode of modes) {
      for (const autoDeploy of autoValues) {
        for (const repository of repositories) {
          for (const ref of refs) {
            const context = {eventName, mode, autoDeploy, repository, ref};
            let expected = false;
            if (repository === 'nedkoradev/kitchen-calculator' &&
                ref === 'refs/heads/main' &&
                mode !== 'rollback') {
              if (eventName === 'workflow_dispatch') expected = true;
              if (eventName === 'push' && autoDeploy === '1') expected = true;
            }
            assert.equal(checksShouldRun(context), expected, JSON.stringify(context));
          }
        }
      }
    }
  }
});

test('candidate job preserves branch, repository, environment and exact SHA guards', () => {
  assert.match(workflow, /needs:\s+checks/);
  assert.match(workflow, /needs\.checks\.result == 'success'/);
  assert.match(workflow, /environment:\s+public-v3/);
  assert.match(workflow, /ref:\s+\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(workflow, /github\.repository == 'nedkoradev\/kitchen-calculator'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
});

test('rollback remains dispatch-only and does not require checks success', () => {
  const common = {
    eventName: 'workflow_dispatch',
    mode: 'rollback',
    repository: 'nedkoradev/kitchen-calculator',
    ref: 'refs/heads/main'
  };
  assert.equal(checksShouldRun(common), false);
  assert.equal(candidateShouldRun({...common, checksResult: 'skipped'}), true);
  assert.equal(candidateShouldRun({...common, checksResult: 'success'}), false);
  assert.equal(candidateShouldRun({...common, checksResult: 'failure'}), false);
  assert.equal(candidateShouldRun({...common, ref: 'refs/heads/feature', checksResult: 'skipped'}), false);
});

test('rollback requires a valid exact revision and reports empty or malformed values', () => {
  assert.equal(validateRollbackRevision('nediq-v3-public-00004-fixture'), 'nediq-v3-public-00004-fixture');
  for (const value of [undefined, '', '   ']) {
    assert.throws(() => validateRollbackRevision(value), /requires rollback_revision/);
  }
  for (const value of [
    'nediq-v3-public-',
    'nediq-v3-public-foo--bar',
    'NEDIQ-v3-public-revision',
    'nediq-v3-public-revision;echo unsafe',
    'some-other-service-revision'
  ]) {
    assert.throws(() => validateRollbackRevision(value), /Invalid rollback_revision/);
  }
});

test('rollback validation is dispatched only for rollback and does not block production', () => {
  assert.match(workflow, /name: Validate rollback revision\s+if: env\.MODE == 'rollback'\s+run: node scripts\/validate-public-rollback\.mjs/);
  assert.ok(workflow.indexOf('name: Validate rollback revision') < workflow.indexOf('uses: google-github-actions/auth@'));
  assert.match(productionScript, /if \[\[ "\$\{MODE:-\}" == rollback \]\]; then\s+node scripts\/validate-public-rollback\.mjs\s+fi/);
  const production = {
    eventName: 'workflow_dispatch',
    mode: 'production',
    autoDeploy: '0',
    repository: 'nedkoradev/kitchen-calculator',
    ref: 'refs/heads/main'
  };
  assert.equal(checksShouldRun(production), true);
  assert.equal(candidateShouldRun({...production, checksResult: 'success'}), true);
});

test('push candidate requires auto deploy and manual probe, production, and candidate stay approved', () => {
  for (const mode of ['production-probe', 'production', 'candidate', 'image-only']) {
    const manual = {
      eventName: 'workflow_dispatch',
      mode,
      repository: 'nedkoradev/kitchen-calculator',
      ref: 'refs/heads/main'
    };
    assert.equal(checksShouldRun(manual), true);
    assert.equal(candidateShouldRun({...manual, checksResult: 'success'}), true);
  }

  assert.equal(checksShouldRun({
    eventName: 'push',
    mode: undefined,
    autoDeploy: '1',
    repository: 'nedkoradev/kitchen-calculator',
    ref: 'refs/heads/main'
  }), true);
  assert.equal(checksShouldRun({
    eventName: 'push',
    mode: undefined,
    autoDeploy: '0',
    repository: 'nedkoradev/kitchen-calculator',
    ref: 'refs/heads/main'
  }), false);
});
