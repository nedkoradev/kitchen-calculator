import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceDraftAdapter, inspectLegacyDraft} from '../workspace-persistence/drafts.mjs';
import {createWorkspaceController} from '../workspace-context/editor-controller.mjs';
import {prepareNewDocument} from '../workspace-context/context.mjs';

const scope = {ownerUid: 'owner', actorUid: 'editor'};
const selectedPart = {part: {key: 'one', x: 0, y: 9, z: 0, w: 100, h: 18, d: 200}};
const legacy = () => ({
  schemaVersion: 1, owner: JSON.stringify(['editor', 'owner']), updatedAt: 1,
  records: ['project', 'constructor'].map(kind => ({
    kind, id: 'working-' + kind, name: kind, dirty: true,
    snapshot: {room: prepareNewDocument().room, materials: prepareNewDocument().materials, parts: [selectedPart]},
  })),
});

test('dry run reports both modes and never mutates the legacy input', async () => {
  const input = structuredClone(legacy());
  const before = structuredClone(input);
  const report = await inspectLegacyDraft(input, scope);
  assert.equal(report.status, 'snapshot-compatible');
  assert.deepEqual(report.records.map(item => item.candidate.type), ['project', 'model']);
  assert.deepEqual(report.records.map(item => item.candidate.parts), [[selectedPart], [selectedPart]]);
  report.records[0].candidate.parts.length = 0;
  assert.deepEqual(input, before);
  assert.equal((await inspectLegacyDraft(input, {...scope, actorUid: 'other'})).status, 'incompatible');
  input.records[1].snapshot.parts[0].finish = {material: 42};
  const partial = await inspectLegacyDraft(input, scope);
  assert.equal(partial.status, 'review-required');
  assert.equal(partial.records[1].status, 'incompatible');
});

test('profile isolation, corrupted envelope and quota errors preserve existing bytes and history', async () => {
  const rows = new Map();
  let denied = false;
  const drafts = createWorkspaceDraftAdapter({getItem: key => rows.get(key), setItem(key, value) {
    if (denied) throw new Error('QuotaExceededError');
    rows.set(key, value);
  }});
  const context = createWorkspaceController({scope, drafts});
  await context.editScene({settings: {sheetUtilization: 60}});
  const [key, first] = [...rows.entries()][0];
  const different = createWorkspaceController({scope: {...scope, actorUid: 'other'}, drafts});
  assert.equal(different.state.draftStatus, 'empty');
  denied = true;
  await context.editScene({settings: {sheetUtilization: 70}});
  assert.equal(context.state.draftStatus, 'write-error');
  assert.equal(context.state.canUndo, true);
  assert.equal(rows.get(key), first);
  denied = false;
  rows.set(key, '{bad JSON');
  const fallback = createWorkspaceController({scope, drafts});
  assert.equal(fallback.state.draftStatus, 'read-error');
  await fallback.editScene({settings: {sheetUtilization: 70}});
  assert.equal(rows.get(key), '{bad JSON');
});
