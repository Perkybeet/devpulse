import * as ExcelJS from 'exceljs';
import { DayStats } from '../core/model';
import {
  consistencyScore,
  dailySeries,
  groupRows,
  hourlyTotals,
  isoWeekOf,
  languageTotals,
  monthOf,
  peakHour,
  streaks,
  summarize,
} from '../core/statsEngine';

export interface ExportOptions {
  hourlyRate: number;
  currency: string;
  /** Fecha local de hoy (YYYY-MM-DD), usada para las rachas. */
  today: string;
  /** Momento de generación en ms epoch. */
  generatedAt: number;
  /** Datos de la firma criptográfica; si se aporta, se añade la hoja Verificación. */
  signature?: {
    fingerprint: string;
    sha256Rows: string;
    signatureB64: string;
  };
}

const HEADER_BG = 'FF2F5597';
const DUR_FMT = '[h]:mm';

function hoursDec(s: number): number {
  return Math.round((s / 3600) * 100) / 100;
}

function excelDur(s: number): number {
  return s / 86400;
}

function minutes(s: number): number {
  return Math.round(s / 60);
}

function pct(v: number): number {
  return Math.round(v * 1000) / 10;
}

function cost(seconds: number, rate: number): number {
  return Math.round((seconds / 3600) * rate * 100) / 100;
}

function localTimeOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function styleHeader(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  row.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (ws.columnCount > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }
}

function setColFmt(ws: ExcelJS.Worksheet, keys: string[], fmt: string): void {
  for (const k of keys) {
    ws.getColumn(k).numFmt = fmt;
  }
}

export async function exportExcel(rows: DayStats[], filePath: string, opts: ExportOptions): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DevPulse';
  wb.created = new Date(opts.generatedAt);

  buildResumen(wb, rows, opts);
  buildProyectos(wb, rows, opts);
  buildDiario(wb, rows, opts);
  buildAgrupado(wb, 'Semanal', 'Semana', rows, (r) => isoWeekOf(r.date), opts);
  buildAgrupado(wb, 'Mensual', 'Mes', rows, (r) => monthOf(r.date), opts);
  buildLenguajes(wb, rows);
  buildSesiones(wb, rows);
  buildHorasDelDia(wb, rows);
  if (opts.signature) {
    buildVerificacion(wb, rows, opts);
  }

  await wb.xlsx.writeFile(filePath);
}

function buildResumen(wb: ExcelJS.Workbook, rows: DayStats[], opts: ExportOptions): void {
  const ws = wb.addWorksheet('Resumen');
  const total = summarize(rows);
  const dates = rows.map((r) => r.date).sort();
  const first = dates[0] ?? '-';
  const last = dates[dates.length - 1] ?? '-';
  const weeks = new Set(rows.filter((r) => r.activeSeconds > 0).map((r) => isoWeekOf(r.date))).size;
  const months = new Set(rows.filter((r) => r.activeSeconds > 0).map((r) => monthOf(r.date))).size;
  const activeDates = rows.filter((r) => r.activeSeconds > 0).map((r) => r.date);
  const st = streaks(activeDates, opts.today);
  const series = dailySeries(rows, 90, opts.today).map((p) => p.seconds);
  const consistency = consistencyScore(series);
  const peak = peakHour(hourlyTotals(rows));

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 22;

  const title = ws.getCell('A1');
  title.value = 'DevPulse — Informe de dedicación';
  title.font = { bold: true, size: 16 };
  ws.getCell('A2').value = `Generado: ${new Date(opts.generatedAt).toLocaleString('es-ES')}`;
  ws.getCell('A3').value = `Periodo con datos: ${first} a ${last}`;

  const kpis: [string, number | string, string?][] = [
    ['Horas activas totales', hoursDec(total.activeSeconds), '0.00'],
    ['Tiempo activo (h:mm)', excelDur(total.activeSeconds), DUR_FMT],
    ['Horas en primer plano', hoursDec(total.foregroundSeconds), '0.00'],
    ['Horas en segundo plano', hoursDec(total.backgroundSeconds), '0.00'],
    ['Días activos', total.activeDays],
    ['Media por día activo (h)', hoursDec(total.avgSecondsPerActiveDay), '0.00'],
    ['Media semanal (h)', weeks > 0 ? hoursDec(total.activeSeconds / weeks) : 0, '0.00'],
    ['Media mensual (h)', months > 0 ? hoursDec(total.activeSeconds / months) : 0, '0.00'],
    ['Sesiones de trabajo', total.sessionCount],
    ['Duración media de sesión (min)', minutes(total.avgSessionSeconds)],
    ['Ratio de foco (%)', pct(total.focusRatio), '0.0'],
    ['Ratio primer plano (%)', pct(total.attentionRatio), '0.0'],
    ['Líneas añadidas', total.linesAdded],
    ['Líneas eliminadas', total.linesDeleted],
    ['Líneas netas', total.netLines],
    ['Líneas netas por hora', Math.round(total.linesPerHour * 10) / 10, '0.0'],
    ['Archivos únicos editados', total.uniqueFiles],
    ['Racha actual (días)', st.current],
    ['Racha máxima (días)', st.longest],
    ['Consistencia (0-100)', consistency],
    ['Hora pico', peak === null ? '-' : `${String(peak).padStart(2, '0')}:00`],
  ];
  if (opts.hourlyRate > 0) {
    kpis.push([`Coste estimado (${opts.currency})`, cost(total.activeSeconds, opts.hourlyRate), '#,##0.00']);
  }

  let rowIdx = 5;
  for (const [label, value, fmt] of kpis) {
    const labelCell = ws.getCell(rowIdx, 1);
    labelCell.value = label;
    labelCell.font = { bold: true };
    const valueCell = ws.getCell(rowIdx, 2);
    valueCell.value = value as ExcelJS.CellValue;
    if (fmt) {
      valueCell.numFmt = fmt;
    }
    rowIdx++;
  }
}

function buildProyectos(wb: ExcelJS.Workbook, rows: DayStats[], opts: ExportOptions): void {
  const ws = wb.addWorksheet('Proyectos');
  ws.columns = [
    { header: 'Proyecto', key: 'project', width: 26 },
    { header: 'Ruta', key: 'path', width: 42 },
    { header: 'Horas activas', key: 'hours', width: 14 },
    { header: 'Activo (h:mm)', key: 'dur', width: 14 },
    { header: 'Primer plano (h)', key: 'fg', width: 16 },
    { header: 'Segundo plano (h)', key: 'bg', width: 17 },
    { header: 'Días activos', key: 'days', width: 12 },
    { header: 'Media h/día activo', key: 'avg', width: 17 },
    { header: 'Sesiones', key: 'sessions', width: 10 },
    { header: 'Sesión media (min)', key: 'avgSession', width: 17 },
    { header: 'Líneas +', key: 'added', width: 10 },
    { header: 'Líneas -', key: 'deleted', width: 10 },
    { header: 'Netas', key: 'net', width: 10 },
    { header: 'Archivos', key: 'files', width: 10 },
    { header: 'Ratio foco (%)', key: 'focus', width: 14 },
    { header: `Coste (${opts.currency})`, key: 'cost', width: 14 },
  ];
  const byProject = groupRows(rows, (r) => r.projectPath);
  const entries = [...byProject.entries()].sort((a, b) => {
    return summarize(b[1]).activeSeconds - summarize(a[1]).activeSeconds;
  });
  for (const [projectPath, projRows] of entries) {
    const s = summarize(projRows);
    ws.addRow({
      project: projRows[0].project,
      path: projectPath,
      hours: hoursDec(s.activeSeconds),
      dur: excelDur(s.activeSeconds),
      fg: hoursDec(s.foregroundSeconds),
      bg: hoursDec(s.backgroundSeconds),
      days: s.activeDays,
      avg: hoursDec(s.avgSecondsPerActiveDay),
      sessions: s.sessionCount,
      avgSession: minutes(s.avgSessionSeconds),
      added: s.linesAdded,
      deleted: s.linesDeleted,
      net: s.netLines,
      files: s.uniqueFiles,
      focus: pct(s.focusRatio),
      cost: cost(s.activeSeconds, opts.hourlyRate),
    });
  }
  setColFmt(ws, ['hours', 'fg', 'bg', 'avg'], '0.00');
  setColFmt(ws, ['dur'], DUR_FMT);
  setColFmt(ws, ['focus'], '0.0');
  setColFmt(ws, ['cost'], '#,##0.00');
  styleHeader(ws);
}

function buildDiario(wb: ExcelJS.Workbook, rows: DayStats[], opts: ExportOptions): void {
  const ws = wb.addWorksheet('Diario');
  ws.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Proyecto', key: 'project', width: 26 },
    { header: 'Horas activas', key: 'hours', width: 14 },
    { header: 'Activo (h:mm)', key: 'dur', width: 13 },
    { header: 'Primer plano (h:mm)', key: 'fg', width: 18 },
    { header: 'Segundo plano (h:mm)', key: 'bg', width: 19 },
    { header: 'Líneas +', key: 'added', width: 10 },
    { header: 'Líneas -', key: 'deleted', width: 10 },
    { header: 'Netas', key: 'net', width: 9 },
    { header: 'Caracteres', key: 'chars', width: 11 },
    { header: 'Guardados', key: 'saves', width: 11 },
    { header: 'Archivos', key: 'files', width: 10 },
    { header: 'Sesiones', key: 'sessions', width: 10 },
    { header: `Coste (${opts.currency})`, key: 'cost', width: 13 },
  ];
  for (const r of rows) {
    ws.addRow({
      date: r.date,
      project: r.project,
      hours: hoursDec(r.activeSeconds),
      dur: excelDur(r.activeSeconds),
      fg: excelDur(r.foregroundSeconds),
      bg: excelDur(r.backgroundSeconds),
      added: r.linesAdded,
      deleted: r.linesDeleted,
      net: r.linesAdded - r.linesDeleted,
      chars: r.charsTyped,
      saves: r.saves,
      files: r.filesTouched.length,
      sessions: r.sessions.length,
      cost: cost(r.activeSeconds, opts.hourlyRate),
    });
  }
  setColFmt(ws, ['hours'], '0.00');
  setColFmt(ws, ['dur', 'fg', 'bg'], DUR_FMT);
  setColFmt(ws, ['cost'], '#,##0.00');
  styleHeader(ws);
}

function buildAgrupado(
  wb: ExcelJS.Workbook,
  sheetName: string,
  periodLabel: string,
  rows: DayStats[],
  periodOf: (r: DayStats) => string,
  opts: ExportOptions
): void {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    { header: periodLabel, key: 'period', width: 12 },
    { header: 'Proyecto', key: 'project', width: 26 },
    { header: 'Horas activas', key: 'hours', width: 14 },
    { header: 'Activo (h:mm)', key: 'dur', width: 13 },
    { header: 'Días activos', key: 'days', width: 12 },
    { header: 'Media h/día activo', key: 'avg', width: 17 },
    { header: 'Líneas +', key: 'added', width: 10 },
    { header: 'Líneas -', key: 'deleted', width: 10 },
    { header: 'Netas', key: 'net', width: 9 },
    { header: 'Sesiones', key: 'sessions', width: 10 },
    { header: `Coste (${opts.currency})`, key: 'cost', width: 13 },
  ];
  const grouped = groupRows(rows, (r) => `${periodOf(r)}::${r.projectPath}`);
  const keys = [...grouped.keys()].sort();
  for (const key of keys) {
    const groupRowsList = grouped.get(key)!;
    const s = summarize(groupRowsList);
    ws.addRow({
      period: key.split('::')[0],
      project: groupRowsList[0].project,
      hours: hoursDec(s.activeSeconds),
      dur: excelDur(s.activeSeconds),
      days: s.activeDays,
      avg: hoursDec(s.avgSecondsPerActiveDay),
      added: s.linesAdded,
      deleted: s.linesDeleted,
      net: s.netLines,
      sessions: s.sessionCount,
      cost: cost(s.activeSeconds, opts.hourlyRate),
    });
  }
  setColFmt(ws, ['hours', 'avg'], '0.00');
  setColFmt(ws, ['dur'], DUR_FMT);
  setColFmt(ws, ['cost'], '#,##0.00');
  styleHeader(ws);
}

function buildLenguajes(wb: ExcelJS.Workbook, rows: DayStats[]): void {
  const ws = wb.addWorksheet('Lenguajes');
  ws.columns = [
    { header: 'Lenguaje', key: 'lang', width: 20 },
    { header: 'Horas activas', key: 'hours', width: 14 },
    { header: '% del total', key: 'share', width: 12 },
  ];
  const totals = languageTotals(rows);
  const totalSecs = Object.values(totals).reduce((a, b) => a + b, 0);
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  for (const [lang, secs] of entries) {
    ws.addRow({
      lang,
      hours: hoursDec(secs),
      share: totalSecs > 0 ? Math.round((secs / totalSecs) * 1000) / 10 : 0,
    });
  }
  setColFmt(ws, ['hours'], '0.00');
  setColFmt(ws, ['share'], '0.0');
  styleHeader(ws);
}

function buildSesiones(wb: ExcelJS.Workbook, rows: DayStats[]): void {
  const ws = wb.addWorksheet('Sesiones');
  ws.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Proyecto', key: 'project', width: 26 },
    { header: 'Inicio', key: 'start', width: 10 },
    { header: 'Fin', key: 'end', width: 10 },
    { header: 'Duración (min)', key: 'minutes', width: 14 },
  ];
  for (const r of rows) {
    for (const s of r.sessions) {
      ws.addRow({
        date: r.date,
        project: r.project,
        start: localTimeOf(s.start),
        end: localTimeOf(s.end),
        minutes: minutes(Math.max(0, s.end - s.start) / 1000),
      });
    }
  }
  styleHeader(ws);
}

function buildVerificacion(wb: ExcelJS.Workbook, rows: DayStats[], opts: ExportOptions): void {
  const ws = wb.addWorksheet('Verificación');
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 96;
  const sig = opts.signature!;
  const entries: [string, string][] = [
    ['Herramienta', 'DevPulse'],
    ['Generado', new Date(opts.generatedAt).toISOString()],
    ['Filas incluidas', String(rows.length)],
    ['Proyectos incluidos', [...new Set(rows.map((r) => r.project))].sort().join(', ')],
    ['Huella de la clave de firma', sig.fingerprint],
    ['SHA-256 de los datos', sig.sha256Rows],
    ['Firma Ed25519 (base64)', sig.signatureB64],
    [
      'Cómo verificar',
      'Este informe se entrega junto a un fichero .firma.json. Con el comando "DevPulse: Verificar una exportación firmada" se comprueba que ni el informe ni los datos han sido modificados, y la huella identifica la instalación que lo emitió.',
    ],
  ];
  let rowIdx = 1;
  for (const [label, value] of entries) {
    const labelCell = ws.getCell(rowIdx, 1);
    labelCell.value = label;
    labelCell.font = { bold: true };
    const valueCell = ws.getCell(rowIdx, 2);
    valueCell.value = value;
    valueCell.alignment = { wrapText: true, vertical: 'top' };
    rowIdx++;
  }
}

function buildHorasDelDia(wb: ExcelJS.Workbook, rows: DayStats[]): void {
  const ws = wb.addWorksheet('Horas del día');
  ws.columns = [
    { header: 'Hora', key: 'hour', width: 8 },
    { header: 'Horas activas', key: 'hours', width: 14 },
    { header: '% del total', key: 'share', width: 12 },
  ];
  const totals = hourlyTotals(rows);
  const totalSecs = totals.reduce((a, b) => a + b, 0);
  for (let h = 0; h < 24; h++) {
    ws.addRow({
      hour: `${String(h).padStart(2, '0')}:00`,
      hours: hoursDec(totals[h]),
      share: totalSecs > 0 ? Math.round((totals[h] / totalSecs) * 1000) / 10 : 0,
    });
  }
  setColFmt(ws, ['hours'], '0.00');
  setColFmt(ws, ['share'], '0.0');
  styleHeader(ws);
}
