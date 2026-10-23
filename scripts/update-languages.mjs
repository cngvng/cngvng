import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(resolve(root, 'profile.config.json'), 'utf8'));
const env = { ...process.env };
if (env.GH_STATS_TOKEN) env.GH_TOKEN = env.GH_STATS_TOKEN;

async function api(path, paginate = false) {
  const args = ['api', path];
  if (paginate) args.push('--paginate', '--slurp');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await run('gh', args, { env, maxBuffer: 24 * 1024 * 1024 });
      const data = JSON.parse(stdout);
      return paginate ? data.flat() : data;
    } catch (error) {
      if (attempt === 2 || !/HTTP 50[0234]|ETIMEDOUT|ECONNRESET/.test(error.message)) {
        // Never print the child environment or a private repository URL.
        throw new Error(`GitHub API request failed. No cards were updated. Check authentication, permissions, and API rate limits.`, { cause: undefined });
      }
      await new Promise(done => setTimeout(done, 1000 * (attempt + 1)));
    }
  }
}

async function mapLimit(items, fn, limit = 4) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await fn(items[index]);
    }
  }));
  return output;
}

const exclude = new Set(config.excludeRepositories.map(name => name.toLowerCase()));
function eligible(repo) {
  return (!repo.private || config.includePrivate)
    && (!repo.fork || !config.excludeForks)
    && !repo.disabled
    && !exclude.has(repo.full_name.toLowerCase());
}

async function collect() {
  const personalPath = config.includePrivate
    ? 'user/repos?affiliation=owner&per_page=100'
    : `users/${config.username}/repos?type=owner&per_page=100`;
  const personal = (await api(personalPath, true))
    .filter(repo => repo.owner.login.toLowerCase() === config.username.toLowerCase());
  const organizations = [...new Set(config.organizations)];
  const orgLists = await mapLimit(organizations, org => api(
    `orgs/${org}/repos?type=${config.includePrivate ? 'all' : 'public'}&per_page=100`, true));
  const unique = new Map([...personal, ...orgLists.flat()].filter(eligible).map(repo => [repo.id, repo]));
  const rows = await mapLimit([...unique.values()], async repo => ({
    repository: repo.full_name,
    private: repo.private,
    group: repo.owner.login.toLowerCase() === config.username.toLowerCase() ? 'personal' : 'organizations',
    languages: await api(`repos/${repo.full_name}/languages`),
  }));
  const groups = {};
  for (const group of ['personal', 'organizations']) {
    const subset = rows.filter(row => row.group === group);
    const languages = {};
    for (const row of subset) {
      for (const [name, bytes] of Object.entries(row.languages)) {
        languages[name] = (languages[name] ?? 0) + bytes;
      }
    }
    groups[group] = {
      repositoryCount: subset.length,
      repositoriesWithDetectedLanguages: subset.filter(row => Object.keys(row.languages).length).length,
      languages: Object.fromEntries(Object.entries(languages).sort((a, b) => b[1] - a[1])),
    };
  }
  return {
    updated: new Date().toISOString().slice(0, 10),
    metric: 'GitHub Linguist source bytes on default branches; not personal authorship or proficiency',
    scope: { username: config.username, organizations, includePrivate: config.includePrivate,
      excludeForks: config.excludeForks, excludeRepositories: config.excludeRepositories },
    groups,
    // Private names and per-repository private breakdowns must never be published.
    repositories: rows.filter(row => !row.private).sort((a, b) => a.repository.localeCompare(b.repository)),
    privateRepositoryCount: rows.filter(row => row.private).length,
  };
}

const colors = { Python: '#60a5fa', 'Jupyter Notebook': '#f59e0b', TypeScript: '#a78bfa',
  JavaScript: '#facc15', HTML: '#fb7185', CSS: '#c084fc', Shell: '#2dd4bf',
  Dart: '#38bdf8', 'C++': '#f472b6', CMake: '#a3e635', Other: '#94a3b8' };
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

function panel(group, x, title, subtitle, theme) {
  const { languages, repositoryCount } = group;
  const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
  const entries = Object.entries(languages);
  const visible = entries.slice(0, config.maxLanguages);
  const remainder = entries.slice(config.maxLanguages).reduce((sum, [, bytes]) => sum + bytes, 0);
  if (remainder) visible.push(['Other', remainder]);
  const ink = theme === 'dark' ? '#e2e8f0' : '#0f172a';
  const muted = theme === 'dark' ? '#94a3b8' : '#475569';
  let offset = 0;
  const bars = visible.map(([name, bytes]) => {
    const width = total ? bytes / total * 380 : 0;
    const rect = `<rect x="${x + offset}" y="131" width="${width}" height="8" fill="${colors[name] ?? '#818cf8'}"/>`;
    offset += width;
    return rect;
  }).join('');
  const legend = visible.map(([name, bytes], i) => {
    const column = i % 2;
    const lx = x + column * 200;
    const ly = 168 + Math.floor(i / 2) * 33;
    const percentage = total ? bytes / total * 100 : 0;
    const label = percentage > 0 && percentage < 0.1 ? '&lt;0.1' : percentage.toFixed(1);
    return `<circle cx="${lx + 4}" cy="${ly - 4}" r="4" fill="${colors[name] ?? '#818cf8'}"/><text x="${lx + 16}" y="${ly}" fill="${ink}" font-size="12">${xml(name)}</text><text x="${lx + 181}" y="${ly}" text-anchor="end" fill="${muted}" font-size="12">${label}%</text>`;
  }).join('');
  return `<text x="${x}" y="84" fill="${ink}" font-size="19" font-weight="650">${title}</text><text x="${x}" y="110" fill="${muted}" font-size="12">${repositoryCount} repositories · ${subtitle}</text>${bars}${legend}${!total ? `<text x="${x}" y="169" fill="${muted}" font-size="13">No detected source languages.</text>` : ''}`;
}

function render(data, theme, mobile = false) {
  const bg = theme === 'dark' ? '#0f172a' : '#f8fafc';
  const stroke = theme === 'dark' ? '#334155' : '#cbd5e1';
  const muted = theme === 'dark' ? '#94a3b8' : '#475569';
  const width = mobile ? 450 : 900;
  const height = mobile ? 620 : 340;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">Repository language overview</title><desc id="desc">Personal repositories and administered organization repositories shown separately. Source bytes, not personal contributions or proficiency.</desc>
<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="16" fill="${bg}" stroke="${stroke}"/>
<g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">
<text x="32" y="36" fill="${muted}" font-size="11" letter-spacing="${mobile ? 0.3 : 1.6}">REPOSITORY LANGUAGES / ${data.scope.includePrivate ? 'PUBLIC + OPTED-IN PRIVATE' : 'PUBLIC RESEARCH &amp; SOFTWARE'}</text>
<path d="${mobile ? 'M32 294H418' : 'M450 66V285'}" stroke="${stroke}"/>
${panel(data.groups.personal, 32, 'Personal repositories', 'owned by cngvng', theme)}
<g transform="translate(0,${mobile ? 260 : 0})">${panel(data.groups.organizations, mobile ? 32 : 482, 'Administered organizations', 'shared codebases', theme)}</g>
<text x="32" y="${mobile ? 574 : 316}" fill="${muted}" font-size="11">${mobile ? 'Source bytes · non-forks · website repos excluded' : 'Source bytes · non-forks · website repos excluded · not an authorship or proficiency score'}</text>
${mobile ? `<text x="32" y="594" fill="${muted}" font-size="11">Not an authorship or proficiency score</text>` : ''}
<text x="${width - 32}" y="${mobile ? 594 : 316}" text-anchor="end" fill="${muted}" font-size="11">${data.updated} UTC</text>
</g></svg>\n`;
}

const data = process.argv.includes('--render-only')
  ? JSON.parse(await readFile(resolve(root, 'assets/languages.json'), 'utf8'))
  : await collect();
const outputs = {
  'languages.json': `${JSON.stringify(data, null, 2)}\n`,
  'languages-light.svg': render(data, 'light'),
  'languages-dark.svg': render(data, 'dark'),
  'languages-mobile-light.svg': render(data, 'light', true),
  'languages-mobile-dark.svg': render(data, 'dark', true),
};
await mkdir(resolve(root, 'assets'), { recursive: true });
for (const [name, content] of Object.entries(outputs)) {
  await writeFile(resolve(root, 'assets', name), content);
}
console.log(`Updated language overview: ${data.groups.personal.repositoryCount} personal + ${data.groups.organizations.repositoryCount} organization repositories. Private included: ${data.scope.includePrivate}.`);
