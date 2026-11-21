import {execFileSync} from 'node:child_process';
import {version} from '../release-candidate/release.mjs';

const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Expected the exact comparison commit SHA');
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'});
git('cat-file', '-e', base + '^{commit}');
const path = 'release-candidate/release.mjs';
const files = git('diff', '--name-only', '-z', '--no-renames', base, 'HEAD').split('\0');
const runtime = /^(?:(?:release-candidate|rollout-preflight|pilot|workspace-(?:context|persistence|ui)|document-format|assets|materials)\/|Dockerfile$|\.dockerignore$|package(?:-lock)?\.json$)/;
const legacyOnly = new Set(['cloud.js', 'sw.js', 'release.json', 'app-release.js', 'local-reset.js']);
const changed = files.filter(file => runtime.test(file) ||
  (!file.includes('/') && /\.(?:css|m?js|html)$/.test(file) && !legacyOnly.has(file)));
if (changed.length) {
  const source = git('ls-tree', base, '--', path) ? git('show', base + ':' + path) :
    "export const version = '3.0.0';";
  const previous = source.match(/^export const version = '([^']+)';$/m)?.[1];
  const parse = value => {
    if (!/^3\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value ?? '')) throw new Error('Invalid v3 version');
    return value.split('.').map(BigInt);
  };
  const actual = parse(version), prior = parse(previous);
  if (!(actual[1] > prior[1] || (actual[1] === prior[1] && actual[2] > prior[2]))) {
    throw new Error('v3 runtime changed (' + changed.join(', ') + '); increase v' + previous + ' in ' + path);
  }
  console.log('v3 runtime version: ' + previous + ' → ' + version);
} else {
  console.log('No v3 runtime changes');
}
