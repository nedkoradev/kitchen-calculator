import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {composeRules} from '../rollout-preflight/composite-rules.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
try {
  const review = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const [baseline, proposal, approvedRules] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../tests/emulator/workspace-v3.rules', import.meta.url), 'utf8'),
    readFile(review.approvedRulesFile, 'utf8'),
  ]);
  const checks = {
    exactRulesBase: approvedRules === baseline,
    candidate: /^[0-9a-f]{40}$/.test(review.commit ?? '') && review.testedCommit === review.commit,
    rollback: /^[0-9a-f]{40}$/.test(review.fallbackCommit ?? '') && review.rollbackRehearsed === true,
    encryptedBackup: /^[0-9a-f]{64}$/.test(review.backupSha256 ?? '') && review.backupVerified === true,
    migration: /^[0-9a-f]{64}$/.test(review.migrationSha256 ?? '') && review.unresolvedBlockers === 0,
    identity: review.googleUidVerifiedPrivately === true,
    infrastructure: review.iamAndBudgetReviewed === true && review.originReviewed === true,
  };
  const ready = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({status: ready ? 'review-ready' : 'no-go', checks,
    ...(checks.exactRulesBase ? {rulesSha256: sha(composeRules(baseline, proposal))} : {})}));
  if (!ready) process.exitCode = 1;
} catch {
  process.stderr.write('Preflight stopped: private review input is incomplete.\n');
  process.exitCode = 1;
}
