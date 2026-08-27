import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { DayStats, localDateOf } from '../core/model';
import {
  addDays,
  consistencyScore,
  dailySeries,
  ema,
  groupRows,
  hourlyTotals,
  isoWeekOf,
  languageTotals,
  linearTrend,
  peakHour,
  streaks,
  summarize,
} from '../core/statsEngine';
import { StatsStorage } from '../core/storage';
import { fmtHM, fmtHours1, fmtShortDate } from './format';

export interface DashboardOptions {
  hourlyRate: number;
  currency: string;
}

export class DashboardPanel {
  private static current: DashboardPanel | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly storage: StatsStorage,
    private readonly getOptions: () => DashboardOptions
  ) {
    panel.onDidDispose(() => {
      DashboardPanel.current = undefined;
    });
    panel.webview.onDidReceiveMessage((msg: { command?: string }) => {
      if (msg?.command === 'refresh') {
        void this.render();
      } else if (msg?.command === 'exportExcel') {
        void vscode.commands.executeCommand('devpulse.exportExcel');
      } else if (msg?.command === 'exportCsv') {
        void vscode.commands.executeCommand('devpulse.exportCsv');
      }
    });
  }

  static async createOrShow(storage: StatsStorage, getOptions: () => DashboardOptions): Promise<void> {
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal();
      await DashboardPanel.current.render();
      return;
    }
    const panel = vscode.window.createWebviewPanel('devpulseDashboard', 'DevPulse', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    DashboardPanel.current = new DashboardPanel(panel, storage, getOptions);
    await DashboardPanel.current.render();
  }

  private async render(): Promise<void> {
    const rows = await this.storage.readAllRows();
    this.panel.webview.html = renderHtml(rows, localDateOf(Date.now()), this.getOptions());
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderHtml(rows: DayStats[], today: string, opts: DashboardOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const total = summarize(rows);
  const todayRows = rows.filter((r) => r.date === today);
  const week = isoWeekOf(today);
  const month = today.slice(0, 7);
  const weekRows = rows.filter((r) => isoWeekOf(r.date) === week);
  const monthRows = rows.filter((r) => r.date.startsWith(month));
  const todaySecs = todayRows.reduce((a, r) => a + r.activeSeconds, 0);
  const weekSecs = weekRows.reduce((a, r) => a + r.activeSeconds, 0);
  const monthSecs = monthRows.reduce((a, r) => a + r.activeSeconds, 0);
  const activeDates = rows.filter((r) => r.activeSeconds > 0).map((r) => r.date);
  const st = streaks(activeDates, today);
  const series30 = dailySeries(rows, 30, today);
  const consistency = consistencyScore(series30.map((p) => p.seconds));
  const peak = peakHour(hourlyTotals(rows));
  const trendPerDay = linearTrend(dailySeries(rows, 14, today).map((p) => p.seconds));
  const from90 = addDays(today, -89);
  const rows90 = rows.filter((r) => r.date >= from90);

  const kpiTiles = [
    tile('Hoy', fmtHM(todaySecs)),
    tile('Esta semana', fmtHM(weekSecs)),
    tile('Este mes', fmtHM(monthSecs)),
    tile('Total', fmtHM(total.activeSeconds)),
    tile('Racha', `${st.current} d`, `máx. ${st.longest} d`),
    tile('Consistencia', `${consistency}/100`, 'últimos 30 días'),
    tile('Foco', `${Math.round(total.focusRatio * 100)} %`, 'activo / primer plano'),
    tile('Hora pico', peak === null ? '—' : `${String(peak).padStart(2, '0')}:00`),
    tile(
      'Tendencia',
      `${trendPerDay >= 0 ? '+' : '−'}${Math.abs(trendPerDay / 3600).toFixed(1).replace('.', ',')} h/día`,
      'últimas 2 semanas'
    ),
  ];
  if (opts.hourlyRate > 0) {
    const monthCost = (monthSecs / 3600) * opts.hourlyRate;
    kpiTiles.push(tile('Coste del mes', `${monthCost.toFixed(2).replace('.', ',')} ${esc(opts.currency)}`));
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>DevPulse</title>
<style>
  :root { color-scheme: light dark; }
  body {
    --dp-accent: #1a6fd4;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px 24px 40px;
    max-width: 960px;
    margin: 0 auto;
  }
  body.vscode-dark, body.vscode-high-contrast { --dp-accent: #3794ff; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground); margin: 28px 0 10px; font-weight: 600; }
  .topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .topbar .sub { color: var(--vscode-descriptionForeground); font-size: 12px; flex: 1; }
  button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 3px; padding: 5px 12px; cursor: pointer; font-size: 12px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .tile { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px 12px; }
  .tile .label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .tile .value { font-size: 20px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .tile .hint { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  svg { width: 100%; height: auto; display: block; }
  .bar { fill: var(--dp-accent); }
  .bar:hover { opacity: 0.8; }
  .grid { stroke: var(--vscode-panel-border); stroke-width: 1; }
  .axis-label, .cell-label { fill: var(--vscode-descriptionForeground); font-size: 10px; font-family: var(--vscode-font-family); }
  .direct-label { fill: var(--vscode-foreground); font-size: 10px; font-family: var(--vscode-font-family); }
  .ema { stroke: var(--vscode-descriptionForeground); stroke-width: 2; stroke-dasharray: 4 3; fill: none; }
  .cell { fill: var(--dp-accent); }
  .cell-empty { fill: var(--vscode-panel-border); fill-opacity: 0.25; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th { text-align: left; color: var(--vscode-descriptionForeground); font-weight: 600; border-bottom: 1px solid var(--vscode-panel-border); padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); font-variant-numeric: tabular-nums; }
  td.num, th.num { text-align: right; }
  .lang-row { display: grid; grid-template-columns: 130px 1fr 70px; align-items: center; gap: 10px; margin: 6px 0; font-size: 12px; }
  .lang-track { background: var(--vscode-panel-border); border-radius: 3px; height: 8px; overflow: hidden; }
  .lang-fill { background: var(--dp-accent); height: 100%; border-radius: 3px; }
  .lang-val { text-align: right; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
  .empty { color: var(--vscode-descriptionForeground); padding: 24px 0; }
</style>
</head>
<body>
  <div class="topbar">
    <h1>DevPulse</h1>
    <span class="sub">Actualizado: ${esc(today)}</span>
    <button data-cmd="refresh" class="secondary">Actualizar</button>
    <button data-cmd="exportCsv" class="secondary">Exportar CSV</button>
    <button data-cmd="exportExcel">Exportar Excel</button>
  </div>
  ${
    rows.length === 0
      ? '<p class="empty">Aún no hay actividad registrada. Trabaja un rato con un proyecto abierto y vuelve a este panel.</p>'
      : `
  <div class="tiles">${kpiTiles.join('')}</div>
  <h2>Actividad diaria — últimos 30 días</h2>
  ${barChartSvg(series30)}
  <h2>Mapa de calor semana × hora — últimos 90 días</h2>
  ${heatmapSvg(rows90)}
  <h2>Proyectos</h2>
  ${projectsTable(rows, today)}
  <h2>Lenguajes</h2>
  ${languagesBars(rows)}
  `
  }
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    for (const btn of document.querySelectorAll('button[data-cmd]')) {
      btn.addEventListener('click', () => vscodeApi.postMessage({ command: btn.dataset.cmd }));
    }
  </script>
</body>
</html>`;
}

function tile(label: string, value: string, hint?: string): string {
  return `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${
    hint ? `<div class="hint">${esc(hint)}</div>` : ''
  }</div>`;
}

function barChartSvg(series: { date: string; seconds: number }[]): string {
  const W = 720;
  const H = 200;
  const padL = 40;
  const padR = 8;
  const padT = 16;
  const padB = 22;
  const cw = W - padL - padR;
  const ch = H - padT - padB;
  const max = Math.max(3600, ...series.map((p) => p.seconds));
  const n = series.length;
  const step = cw / n;
  const bw = Math.max(2, step - 2);
  const yFor = (v: number) => padT + ch - (v / max) * ch;

  let maxIdx = -1;
  let maxVal = 0;
  series.forEach((p, i) => {
    if (p.seconds > maxVal) {
      maxVal = p.seconds;
      maxIdx = i;
    }
  });

  const parts: string[] = [];
  for (const frac of [0, 0.5, 1]) {
    const y = yFor(max * frac).toFixed(1);
    parts.push(`<line class="grid" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>`);
    parts.push(
      `<text class="axis-label" x="${padL - 6}" y="${(Number(y) + 3).toFixed(1)}" text-anchor="end">${(
        (max * frac) /
        3600
      )
        .toFixed(1)
        .replace('.', ',')}h</text>`
    );
  }
  series.forEach((p, i) => {
    if (p.seconds <= 0) {
      return;
    }
    const h = (p.seconds / max) * ch;
    const x = padL + i * step + (step - bw) / 2;
    const y = padT + ch - h;
    parts.push(
      `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, h).toFixed(
        1
      )}" rx="2"><title>${fmtShortDate(p.date)}: ${fmtHM(p.seconds)}</title></rect>`
    );
  });
  const emaVals = ema(series.map((p) => p.seconds), 0.3);
  const pts = emaVals.map((v, i) => `${(padL + i * step + step / 2).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
  parts.push(`<polyline class="ema" points="${pts}"/>`);
  if (maxIdx >= 0) {
    const x = padL + maxIdx * step + step / 2;
    parts.push(
      `<text class="direct-label" x="${x.toFixed(1)}" y="${(yFor(maxVal) - 4).toFixed(1)}" text-anchor="middle">${fmtHours1(
        maxVal
      )}</text>`
    );
  }
  for (const i of [0, Math.floor(n / 2), n - 1]) {
    const x = padL + i * step + step / 2;
    parts.push(
      `<text class="axis-label" x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${fmtShortDate(series[i].date)}</text>`
    );
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Horas activas por día">${parts.join('')}</svg>`;
}

function heatmapSvg(rows: DayStats[]): string {
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const r of rows) {
    const weekday = (new Date(`${r.date}T00:00:00`).getDay() + 6) % 7; // 0 = lunes
    for (let h = 0; h < 24; h++) {
      matrix[weekday][h] += r.hourly[h] ?? 0;
    }
  }
  const max = Math.max(1, ...matrix.flat());
  const cell = 22;
  const gap = 2;
  const padL = 30;
  const padT = 16;
  const W = padL + 24 * (cell + gap);
  const H = padT + 7 * (cell + gap);
  const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const parts: string[] = [];
  for (let h = 0; h < 24; h += 4) {
    parts.push(
      `<text class="axis-label" x="${padL + h * (cell + gap) + cell / 2}" y="${padT - 5}" text-anchor="middle">${h}h</text>`
    );
  }
  for (let d = 0; d < 7; d++) {
    parts.push(
      `<text class="axis-label" x="${padL - 8}" y="${padT + d * (cell + gap) + cell / 2 + 3}" text-anchor="end">${dayNames[d]}</text>`
    );
    for (let h = 0; h < 24; h++) {
      const v = matrix[d][h];
      const x = padL + h * (cell + gap);
      const y = padT + d * (cell + gap);
      const cls = v > 0 ? 'cell' : 'cell-empty';
      const opacity = v > 0 ? (0.12 + 0.88 * (v / max)).toFixed(2) : '1';
      parts.push(
        `<rect class="${cls}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill-opacity="${opacity}">` +
          `<title>${dayNames[d]} ${String(h).padStart(2, '0')}:00 — ${fmtHM(v)}</title></rect>`
      );
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Actividad por día de la semana y hora">${parts.join('')}</svg>`;
}

function projectsTable(rows: DayStats[], today: string): string {
  const week = isoWeekOf(today);
  const month = today.slice(0, 7);
  const byProject = [...groupRows(rows, (r) => r.projectPath).entries()]
    .map(([projectPath, projRows]) => ({ projectPath, projRows, total: summarize(projRows) }))
    .sort((a, b) => b.total.activeSeconds - a.total.activeSeconds);
  const body = byProject
    .map(({ projRows, total }) => {
      const sum = (pred: (r: DayStats) => boolean) =>
        projRows.filter(pred).reduce((a, r) => a + r.activeSeconds, 0);
      return `<tr>
        <td title="${esc(projRows[0].projectPath)}">${esc(projRows[0].project)}</td>
        <td class="num">${fmtHM(sum((r) => r.date === today))}</td>
        <td class="num">${fmtHM(sum((r) => isoWeekOf(r.date) === week))}</td>
        <td class="num">${fmtHM(sum((r) => r.date.startsWith(month)))}</td>
        <td class="num">${fmtHM(total.activeSeconds)}</td>
        <td class="num">${fmtHours1(total.avgSecondsPerActiveDay)}</td>
        <td class="num">+${total.linesAdded} / −${total.linesDeleted}</td>
        <td class="num">${total.sessionCount}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr>
      <th>Proyecto</th><th class="num">Hoy</th><th class="num">Semana</th><th class="num">Mes</th>
      <th class="num">Total</th><th class="num">Media/día</th><th class="num">Líneas</th><th class="num">Sesiones</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function languagesBars(rows: DayStats[]): string {
  const totals = Object.entries(languageTotals(rows)).sort((a, b) => b[1] - a[1]);
  if (totals.length === 0) {
    return '<p class="empty">Sin datos de lenguajes todavía.</p>';
  }
  const max = totals[0][1];
  const top = totals.slice(0, 8);
  const items = top
    .map(([lang, secs]) => {
      const width = Math.max(2, Math.round((secs / max) * 100));
      return `<div class="lang-row"><span>${esc(lang)}</span><div class="lang-track"><div class="lang-fill" style="width:${width}%"></div></div><span class="lang-val">${fmtHours1(
        secs
      )}</span></div>`;
    })
    .join('');
  const rest = totals.length - top.length;
  return items + (rest > 0 ? `<div class="lang-row"><span>otros (${rest})</span><div></div><div></div></div>` : '');
}
