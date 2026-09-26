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
    'User-Agent': 'github-contribution-pulse-generator',
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

const allDays = (calendar.weeks || [])
  .flatMap((week) => week.contributionDays || [])
  .filter((day) => day?.date)
  .sort((a, b) => a.date.localeCompare(b.date));

const days = allDays.slice(-91);
if (days.length < 2) throw new Error('Dados insuficientes para gerar o gráfico');

const width = 900;
const height = 304;
const left = 54;
const right = 26;
const top = 92;
const bottom = 46;
const plotWidth = width - left - right;
const plotHeight = height - top - bottom;
const baseline = top + plotHeight;

const counts = days.map((day) => Number(day.contributionCount || 0));
const maxCount = Math.max(1, ...counts);
const total90 = counts.reduce((sum, count) => sum + count, 0);
const activeDays = counts.filter((count) => count > 0).length;
const bestDay = days.reduce((best, day) => (
  Number(day.contributionCount || 0) > Number(best.contributionCount || 0) ? day : best
), days[0]);
const latestDay = days.at(-1);

const xFor = (index) => left + (index / (days.length - 1)) * plotWidth;
const yFor = (count) => baseline - (count / maxCount) * plotHeight;
const points = days.map((day, index) => ({
  ...day,
  count: Number(day.contributionCount || 0),
  x: xFor(index),
  y: yFor(Number(day.contributionCount || 0)),
}));

const linePath = points
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
  .join(' ');
const areaPath = `${linePath} L${points.at(-1).x.toFixed(2)},${baseline} L${points[0].x.toFixed(2)},${baseline} Z`;

const number = new Intl.NumberFormat('en-US');
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const longDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const formatDate = (date, formatter = shortDate) => formatter.format(new Date(`${date}T00:00:00Z`));

const monthLabels = [];
let previousMonth = '';
for (const point of points) {
  const month = point.date.slice(0, 7);
  if (month !== previousMonth) {
    const date = new Date(`${point.date}T00:00:00Z`);
    monthLabels.push(
      `<text x="${point.x.toFixed(2)}" y="${height - 18}" class="axis-label">${escapeXml(
        date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      )}</text>`,
    );
    previousMonth = month;
  }
}

const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
  const y = baseline - ratio * plotHeight;
  const value = Math.round(maxCount * ratio);
  return `
<line x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}" class="grid" />
<text x="${left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="axis-label">${number.format(value)}</text>`;
}).join('\n');

const tooltipPoints = points.map((point, index) => {
  const tooltipWidth = 132;
  const tooltipHeight = 44;
  const tipX = index < 8 ? 10 : index > points.length - 9 ? -tooltipWidth - 10 : -tooltipWidth / 2;
  const tipY = point.y < top + 58 ? 14 : -tooltipHeight - 14;
  const countLabel = `${number.format(point.count)} contribution${point.count === 1 ? '' : 's'}`;
  return `
<g class="point" transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})">
  <circle class="hit" r="9" />
  <circle class="dot" r="${point.count > 0 ? 2.6 : 1.8}" />
  <g class="tooltip" transform="translate(${tipX.toFixed(2)} ${tipY.toFixed(2)})">
    <rect width="${tooltipWidth}" height="${tooltipHeight}" rx="7" />
    <text x="10" y="17" class="tooltip-date">${escapeXml(formatDate(point.date, longDate))}</text>
    <text x="10" y="34" class="tooltip-count">${escapeXml(countLabel)}</text>
  </g>
  <title>${escapeXml(`${formatDate(point.date, longDate)}: ${countLabel}`)}</title>
</g>`;
}).join('\n');

const totalLabel = number.format(calendar.totalContributions);
const total90Label = number.format(total90);
const bestLabel = number.format(Number(bestDay.contributionCount || 0));
const latestLabel = number.format(Number(latestDay.contributionCount || 0));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Animated GitHub contribution activity for ${escapeXml(login)}">
<defs>
  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#39d353" stop-opacity="0.46" />
    <stop offset="100%" stop-color="#39d353" stop-opacity="0.02" />
  </linearGradient>
  <filter id="glow" x="-250%" y="-250%" width="500%" height="500%">
    <feGaussianBlur stdDeviation="3.2" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
</defs>
<style>
  .bg { fill: #0d1117; stroke: #30363d; }
  .title { fill: #f0f6fc; font: 700 17px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .subtitle { fill: #8b949e; font: 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .stat-value { fill: #f0f6fc; font: 700 15px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .stat-label { fill: #8b949e; font: 10px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .live { fill: #39d353; font: 700 10px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; letter-spacing: .4px; }
  .grid { stroke: #21262d; stroke-width: 1; }
  .axis-label { fill: #6e7681; font: 9px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .dot { fill: #39d353; opacity: .48; transition: opacity .15s ease, transform .15s ease; transform-box: fill-box; transform-origin: center; }
  .hit { fill: transparent; }
  .tooltip { opacity: 0; pointer-events: none; transition: opacity .12s ease; }
  .tooltip rect { fill: #161b22; stroke: #30363d; }
  .tooltip-date { fill: #8b949e; font: 10px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .tooltip-count { fill: #f0f6fc; font: 700 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; }
  .point:hover .tooltip { opacity: 1; }
  .point:hover .dot { opacity: 1; transform: scale(1.9); }
  @media (prefers-reduced-motion: reduce) {
    .motion-marker { display: none; }
  }
</style>

<rect class="bg" x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="12" />

<text x="22" y="29" class="title">Contribution Pulse</text>
<text x="22" y="47" class="subtitle">Daily GitHub activity · last 90 days</text>

<circle cx="${width - 106}" cy="24" r="4" fill="#39d353">
  <animate attributeName="opacity" values="1;.25;1" dur="1.8s" repeatCount="indefinite" />
</circle>
<text x="${width - 96}" y="28" class="live">UPDATED DAILY</text>

<g transform="translate(22 59)">
  <text x="0" y="15" class="stat-value">${escapeXml(totalLabel)}</text>
  <text x="0" y="29" class="stat-label">LAST 12 MONTHS</text>

  <text x="154" y="15" class="stat-value">${escapeXml(total90Label)}</text>
  <text x="154" y="29" class="stat-label">LAST 90 DAYS</text>

  <text x="290" y="15" class="stat-value">${activeDays}</text>
  <text x="290" y="29" class="stat-label">ACTIVE DAYS</text>

  <text x="408" y="15" class="stat-value">${escapeXml(bestLabel)}</text>
  <text x="408" y="29" class="stat-label">BEST DAY · ${escapeXml(formatDate(bestDay.date))}</text>

  <text x="580" y="15" class="stat-value">${escapeXml(latestLabel)}</text>
  <text x="580" y="29" class="stat-label">LATEST · ${escapeXml(formatDate(latestDay.date))}</text>
</g>

${gridLines}

<path d="${areaPath}" fill="url(#areaGradient)" opacity="0">
  <animate attributeName="opacity" from="0" to="1" dur="1.6s" fill="freeze" />
</path>

<path d="${linePath}" pathLength="1000" fill="none" stroke="#39d353" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1000" stroke-dashoffset="1000">
  <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="1.8s" fill="freeze" />
</path>

${tooltipPoints}

<circle class="motion-marker" cx="0" cy="0" r="4.8" fill="#7ee787" stroke="#0d1117" stroke-width="2" filter="url(#glow)">
  <animateMotion begin="1.7s" dur="12s" repeatCount="indefinite" path="${linePath}" />
</circle>

${monthLabels.join('\n')}

<text x="${width - right}" y="${height - 18}" text-anchor="end" class="axis-label">Hover a point for details · click from the README to open the interactive SVG</text>
</svg>
`;

const output = path.resolve('assets/contributions.svg');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg, 'utf8');
console.log(`Gerado ${output} com ${calendar.totalContributions} contribuições.`);
