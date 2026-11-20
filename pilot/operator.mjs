import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {protectCopy, readLocalFile, verifyCopy, writeNewLocalFile} from '../rollout-preflight/archive.mjs';
import {applyPilotMigration, digest, exportPlan, exportPilotCopy, planPilotMigration} from './migration.mjs';
import {databaseId, projectId} from './config.mjs';

const [mode, path, output] = process.argv.slice(2);
let secret;
let decrypted;
function passphrase() {
  const bytes = readFileSync(3);
  let end = bytes.length;
  while (end && (bytes[end - 1] === 10 || bytes[end - 1] === 13)) end--;
  return bytes.subarray(0, end);
}
try {
  if (!['plan-export', 'execute-export', 'dry-run', 'execute-migration'].includes(mode) || !path) throw new Error('Invalid operator mode');
  const input = JSON.parse(await readFile(path, 'utf8'));
  if (mode === 'plan-export') {
    const plan = exportPlan(input.ownerUid);
    if (!output) throw new Error('Private plan path required');
    await writeNewLocalFile(output, Buffer.from(JSON.stringify(plan)));
    console.log(JSON.stringify({mode, approvalSha256: digest(plan)}));
  } else if (mode === 'execute-export') {
    const plan = exportPlan(input.ownerUid);
    if (!output || digest(plan) !== digest(input) || process.env.NEDIQ_APPROVED_EXPORT_SHA256 !== digest(plan) ||
        process.env.GOOGLE_CLOUD_PROJECT !== projectId || process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('Export approval and project scope are required');
    }
    secret = passphrase();
    // Validate the encryption input before initializing production credentials.
    if (secret.length < 20) throw new Error('Weak archive passphrase');
    const {initializeApp} = await import('firebase-admin/app');
    const {getFirestore} = await import('firebase-admin/firestore');
    const copy = await exportPilotCopy(getFirestore(initializeApp({projectId}), databaseId), plan);
    decrypted = Buffer.from(JSON.stringify(copy));
    await writeNewLocalFile(output, protectCopy(decrypted, secret));
    console.log('Encrypted pilot copy created');
  } else {
    secret = passphrase();
    const {bytes} = verifyCopy(await readLocalFile(input.archive, 90 * 1024 * 1024), secret);
    decrypted = bytes;
    const report = await planPilotMigration(JSON.parse(bytes), input.review);
    if (mode === 'execute-migration') {
      if (report.status !== 'compatible' || process.env.NEDIQ_APPROVED_MIGRATION_SHA256 !== report.approvalSha256 ||
          process.env.GOOGLE_CLOUD_PROJECT !== projectId || process.env.FIRESTORE_EMULATOR_HOST) {
        throw new Error('Explicit production migration approval is required');
      }
      const {initializeApp} = await import('firebase-admin/app');
      const {getFirestore} = await import('firebase-admin/firestore');
      console.log(JSON.stringify(await applyPilotMigration(getFirestore(initializeApp({projectId}), databaseId),
        report, process.env.NEDIQ_APPROVED_MIGRATION_SHA256)));
    } else {
      const result = report.status === 'compatible'
        ? {status: report.status, counts: report.manifest.counts, approvalSha256: report.approvalSha256}
        : {status: 'blocked', count: report.report?.blockers.length ?? 1};
      console.log(JSON.stringify(result));
      if (report.status !== 'compatible') {
        if (output) {
          const privateReport = {ownerUid: JSON.parse(bytes).ownerUid, projects: [], cabinets: [], folders: [], drafts: [],
            diagnostics: report.report?.blockers ?? [{message: report.reason}]};
          await writeNewLocalFile(output, protectCopy(Buffer.from(JSON.stringify(privateReport)), secret));
        }
        process.exitCode = 1;
      }
    }
  }
} catch {
  process.stderr.write('Pilot operator stopped. Verify the local inputs and approved scope.\n');
  process.exitCode = 1;
} finally { secret?.fill(0); decrypted?.fill(0); }
