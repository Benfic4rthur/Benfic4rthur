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
    'User-Agent': 'github-contribution-matrix-generator',
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
const weekData = weeks.map((week) => {
  const entries = week.contributionDays || [];
  return {
    total: entries.reduce((sum, day) => sum + Number(day.contributionCount || 0), 0),
    start: entries[0]?.date || '',
    end: entries.at(-1)?.date || '',
  };
});

const activeDays = days.filter((day) => Number(day.contributionCount || 0) > 0).length;
const peakDay = days.reduce((best, day) => (
  Number(day.contributionCount || 0) > Number(best?.contributionCount || 0) ? day : best
), days[0] || { contributionCount: 0, date: '' });
const latestDay = days.at(-1) || { contributionCount: 0, date: '' };
const maxWeek = Math.max(1, ...weekData.map((week) => week.total));

const width = 900;
const height = 220;
const left = 30;
const right = 28;
const plotTop = 94;
const baseline = 176;
const plotHeight = baseline - plotTop;
const plotWidth = width - left - right;
const step = plotWidth / Math.max(1, weekData.length);
const barWidth = Math.min(11, Math.max(7, step * 0.68));

const barFillFor = (ratio) => {
  if (ratio >= 0.75) return '#7ee787';
  if (ratio >= 0.45) return '#39d353';
  if (ratio >= 0.18) return '#2ea043';
  return '#238636';
};

const bars = weekData.map((week, index) => {
  const x = left + index * step + (step - barWidth) / 2;
  const ratio = week.total / maxWeek;
  const h = week.total === 0 ? 0 : Math.max(5, ratio * plotHeight);
  const y = baseline - h;
  const fill = barFillFor(ratio);
  const label = `${number.format(week.total)} contributions · ${week.start} to ${week.end}`;

  return `
<g>
  <rect x="${x.toFixed(2)}" y="${plotTop}" width="${barWidth.toFixed(2)}" height="${plotHeight}" rx="${(barWidth / 2).toFixed(2)}" fill="#161b22" />
  <rect x="${x.toFixed(2)}" y="${baseline}" width="${barWidth.toFixed(2)}" height="0" rx="${(barWidth / 2).toFixed(2)}" fill="${fill}">
    <animate attributeName="y" from="${baseline}" to="${y.toFixed(2)}" dur=".65s" begin="${(index * 0.014).toFixed(3)}s" fill="freeze" />
    <animate attributeName="height" from="0" to="${h.toFixed(2)}" dur=".65s" begin="${(index * 0.014).toFixed(3)}s" fill="freeze" />
    <title>${escapeXml(label)}</title>
  </rect>
</g>`;
}).join('\n');

const monthLabels = [];
let lastMonth = '';
for (let index = 0; index < weekData.length; index += 1) {
  const date = weekData[index].start;
  if (!date) continue;
  const month = date.slice(0, 7);
  if (month === lastMonth) continue;
  lastMonth = month;
  const x = left + index * step + step / 2;
  const label = new Date(`${date}T00:00:00Z`).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  monthLabels.push(`<text x="${x.toFixed(2)}" y="200" class="axis">${escapeXml(label)}</text>`);
}

const totalLabel = number.format(calendar.totalContributions);
const peakLabel = number.format(Number(peakDay.contributionCount || 0));
const latestLabel = number.format(Number(latestDay.contributionCount || 0));
const peakDate = peakDay.date ? shortDate.format(new Date(`${peakDay.date}T00:00:00Z`)) : '—';
const latestDate = latestDay.date ? shortDate.format(new Date(`${latestDay.date}T00:00:00Z`)) : '—';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub contribution matrix for ${escapeXml(login)}">
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
  .axis { fill:#6e7681; font:8px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .live { fill:#7ee787; font:800 9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; letter-spacing:.7px; }
</style>

<rect class="bg" x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="14"/>
<rect x="20" y="18" width="112" height="3" rx="2" fill="url(#accent)"/>
<text x="20" y="42" class="title">CONTRIBUTION MATRIX</text>
<text x="20" y="57" class="subtitle">Weekly activity across the last 12 months</text>

<circle cx="${width - 112}" cy="27" r="4" fill="#39d353">
  <animate attributeName="opacity" values="1;.35;1" dur="1.8s" repeatCount="indefinite"/>
</circle>
<text x="${width - 100}" y="30" class="live">UPDATED DAILY</text>

<g transform="translate(20 67)">
  <text x="0" y="13" class="statValue">${escapeXml(totalLabel)}</text>
  <text x="0" y="27" class="statLabel">12 MONTH TOTAL</text>

  <text x="164" y="13" class="statValue">${activeDays}</text>
  <text x="164" y="27" class="statLabel">ACTIVE DAYS</text>

  <text x="292" y="13" class="statValue">${escapeXml(peakLabel)}</text>
  <text x="292" y="27" class="statLabel">PEAK · ${escapeXml(peakDate)}</text>

  <text x="442" y="13" class="statValue">${escapeXml(latestLabel)}</text>
  <text x="442" y="27" class="statLabel">LATEST · ${escapeXml(latestDate)}</text>

  <text x="590" y="13" class="statValue">${weekData.length}</text>
  <text x="590" y="27" class="statLabel">WEEKS SHOWN</text>
</g>

<line x1="${left}" y1="${baseline}" x2="${width - right}" y2="${baseline}" stroke="#21262d" stroke-width="1"/>
${bars}
${monthLabels.join('\n')}

<text x="${width - right}" y="211" text-anchor="end" class="axis">Each bar = 1 week · taller means more contributions</text>
</svg>
`;

const output = path.resolve('assets/contributions.svg');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg, 'utf8');

const readmePath = path.resolve('README.md');
if (fs.existsSync(readmePath)) {
  const cacheKey = `matrix-v1-${latestDay.date}-${calendar.totalContributions}`;
  const imageUrl = `https://raw.githubusercontent.com/${login}/${login}/main/assets/contributions.svg?v=${cacheKey}`;
  const readme = fs.readFileSync(readmePath, 'utf8');
  const updatedReadme = readme.replace(
    /(<img src=")(?:\.\/assets\/contributions\.svg|https:\/\/raw\.githubusercontent\.com\/Benfic4rthur\/Benfic4rthur\/main\/assets\/contributions\.svg(?:\?v=[^"]*)?)(" alt="Animated GitHub contribution activity")/,
    `$1${imageUrl}$2`,
  );
  if (updatedReadme !== readme) fs.writeFileSync(readmePath, updatedReadme, 'utf8');
}

console.log(`Gerado ${output} com ${calendar.totalContributions} contribuições.`);
