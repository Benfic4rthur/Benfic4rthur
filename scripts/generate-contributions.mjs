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
              contributionLevel
              date
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
    'User-Agent': 'github-contribution-grid-generator',
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

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const number = new Intl.NumberFormat('en-US');
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const weeks = (calendar.weeks || []).slice(-53);
const days = weeks.flatMap((week) => week.contributionDays || []);
const activeDays = days.filter((day) => Number(day.contributionCount || 0) > 0).length;
const peakDay = days.reduce((best, day) => (
  Number(day.contributionCount || 0) > Number(best?.contributionCount || 0) ? day : best
), days[0] || { contributionCount: 0, date: '' });
const latestDay = days.at(-1) || { contributionCount: 0, date: '' };

const width = 900;
const height = 258;
const cell = 12;
const left = 54;
const right = 30;
const top = 112;
const step = (width - left - right - cell) / Math.max(1, weeks.length - 1);

const levelColor = {
  NONE: '#161b22',
  FIRST_QUARTILE: '#0e4429',
  SECOND_QUARTILE: '#006d32',
  THIRD_QUARTILE: '#26a641',
  FOURTH_QUARTILE: '#39d353',
};

const cells = [];
for (let x = 0; x < weeks.length; x += 1) {
  for (const day of weeks[x].contributionDays || []) {
    const y = Number(day.weekday ?? 0);
    const px = left + x * step;
    const py = top + y * step;
    const count = Number(day.contributionCount || 0);
    const fill = levelColor[day.contributionLevel] || levelColor.NONE;
    const title = `${count} contribution${count === 1 ? '' : 's'} on ${day.date}`;

    cells.push(`<g>
  <title>${escapeXml(title)}</title>
  <rect x="${px}" y="${py}" width="${cell}" height="${cell}" rx="2" fill="${fill}" stroke="#0d1117" stroke-width=".6">
    <animate attributeName="opacity" from="0" to="1" dur=".45s" begin="${(x * 0.012 + y * 0.008).toFixed(3)}s" fill="freeze" />
  </rect>
</g>`);
  }
}

const monthLabels = [];
let previousMonth = '';
for (let x = 0; x < weeks.length; x += 1) {
  const first = weeks[x]?.contributionDays?.[0];
  if (!first?.date) continue;
  const monthKey = first.date.slice(0, 7);
  if (monthKey === previousMonth) continue;
  previousMonth = monthKey;

  const date = new Date(`${first.date}T00:00:00Z`);
  const label = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  monthLabels.push(`<text x="${left + x * step}" y="${top - 5}" class="axis">${label}</text>`);
}

const totalLabel = number.format(calendar.totalContributions);
const peakLabel = number.format(Number(peakDay.contributionCount || 0));
const latestLabel = number.format(Number(latestDay.contributionCount || 0));
const peakDate = peakDay.date ? shortDate.format(new Date(`${peakDay.date}T00:00:00Z`)) : '—';
const latestDate = latestDay.date ? shortDate.format(new Date(`${latestDay.date}T00:00:00Z`)) : '—';

const legendX = width - 174;
const legendY = height - 18;
const legendColors = [
  levelColor.NONE,
  levelColor.FIRST_QUARTILE,
  levelColor.SECOND_QUARTILE,
  levelColor.THIRD_QUARTILE,
  levelColor.FOURTH_QUARTILE,
];
const legendSquares = legendColors.map((fill, index) =>
  `<rect x="${legendX + 28 + index * 15}" y="${legendY - 9}" width="10" height="10" rx="2" fill="${fill}"/>`
).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub contribution activity for ${escapeXml(login)}">
<defs>
  <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#39d353"/>
    <stop offset=".55" stop-color="#58a6ff"/>
    <stop offset="1" stop-color="#a371f7"/>
  </linearGradient>
</defs>
<style>
  .bg { fill:#0d1117; stroke:#30363d; }
  .title { fill:#f0f6fc; font:800 17px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .subtitle { fill:#8b949e; font:10px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .statValue { fill:#f0f6fc; font:800 15px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .statLabel { fill:#6e7681; font:8px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; letter-spacing:.55px; }
  .axis { fill:#6e7681; font:9px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .live { fill:#7ee787; font:800 9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; letter-spacing:.7px; }
</style>

<rect class="bg" x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="14"/>
<rect x="20" y="18" width="112" height="3" rx="2" fill="url(#accent)"/>
<text x="20" y="42" class="title">CONTRIBUTION ACTIVITY</text>
<text x="20" y="57" class="subtitle">Daily activity across the last 12 months</text>

<circle cx="${width - 112}" cy="27" r="4" fill="#39d353">
  <animate attributeName="opacity" values="1;.35;1" dur="1.8s" repeatCount="indefinite"/>
</circle>
<text x="${width - 100}" y="30" class="live">UPDATED DAILY</text>

<g transform="translate(20 65)">
  <text x="0" y="13" class="statValue">${escapeXml(totalLabel)}</text>
  <text x="0" y="27" class="statLabel">12 MONTH TOTAL</text>

  <text x="168" y="13" class="statValue">${activeDays}</text>
  <text x="168" y="27" class="statLabel">ACTIVE DAYS</text>

  <text x="300" y="13" class="statValue">${escapeXml(peakLabel)}</text>
  <text x="300" y="27" class="statLabel">PEAK · ${escapeXml(peakDate)}</text>

  <text x="455" y="13" class="statValue">${escapeXml(latestLabel)}</text>
  <text x="455" y="27" class="statLabel">LATEST · ${escapeXml(latestDate)}</text>
</g>

${monthLabels.join('\n')}

<text x="20" y="${top + step + 9}" class="axis">Mon</text>
<text x="20" y="${top + step * 3 + 9}" class="axis">Wed</text>
<text x="20" y="${top + step * 5 + 9}" class="axis">Fri</text>

${cells.join('\n')}

<text x="${legendX}" y="${legendY}" class="axis">Less</text>
${legendSquares}
<text x="${legendX + 116}" y="${legendY}" class="axis">More</text>

<text x="20" y="${height - 18}" class="axis">Each square = 1 day · color intensity = contribution volume</text>
</svg>
`;

const output = path.resolve('assets/contributions-grid-v4.svg');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg, 'utf8');

const readmePath = path.resolve('README.md');
if (fs.existsSync(readmePath)) {
  const cacheKey = `grid-v5-${latestDay.date}-${calendar.totalContributions}`;
  const imageUrl = `https://raw.githubusercontent.com/${login}/${login}/main/assets/contributions-grid-v4.svg?v=${cacheKey}`;
  const readme = fs.readFileSync(readmePath, 'utf8');
  const updatedReadme = readme.replace(
    /(<img src=")(?:\.\/assets\/contributions-grid-v2\.svg|\.\/assets\/contributions-grid-v3\.svg|https:\/\/raw\.githubusercontent\.com\/Benfic4rthur\/Benfic4rthur\/main\/assets\/contributions-grid-v2\.svg(?:\?v=[^"]*)?|https:\/\/raw\.githubusercontent\.com\/Benfic4rthur\/Benfic4rthur\/main\/assets\/contributions-grid-v3\.svg(?:\?v=[^"]*)?)(" alt="Animated GitHub contribution activity")/,
    `$1${imageUrl}$2`,
  );
  if (updatedReadme !== readme) fs.writeFileSync(readmePath, updatedReadme, 'utf8');
}

console.log(`Gerado ${output} com ${calendar.totalContributions} contribuições.`);
