import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveWorkspaceCopy, dryRunWorkspaceMigration, rehearsalRollback} from '../release-candidate/migration.mjs';
import {fixtureDocuments} from './fixtures/workspace-real-editor.mjs';
import {documentToSnapshot} from '../workspace-ui/scene-adapter.mjs';

function legacy() {
  const [project, model] = fixtureDocuments();
  const scene = documentToSnapshot(project).snapshot;
  const cabinet = documentToSnapshot(model).snapshot;
  const part = scene.parts[0];
  const history = JSON.stringify({parts: [part.part], finishes: {[part.part.key]: part.finish},
    labels: {[part.part.key]: part.name}, allEdgeFlags: {[part.part.key]: false},
    groupSelections: [part.part.key], selected: part.part.key, partCounter: 101, assemblyId: 0,
    sheetUtilization: 80, singleMemberSelection: true, assemblyNames: scene.assemblyNames});
  return {ownerUid: 'fixture', folders: [{id: 'shelves', label: 'Рафтове', aliases: [], deleted: false, target: null}],
    projects: [{id: 'one', record: {schemaVersion: 1, revision: 4, name: 'Кухня', data: scene}}],
    cabinets: [{id: 'two', record: {name: 'Рафт', folderId: 'shelves', parts: cabinet.parts,
      assemblyNames: cabinet.assemblyNames, calculationSettings: {sheetUtilization: 80}}, catalog: cabinet.materials}],
    grants: {editor: 'editor', viewer: 'viewer'}, settings: {sheetUtilization: 80}, materials: scene.materials,
    drafts: [{scope: {ownerUid: 'fixture', actorUid: 'fixture'}, bundle: {schemaVersion: 1, owner: 'fixture',
      activeKind: 'project', updatedAt: 123, records: ['project', 'constructor'].map(kind => ({
        id: 'working-' + kind, kind, name: kind, snapshot: scene, session: {undo: [history], redo: [history]}, dirty: true,
      }))}}],
  };
}

test('dry run preserves both legacy histories and reports counts, prices, rights and exact rollback', async () => {
  const input = legacy();
  const backup = archiveWorkspaceCopy(input);
  const first = await dryRunWorkspaceMigration(backup);
  assert.equal(first.status, 'compatible', JSON.stringify(first.blockers));
  assert.deepEqual(first.counts, {projects: 1, cabinets: 1, converted: 2, drafts: 1, grants: 2});
  assert.deepEqual(first.candidates.grants, input.grants);
  assert.deepEqual(first.candidates.documents[0].comparison.parts.map(item => [item.cut.A, item.cut.B]), [[600, 400], [600, 400]]);
  assert.equal(first.candidates.documents[0].comparison.priceInputs.pdcMaterials[0].fullPrice, 35);
  for (const record of first.candidates.drafts[0].records) {
    assert.equal(record.undo[0].scene.parts[0].part.key, 'custom101');
    assert.equal(record.redo[0].editor.selected, 'custom101');
  }
  assert.deepEqual(first, await dryRunWorkspaceMigration(backup));
  first.candidates.documents[0].candidate.parts.length = 0;
  assert.deepEqual(rehearsalRollback(backup), input);
  assert.deepEqual(backup.data, input);
});

test('conflicting names, fields, historical indices and missing folder mappings block candidate exports', async () => {
  const input = legacy();
  input.cabinets[0].record.name = ' КУХНЯ ';
  input.projects.push({id: 'unsupported', record: {...input.projects[0].record, name: 'Друго',
    data: {...input.projects[0].record.data, unsupportedView: true}}});
  input.cabinets.push({id: 'bad-folder', record: {...input.cabinets[0].record, folderId: 'missing'}});
  const draft = input.drafts[0].bundle.records[0];
  const entry = JSON.parse(draft.session.undo[0]);
  entry.finishes.custom101.material = 99;
  draft.session.undo = [JSON.stringify(entry)];
  const report = await dryRunWorkspaceMigration(archiveWorkspaceCopy(input));
  assert.equal(report.status, 'blocked');
  assert.equal(report.candidates, null);
  assert.deepEqual(report.blockers.map(blocker => blocker.source),
    ['projects/unsupported', 'cabinets/bad-folder', 'library', 'drafts/fixture']);
});

test('transport classifies an unconfirmed write as unknown and keeps definitive server conflicts', async () => {
  const {createWorkspaceHttpClient} = await import('../release-candidate/client.mjs');
  const request = {scope: {ownerUid: 'test', actorUid: 'test'}};
  const client = createWorkspaceHttpClient({endpoint: '/test', getIdToken: () => 'token',
    fetch() { throw Error('interrupted response'); }});
  await assert.rejects(client.write(request), {code: 'unknown-outcome'});
  await assert.rejects(client.pending(request), {code: 'unavailable'});
  const conflict = createWorkspaceHttpClient({endpoint: '/test', getIdToken: () => 'token',
    fetch: () => Response.json({error: {code: 'revision-conflict'}})});
  await assert.rejects(conflict.write(request), {code: 'revision-conflict'});
});
