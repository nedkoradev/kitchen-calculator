import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReleaseChange, classifyCommits} from '../risk-gate-prototype/classify.mjs';
import {validatePullRequest} from '../risk-gate-prototype/github-dry-run.mjs';

const source = "export const version = '3.0.2';\nexport const probeHost = 'example';\n";
const sample = {
  changes: 'M\0release-candidate/release.mjs\0',
  baseMode: '100644', headMode: '100644',
  baseContent: source, headContent: source.replace('3.0.2', '3.0.3')
};

test('only an exact single v3 patch increment is low risk', () => {
  assert.equal(classifyReleaseChange(sample).lowRisk, true);
  for (const patch of [
    {changes: `${sample.changes}M\0.github/workflows/deploy.yml\0`},
    {changes: 'A\0release-candidate/release.mjs\0'},
    {headMode: '100755'},
    {headMode: '120000'},
    {headContent: source},
    {headContent: source.replace('3.0.2', '3.0.4')},
    {headContent: source.replace('3.0.2', '3.1.3')},
    {headContent: source.replace('3.0.2', '3.0.03')},
    {headContent: sample.headContent + 'dangerous();\n'},
    {headContent: sample.headContent.replace('example', 'elsewhere')},
    {baseContent: source + "export const version = '3.0.2';\n"},
    {headContent: sample.headContent.replace('\n', '\r\n')}
  ]) {
    assert.equal(classifyReleaseChange({...sample, ...patch}).lowRisk, false, JSON.stringify(patch));
  }
});

test('invalid commit identifiers are rejected before invoking git', () => {
  assert.throws(() => classifyCommits('.', 'main', 'HEAD'), /full lowercase commit SHAs/);
});

test('PR metadata must match the current main and trusted repository', () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40);
  const pr = {state: 'open', draft: false, base: {ref: 'main', sha: base, repo: {id: 1404199718}},
    head: {sha: head, repo: {id: 1404199718}}};
  assert.deepEqual(validatePullRequest(pr, base), {base, head});
  for (const invalid of [
    {...pr, draft: true}, {...pr, state: 'closed'},
    {...pr, base: {...pr.base, ref: 'other'}},
    {...pr, base: {...pr.base, repo: {id: 1}}},
    {...pr, head: {...pr.head, repo: null}},
    {...pr, head: {...pr.head, sha: 'HEAD'}}
  ]) assert.throws(() => validatePullRequest(invalid, base));
  assert.throws(() => validatePullRequest(pr, 'c'.repeat(40)));
});
