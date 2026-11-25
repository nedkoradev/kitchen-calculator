import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {composeRules, start, end} from '../rollout-preflight/composite-rules.mjs';
import {protectCopy, verifyCopy, writeNewLocalFile} from '../rollout-preflight/archive.mjs';
import {buildLocalPreview, sheetJsPath} from '../rollout-preflight/staging-html.mjs';

const repositoryFile = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('composite rules retain the exact legacy rules and reject changes at the insertion boundary', async () => {
  const legacy = await repositoryFile('firestore.rules');
  const proposed = await repositoryFile('tests/emulator/workspace-v3.rules');
  const candidate = composeRules(legacy, proposed);
  assert.match(candidate, /match \/workspace_v3\/\{owner\}/);
  const prefix = candidate.indexOf(start);
  const suffix = candidate.indexOf(end) + end.length + 1;
  assert.equal(candidate.slice(0, prefix) + candidate.slice(suffix), legacy);
  assert.throws(() => composeRules(legacy, proposed.replace('match /workspace_v3/', 'match /users/')));
  assert.throws(() => composeRules(candidate, proposed));
});

test('authenticated encryption validates SHA-256 and rejects different passphrases or modified ciphertext', () => {
  const json = Buffer.from('{"ownerUid":"fixture","projects":[{"marker":"fixture-private"}],"cabinets":[],"folders":[],"drafts":[]}\n');
  const passphrase = Buffer.from('synthetic passphrase only for this unit test');
  const encrypted = protectCopy(json, passphrase);
  assert.doesNotMatch(encrypted.toString(), /fixture-private|ownerUid/);
  const verified = verifyCopy(encrypted, passphrase);
  assert.deepEqual(verified.bytes, json);
  assert.equal(verified.manifest.source.sha256, createHash('sha256').update(json).digest('hex'));
  assert.equal(verified.manifest.counts.projects, 1);
  assert.throws(() => verifyCopy(encrypted, Buffer.from('different synthetic passphrase for this test')));
  const broken = JSON.parse(encrypted);
  const ciphertext = Buffer.from(broken.ciphertext, 'base64');
  ciphertext[0] ^= 1;
  broken.ciphertext = ciphertext.toString('base64');
  assert.throws(() => verifyCopy(Buffer.from(JSON.stringify(broken)), passphrase));
});

test('local output does not overwrite an existing backup', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'ned-iq-backup-test-'));
  try {
    const file = join(scratch, 'pilot.enc');
    await writeNewLocalFile(file, Buffer.from('original'));
    await assert.rejects(writeNewLocalFile(file, Buffer.from('replacement')), {code: 'EEXIST'});
    assert.equal(await readFile(file, 'utf8'), 'original');
  } finally { await rm(scratch, {recursive: true, force: true}); }
});

test('v3 material supplier links are safe external HTTP(S) URLs', async () => {
  const {materialSupplierLink} = await import('../release-candidate/material-editor.mjs');
  assert.equal(materialSupplierLink('https://supplier.example.test/decor'), 'https://supplier.example.test/decor');
  assert.equal(materialSupplierLink('http://supplier.example.test/decor'), 'http://supplier.example.test/decor');
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,hi', '/relative/path',
    'https://user:secret@supplier.example.test/product', '', null]) {
    assert.equal(materialSupplierLink(unsafe), null);
  }
});

test('legacy v2 Pages publishes independently of v3 and rejects an attached custom domain', async () => {
  const workflow = await repositoryFile('.github/workflows/pages.yml');
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.doesNotMatch(workflow, /if:\s*github\.event_name == 'workflow_dispatch' \|\| vars\.NEDIQ_V3_AUTO_DEPLOY/);
  assert.match(workflow, /site\.data\.build_type !== 'workflow'/);
  assert.match(workflow, /site\.data\.cname/);
  assert.match(workflow, /Remove the Custom domain/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

test('staging preview contains no legacy cloud entrypoint, reset or worker even when disabled', async () => {
  const source = await repositoryFile('index.html');
  const {major, minor} = JSON.parse(await repositoryFile('_data/version.json'));
  const preview = buildLocalPreview(source);
  const activated = buildLocalPreview(source, {enabled: true, authOrigin: 'http://127.0.0.1:9100'});
  assert.doesNotMatch(preview, /staging-auth\.mjs/);
  assert.match(activated, /staging-auth\.mjs/);
  assert.match(source, /xlsx@0\.18\.5/);
  assert.match(preview, /xlsx@0\.18\.5/);
  assert.doesNotMatch(activated, /xlsx@0\.18\.5/);
  assert.ok(activated.includes('<script src="' + sheetJsPath + '"></script>'));
  for (const html of [preview, activated]) {
    assert.doesNotMatch(html, /src="\.\/(cloud\.js|local-reset\.js|app-release\.js)"/);
    assert.ok(html.includes('<span id="appVersion">v' + major + '.' + minor + '</span>'));
  }
  assert.throws(() => buildLocalPreview(source, {enabled: true, authOrigin: 'https://example.invalid'}));
  assert.throws(() => buildLocalPreview(source.replace('}build();frame();', ''), {enabled: true, authOrigin: 'http://127.0.0.1:9100'}));
});
