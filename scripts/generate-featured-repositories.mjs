import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const USER = process.env.GITHUB_USER || 'Benfic4rthur';
const TOKEN = process.env.PROFILE_REPO_TOKEN?.trim();
const SVG_PATH = 'assets/profile-header-v7.svg';
const README_PATH = 'README.md';
const START = '<!-- FEATURED_REPOS_START -->';
const END = '<!-- FEATURED_REPOS_END -->';

if (!TOKEN) {
  console.log('PROFILE_REPO_TOKEN is not configured. Keeping the current repository cards unchanged.');
  process.exit(0);
}

const response = await fetch(
  'https://api.github.com/user/repos?visibility=all&affiliation=owner&sort=pushed&direction=desc&per_page=100',
  {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + TOKEN,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER + '-profile-card'
    }
  }
);

if (!response.ok) {
  throw new Error('GitHub API returned ' + response.status + ': ' + await response.text());
}

const repos = (await response.json())
  .filter((repo) =>
    repo.owner?.login?.toLowerCase() === USER.toLowerCase() &&
    !repo.archived &&
    !repo.fork &&
    repo.name.toLowerCase() !== USER.toLowerCase()
  )
  .sort((a, b) => new Date(b.pushed_at || 0) - new Date(a.pushed_at || 0))
  .slice(0, 5);

if (repos.length === 0) {
  throw new Error('No eligible repositories returned by GitHub.');
}

const colors = ['#39d353', '#58a6ff', '#a371f7', '#f0883e', '#79c0ff'];

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function truncate(value, max) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function tagFor(repo) {
  const name = repo.name.toLowerCase();
  if (name.includes('release')) return 'RELEASES';
  if (name.includes('admin')) return 'ADMIN';
  if (name.includes('site') || name.includes('web')) return 'WEB';
  if (name.includes('license') || name.includes('server') || name.includes('api')) return 'BACKEND';
  if (!name.includes('-')) return 'CORE APP';
  return truncate((repo.language || 'ACTIVE').toUpperCase(), 12);
}

function detailFor(repo) {
  if (repo.description?.trim()) {
    return truncate(repo.description.toUpperCase(), 43);
  }

  const name = repo.name.toLowerCase();
  if (name.includes('release')) return 'BUILDS · DOWNLOADS · DISTRIBUTION';
  if (name.includes('admin')) return 'ADMIN · OPERATIONS · RECENTLY ACTIVE';
  if (name.includes('site') || name.includes('web')) return 'PRODUCT SITE · RECENTLY ACTIVE';
  if (name.includes('license') || name.includes('server') || name.includes('api')) return 'BACKEND · SERVICES · RECENTLY ACTIVE';

  return truncate(
    ((repo.language ? repo.language.toUpperCase() + ' · ' : '') + 'RECENTLY ACTIVE'),
    43
  );
}

function card(repo, index) {
  const color = colors[index % colors.length];
  const delay = index === 0 ? '0s' : '-' + (index * 3) + 's';
  const name = escapeXml(truncate(repo.name, 28));
  const tag = escapeXml(tagFor(repo));
  const detail = escapeXml(detailFor(repo));

  return [
    '      <g transform="translate(14 140)">',
    '        <animateTransform attributeName="transform" type="translate"',
    '          values="14 140;14 140;14 38;14 38;14 -68;14 -68"',
    '          keyTimes="0;.05;.12;.27;.34;1" dur="15s" begin="' + delay + '" repeatCount="indefinite"/>',
    '        <animate attributeName="opacity"',
    '          values="0;0;1;1;0;0"',
    '          keyTimes="0;.05;.12;.27;.34;1" dur="15s" begin="' + delay + '" repeatCount="indefinite"/>',
    '        <rect width="302" height="58" rx="11" fill="#161b22" stroke="' + color + '" stroke-opacity=".58"/>',
    '        <circle cx="18" cy="19" r="4" fill="' + color + '"/>',
    '        <text x="31" y="23" fill="#f0f6fc" font-size="14" font-family="-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif" font-weight="800">' + name + '</text>',
    '        <text x="286" y="21" text-anchor="end" fill="' + color + '" font-size="8" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-weight="700">' + tag + '</text>',
    '        <text x="18" y="44" fill="#8b949e" font-size="9" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">' + detail + '</text>',
    '      </g>'
  ].join('\n');
}

const generated = repos.map(card).join('\n\n');
const svg = await readFile(SVG_PATH, 'utf8');

if (!svg.includes(START) || !svg.includes(END)) {
  throw new Error('Featured repository markers were not found in ' + SVG_PATH);
}

const before = svg.slice(0, svg.indexOf(START) + START.length);
const after = svg.slice(svg.indexOf(END));
const nextSvg = before + '\n' + generated + '\n      ' + after;

const hash = createHash('sha1').update(generated).digest('hex').slice(0, 12);
const readme = await readFile(README_PATH, 'utf8');
const nextReadme = readme.replace(
  /profile-header-v7\.svg(?:\?v=[^"' )]+)?/g,
  'profile-header-v7.svg?v=' + hash
);

if (nextSvg !== svg) {
  await writeFile(SVG_PATH, nextSvg);
  console.log('Updated featured repositories: ' + repos.map((repo) => repo.name).join(', '));
} else {
  console.log('Featured repository cards are already current.');
}

if (nextReadme !== readme) {
  await writeFile(README_PATH, nextReadme);
  console.log('Updated README cache key to ' + hash + '.');
}
