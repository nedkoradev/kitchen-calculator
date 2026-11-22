import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const releasePath = 'release-candidate/release.mjs';
const versionLine = /^export const version = '(3\.(?:0|[1-9]\d*)\.)(0|[1-9]\d*)';\r?$/gm;

export function classifyReleaseChange({changes, baseMode, headMode, baseContent, headContent}) {
  if (changes !== `M\0${releasePath}\0` || baseMode !== '100644' || headMode !== '100644') {
    return {lowRisk: false, reason: 'Expected one regular release file modification'};
  }
  const before = [...baseContent.matchAll(versionLine)];
  const after = [...headContent.matchAll(versionLine)];
  if (before.length !== 1 || after.length !== 1 || before[0][1] !== after[0][1] ||
      BigInt(after[0][2]) !== BigInt(before[0][2]) + 1n) {
    return {lowRisk: false, reason: 'Expected a single v3 patch increment by one'};
  }
  const patchStart = before[0].index + "export const version = '".length + before[0][1].length;
  const expected = baseContent.slice(0, patchStart) + after[0][2] +
    baseContent.slice(patchStart + before[0][2].length);
  if (expected !== headContent) {
    return {lowRisk: false, reason: 'Release file contains another change'};
  }
  return {lowRisk: true, reason: 'Only the v3 patch version increased by one'};
}

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', maxBuffer: 10 * 1024 * 1024});
}

function readFileAt(repo, sha) {
  const entry = git(repo, 'ls-tree', '-z', sha, '--', releasePath);
  const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\trelease-candidate\/release\.mjs\0$/.exec(entry);
  if (!match) throw new Error('Release file missing or invalid');
  const bytes = execFileSync('git', ['-C', repo, 'cat-file', 'blob', match[2]], {maxBuffer: 10 * 1024 * 1024});
  const content = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error('Release file is not canonical UTF-8');
  return {mode: match[1], content};
}

export function classifyCommits(repo, base, head) {
  if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) {
    throw new Error('Base and head must be full lowercase commit SHAs');
  }
  for (const sha of [base, head]) {
    if (git(repo, 'cat-file', '-t', sha).trim() !== 'commit') throw new Error('SHA is not a commit');
  }
  git(repo, 'merge-base', '--is-ancestor', base, head);
  const changes = git(repo, 'diff', '--name-status', '-z', '--no-renames', '--no-ext-diff',
    '--no-textconv', '--ignore-submodules=none', base, head, '--');
  const before = readFileAt(repo, base);
  const after = readFileAt(repo, head);
  return classifyReleaseChange({changes, baseMode: before.mode, headMode: after.mode,
    baseContent: before.content, headContent: after.content});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 5) throw new Error('Usage: node classify.mjs REPOSITORY BASE_SHA HEAD_SHA');
    const result = classifyCommits(process.argv[2], process.argv[3], process.argv[4]);
    console.log(JSON.stringify(result));
    if (!result.lowRisk) process.exitCode = 1;
  } catch (error) {
    console.error(`Risk classification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
