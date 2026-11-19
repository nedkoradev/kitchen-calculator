import {readFile} from 'node:fs/promises';
import {archiveWorkspaceCopy, dryRunWorkspaceMigration} from './migration.mjs';

const filename = process.argv[2];
if (!filename) throw new Error('Pass a path to a local JSON copy');
const archive = archiveWorkspaceCopy(JSON.parse(await readFile(filename, 'utf8')));
const report = await dryRunWorkspaceMigration(archive);
// Print only aggregate checks and blockers. Candidate scenes are kept off stdout.
console.log(JSON.stringify({status: report.status, counts: report.counts, blockers: report.blockers}, null, 2));
if (report.status === 'blocked') process.exitCode = 1;
