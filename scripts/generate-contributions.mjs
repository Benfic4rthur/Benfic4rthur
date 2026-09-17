import fs from 'node:fs';
import path from 'node:path';

const token = process.env.GITHUB_TOKEN;
const login = process.env.GITHUB_USER || 'Benfic4rthur';

if (!token) throw new Error('GITHUB_TOKEN ausente');

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              color
              weekday
            }
          }
        }
      }
    }
  }
`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'github-contribution-calendar-generator',
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL respondeu ${response.status}: ${await response.text()}`);
}

const payload = await response.json();
if (payload.errors?.length) throw new Error(JSON.stringify(payload.errors));

const calendar = payload?.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) throw new Error('Calendário de contribuições não encontrado');

const weeks = calendar.weeks || [];
const cell = 11;
const gap = 3;
const step = cell + gap;
const left = 42;
const top = 48;
const width = Math.max(760, left + weeks.length * step + 24);
const height = 172;

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const rects = [];
for (let x = 0; x < weeks.length; x += 1) {
  for (const day of weeks[x].contributionDays || []) {
    const y = Number(day.weekday ?? 0);
    const px = left + x * step;
    const py = top + y * step;
    const count = Number(day.contributionCount || 0);
    const color = day.color || '#161b22';
    const title = `${count} contribution${count === 1 ? '' : 's'} on ${day.date}`;
    rects.push(`<g><title>${escapeXml(title)}</title><rect x="${px}" y="${py}" width="${cell}" height="${cell}" rx="2" fill="${color}" /></g>`);
  }
}

const monthLabels = [];
let previousMonth = '';
for (let x = 0; x < weeks.length; x += 1) {
  const first = weeks[x]?.contributionDays?.[0];
  if (!first?.date) continue;
  const date = new Date(`${first.date}T00:00:00Z`);
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  if (month !== previousMonth) {
    if (x > 0) monthLabels.push(`<text x="${left + x * step}" y="36" class="month">${month}</text>`);
    previousMonth = month;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub contribution calendar for ${escapeXml(login)}">
<style>
  .bg { fill: #0d1117; stroke: #30363d; }
  .title { fill: #f0f6fc; font: 600 15px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .count { fill: #8b949e; font: 12px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .month,.day { fill: #8b949e; font: 10px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
</style>
<rect class="bg" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" />
<text x="18" y="23" class="title">Contributions</text>
<text x="${width - 18}" y="23" text-anchor="end" class="count">${calendar.totalContributions} contributions in the last year</text>
${monthLabels.join('\n')}
<text x="18" y="${top + step + 9}" class="day">Mon</text>
<text x="18" y="${top + step * 3 + 9}" class="day">Wed</text>
<text x="18" y="${top + step * 5 + 9}" class="day">Fri</text>
${rects.join('\n')}
</svg>\n`;

const output = path.resolve('assets/contributions.svg');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg, 'utf8');
console.log(`Gerado ${output} com ${calendar.totalContributions} contribuições.`);
