import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const gh = process.env.GH_BIN || 'C:/Users/31308/AppData/Local/gh-cli/bin/gh.exe';
const repo = process.env.GITHUB_REPO || 'zdbpython/opensource-stack';
const branch = process.env.GITHUB_BRANCH || 'main';
const token = process.env.GITHUB_TOKEN || execFileSync(gh, ['auth', 'token'], { encoding: 'utf8' }).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'opensource-stack-deploy',
};

async function api(pathname, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status}: ${data.message || text.slice(0, 200)}`);
  return data;
}

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => !file.startsWith('dist/') && !file.startsWith('screenshots/') && !file.startsWith('data/') || file === 'data/db.json');
const tree = [];
for (const file of files) {
  const content = fs.readFileSync(file).toString('base64');
  const blob = await api(`/repos/${repo}/git/blobs`, 'POST', { content, encoding: 'base64' });
  tree.push({ path: file.replaceAll('\\', '/'), mode: '100644', type: 'blob', sha: blob.sha });
  process.stdout.write('.');
}
process.stdout.write('\n');

const current = await api(`/repos/${repo}/git/ref/heads/${branch}`);
const treeResult = await api(`/repos/${repo}/git/trees`, 'POST', { tree });
const commit = await api(`/repos/${repo}/git/commits`, 'POST', {
  message: 'design: modernize site with dark sci-fi archive theme',
  tree: treeResult.sha,
  parents: [current.object.sha],
  author: { name: 'Open Source Stack', email: 'deploy@345600.xyz', date: new Date().toISOString() },
  committer: { name: 'Open Source Stack', email: 'deploy@345600.xyz', date: new Date().toISOString() },
});
await api(`/repos/${repo}/git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: true });
console.log(`Pushed ${files.length} files to https://github.com/${repo} (${commit.sha.slice(0, 7)})`);
