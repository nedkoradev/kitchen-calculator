import {createHash} from 'node:crypto';
import {identifier} from '../document-format/model.mjs';
import {defaultFolders} from '../library-folders.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';
import {archiveWorkspaceCopy, dryRunWorkspaceMigration} from '../release-candidate/migration.mjs';
import {projectId, databaseId} from './config.mjs';

export const digest = value => createHash('sha256').update(comparableJson(value)).digest('hex');
export const exportPlan = ownerUid => ({
  projectId, databaseId, ownerUid: identifier(ownerUid), operation: 'pilot-copy-read-only',
  collections: ['v2_projects', 'v2_cabinets', 'materials', 'access_grants'],
});

export async function exportPilotCopy(db, plan) {
  if (digest(plan) !== digest(exportPlan(plan.ownerUid))) throw new Error('Export scope mismatch');
  const owner = db.collection('users').doc(plan.ownerUid);
  // All queries are scoped to one owner's collections in the same consistent read-only snapshot.
  return db.runTransaction(async tx => {
    const read = name => tx.get(owner.collection(name).limit(501));
    const [projects, cabinets, materials, grants] = await Promise.all([
      read('v2_projects'), read('v2_cabinets'), read('materials'),
      tx.get(owner.collection('access_grants').count()),
    ]);
    if ([projects, cabinets, materials].some(result => result.size > 500)) throw new Error('Pilot export collection exceeds 500 records');
    const preferences = materials.docs.find(doc => doc.id === '_app_preferences')?.data() ?? {};
    const rows = result => result.docs.map(doc => ({id: doc.id, record: doc.data()}));
    return {
      ownerUid: plan.ownerUid, projects: rows(projects), cabinets: rows(cabinets), materials: rows(materials),
      folders: preferences.folders ?? defaultFolders(), settings: preferences,
      grants: {}, drafts: [],
      evidence: {sharedGrants: grants.data().count, draftReview: 'required'},
    };
  }, {readOnly: true});
}

export async function planPilotMigration(copy, {catalogs = {}, drafts, confirmNoDrafts = false} = {}) {
  const snapshot = structuredClone(copy);
  const {evidence, ...data} = snapshot;
  if (evidence?.sharedGrants !== 0) return {status: 'blocked', reason: 'Review shared access separately'};
  if (!Array.isArray(drafts) || (!drafts.length && confirmNoDrafts !== true)) {
    return {status: 'blocked', reason: 'Explicit local draft review required'};
  }
  data.drafts = structuredClone(drafts);
  for (const row of data.cabinets) {
    if (!row.record.materials && Object.hasOwn(catalogs, row.id)) row.catalog = catalogs[row.id];
  }
  const report = await dryRunWorkspaceMigration(archiveWorkspaceCopy(data));
  if (report.status !== 'compatible') return {status: 'blocked', report};
  const manifest = {ownerUid: data.ownerUid, copySha256: digest(copy), inputSha256: digest(data), targetSha256: digest(report.candidates), counts: report.counts};
  return {status: 'compatible', manifest, approvalSha256: digest(manifest), candidates: report.candidates};
}

export async function applyPilotMigration(db, result, approval) {
  if (result.status !== 'compatible' || approval !== result.approvalSha256 ||
      digest(result.manifest) !== approval || digest(result.candidates) !== result.manifest.targetSha256) {
    throw new Error('Migration requires its exact reviewed approval');
  }
  const owner = db.collection('workspace_v3').doc(identifier(result.manifest.ownerUid));
  const documents = owner.collection('documents');
  const names = owner.collection('names');
  const folders = owner.collection('settings').doc('folders');
  const receipt = owner.collection('settings').doc('pilot-import');
  const imports = result.candidates.documents.map(row => row.candidate);
  if (imports.length > 150 || Buffer.byteLength(comparableJson(imports)) > 7_000_000) {
    throw new Error('Pilot exceeds the single-transaction limit');
  }
  return db.runTransaction(async tx => {
    const previous = (await tx.get(receipt)).data();
    if (previous) {
      if (previous.approval !== approval) throw new Error('Another pilot import has already run');
      return {status: 'already-applied', count: previous.count};
    }
    const [existing, claims, manifest] = await Promise.all([
      tx.get(documents.limit(1)), tx.get(names.limit(1)), tx.get(folders),
    ]);
    if (!existing.empty || !claims.empty || manifest.exists) throw new Error('Pilot target is not empty');
    for (const document of imports) {
      tx.create(documents.doc(document.id), JSON.parse(JSON.stringify(document)));
      tx.create(names.doc(document.nameKey), {id: document.id});
    }
    tx.create(folders, {revision: 1, folders: result.candidates.folders});
    tx.create(receipt, {approval, count: imports.length});
    return {status: 'applied', count: imports.length};
  });
}
