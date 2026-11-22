import {pathToFileURL} from 'node:url';
import {classifyCommits} from './classify.mjs';

const api = 'https://api.github.com/repos/nedkoradev/kitchen-calculator';
const repositoryId = 1404199718;

export function validatePullRequest(pr, mainSha) {
  if (pr.state !== 'open' || pr.draft !== false || pr.base?.ref !== 'main' ||
      pr.base?.repo?.id !== repositoryId || pr.head?.repo?.id !== repositoryId ||
      !/^[a-f0-9]{40}$/.test(pr.base?.sha ?? '') ||
      !/^[a-f0-9]{40}$/.test(pr.head?.sha ?? '') || pr.base.sha !== mainSha) {
    throw new Error('PR is not an open, ready, same-repository PR against the current main');
  }
  return {base: pr.base.sha, head: pr.head.sha};
}

async function get(path) {
  const response = await fetch(api + path, {headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'nediq-risk-gate-dry-run',
    'X-GitHub-Api-Version': '2022-11-28'
  }, signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`);
  return response.json();
}

async function snapshot(number) {
  const pr = await get(`/pulls/${number}`);
  const main = await get('/branches/main');
  return validatePullRequest(pr, main.commit?.sha);
}

async function main() {
  const [repo, number] = process.argv.slice(2);
  if (process.argv.length !== 4 || !/^[1-9]\d{0,7}$/.test(number ?? '')) {
    throw new Error('Usage: node github-dry-run.mjs REPOSITORY PR_NUMBER');
  }
  const first = await snapshot(number);
  const result = classifyCommits(repo, first.base, first.head);
  const last = await snapshot(number);
  if (first.base !== last.base || first.head !== last.head) throw new Error('PR or main changed during classification');
  console.log(JSON.stringify({pr: Number(number), ...first, ...result}));
  if (!result.lowRisk) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Risk dry run failed: ${error.message}`);
    process.exitCode = 1;
  });
}
