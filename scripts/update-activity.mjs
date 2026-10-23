import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(resolve(root, 'profile.config.json'), 'utf8'));
const run = promisify(execFile);
// Activity uses the public profile calendar, independently of private code access.
const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){createdAt contributionsCollection(from:$from,to:$to){totalCommitContributions totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions restrictedContributionsCount contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`;
async function fetchYear(year, today) {
  const from = `${year}-01-01T00:00:00Z`;
  const to = year === Number(today.slice(0, 4)) ? `${today}T23:59:59Z` : `${year}-12-31T23:59:59Z`;
  const { stdout } = await run('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `login=${config.username}`, '-f', `from=${from}`, '-f', `to=${to}`], { maxBuffer: 8 * 1024 * 1024 });
  const response = JSON.parse(stdout);
  if (response.errors || !response.data?.user) throw Error('Could not fetch a complete GitHub contribution calendar. Existing cards are unchanged.');
  return response.data.user;
}

function summarize(years, today) {
  const counts = new Map();
  for (const [year, user] of years) {
    for (const week of user.contributionsCollection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        if (day.date.startsWith(String(year)) && day.date <= today) counts.set(day.date, day.contributionCount);
      }
    }
  }
  const days = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
  let longest = 0, currentRun = 0, previous;
  for (const day of days) {
    const sequential = previous && Date.parse(day.date) - Date.parse(previous) === 86400000;
    currentRun = day.count ? (sequential ? currentRun + 1 : 1) : 0;
    longest = Math.max(longest, currentRun);
    previous = day.date;
  }
  let index = days.length - 1;
  // An unfinished day with zero contributions does not terminate yesterday's streak.
  if (days[index]?.date === today && days[index].count === 0) index--;
  let current = 0, expected = index >= 0 ? days[index].date : today;
  while (index >= 0 && days[index].date === expected && days[index].count > 0) {
    current++;
    expected = new Date(Date.parse(expected) - 86400000).toISOString().slice(0, 10);
    index--;
  }
  const year = Number(today.slice(0, 4));
  const collection = years.find(([y]) => y === year)[1].contributionsCollection;
  const yearDays = days.filter(day => day.date.startsWith(String(year)));
  const annualCalendars = years.map(([year, user]) => {
    const counted = days.filter(day => day.date.startsWith(String(year))).reduce((sum, day) => sum + day.count, 0);
    const reported = user.contributionsCollection.contributionCalendar.totalContributions;
    if (counted !== reported) throw Error(`Contribution calendar totals differ for ${year}; existing activity cards are unchanged.`);
    return { year, contributions: counted };
  }).sort((a, b) => a.year - b.year);
  return {
    updated: today, timezone: 'UTC', username: config.username,
    source: 'GitHub contribution calendar; counts follow profile visibility, including restricted aggregate contributions returned by GitHub. Not a count of commits alone.',
    lifetime: { contributions: days.reduce((total, day) => total + day.count, 0), currentStreakDays: current, longestStreakDays: longest },
    yearToDate: { year, contributions: yearDays.reduce((total, day) => total + day.count, 0), commitContributions: collection.totalCommitContributions, pullRequestContributions: collection.totalPullRequestContributions, issueContributions: collection.totalIssueContributions, reviewContributions: collection.totalPullRequestReviewContributions, restrictedContributions: collection.restrictedContributionsCount },
    annualCalendars,
    recentDays: days.slice(-90),
  };
}

const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
function render(data, dark, mobile) {
  const width = mobile ? 450 : 900, height = mobile ? 380 : 258;
  const bg = dark ? '#0f172a' : '#f8fafc', ink = dark ? '#e2e8f0' : '#0f172a';
  const muted = dark ? '#94a3b8' : '#475569', border = dark ? '#334155' : '#cbd5e1';
  const metrics = [
    [data.lifetime.contributions.toLocaleString('en-US'), 'Total contributions'],
    [String(data.lifetime.currentStreakDays), 'Current streak · days'],
    [String(data.lifetime.longestStreakDays), 'Longest streak · days'],
    [data.yearToDate.contributions.toLocaleString('en-US'), `${data.yearToDate.year} contributions`],
  ];
  const tiles = metrics.map(([value, label], i) => {
    const x = 28 + (mobile ? i % 2 * 210 : i * 216);
    const y = 78 + (mobile ? Math.floor(i / 2) * 70 : 0);
    return `<text x="${x}" y="${y}" fill="${i === 1 ? '#2563eb' : ink}" font-size="29" font-weight="700">${esc(value)}</text><text x="${x}" y="${y + 22}" fill="${muted}" font-size="12">${esc(label)}</text>`;
  }).join('');
  const chartTop = mobile ? 238 : 148, chartHeight = mobile ? 75 : 59;
  const max = Math.max(1, ...data.recentDays.map(day => day.count));
  const chartWidth = width - 56;
  const points = data.recentDays.map((day, i) => `${28 + i / Math.max(1, data.recentDays.length - 1) * chartWidth},${chartTop + chartHeight - day.count / max * chartHeight}`).join(' ');
  const bottom = chartTop + chartHeight;
  const first = data.recentDays[0]?.date ?? data.updated;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">Research and engineering activity</title><desc id="desc">GitHub contribution streaks and the last 90 days of calendar contributions. UTC. Includes all activity GitHub exposes on the profile, not only commits.</desc>
<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="14" fill="${bg}" stroke="${border}"/>
<g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<text x="28" y="30" fill="${muted}" font-size="11" letter-spacing="1.2">RESEARCH &amp; ENGINEERING / ACTIVITY</text>
${tiles}
<text x="28" y="${chartTop - 12}" fill="${muted}" font-size="11">Last 90 days · contributions per day · peak ${max}</text>
<path d="M28 ${bottom}H${width - 28}" stroke="${border}"/>
<polygon points="28,${bottom} ${points} ${width - 28},${bottom}" fill="#60a5fa" opacity=".12"/>
<polyline points="${points}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round"/>
<text x="28" y="${bottom + 19}" fill="${muted}" font-size="10">${first}</text><text x="${width - 28}" y="${bottom + 19}" text-anchor="end" fill="${muted}" font-size="10">${data.updated}</text>
<text x="28" y="${height - 12}" fill="${muted}" font-size="10">GitHub calendar · contributions ≠ commits · UTC</text>
</g></svg>\n`;
}

let data;
if (process.argv.includes('--render-only')) {
  data = JSON.parse(await readFile(resolve(root, 'assets/activity.json'), 'utf8'));
} else {
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const current = await fetchYear(currentYear, today);
  const firstYear = Number(current.createdAt.slice(0, 4));
  const years = [[currentYear, current]];
  for (let year = firstYear; year < currentYear; year++) years.push([year, await fetchYear(year, today)]);
  data = summarize(years, today);
}
await mkdir(resolve(root, 'assets'), { recursive: true });
const outputs = { 'activity.json': JSON.stringify(data, null, 2) + '\n' };
for (const dark of [false, true]) for (const mobile of [false, true]) {
  outputs[`activity-${mobile ? 'mobile-' : ''}${dark ? 'dark' : 'light'}.svg`] = render(data, dark, mobile);
}
for (const [name, content] of Object.entries(outputs)) await writeFile(resolve(root, 'assets', name), content);
console.log(`Activity updated through ${data.updated}: ${data.lifetime.contributions} contributions; current streak ${data.lifetime.currentStreakDays} days; longest ${data.lifetime.longestStreakDays} days.`);
