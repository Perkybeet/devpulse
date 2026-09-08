import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { RunKind, statsDe, tiempoDeEspera } from '../core/feedbackLoops';
import { DayStats, localDateOf } from '../core/model';
import { bulkRatio } from '../core/authorship';
import {
  addDays,
  allCommits,
  allRuns,
  consistencyScore,
  dailySeries,
  daysWithFocusSession,
  ema,
  focusDayRatio,
  focusSessionCount,
  fragmentation,
  groupRows,
  hourlyTotals,
  hoursPerCommit,
  isoWeekOf,
  languageTotals,
  linearTrend,
  peakHour,
  streaks,
  summarize,
} from '../core/statsEngine';
import { StatsStorage } from '../core/storage';
import { fmtHM, fmtHours1, fmtShortDate } from './format';
import { ICONS, infoBoton } from './icons';
import { languageBadge, languageStyle } from './languageIcons';
import { DEFS } from './metricDefs';

export interface DashboardOptions {
  /** Asistentes de IA instalados, para contextualizar la autoría. */
  assistants?: string[];
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

function ms(v: number): string {
  if (v <= 0) {
    return '—';
  }
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1).replace('.', ',')} s`;
}

export function renderHtml(rows: DayStats[], today: string, opts: DashboardOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64');

  if (rows.length === 0) {
    return pagina(
      nonce,
      today,
      `<div class="vacio-inicial">
        <div class="icono-grande">${ICONS.onda}</div>
        <h2>Todavía no hay actividad</h2>
        <p>Trabaja un rato con un proyecto abierto y vuelve a esta pestaña. DevPulse registra el tiempo
        automáticamente, sin cronómetros ni botones que recordar.</p>
      </div>`
    );
  }

  const total = summarize(rows);
  const week = isoWeekOf(today);
  const month = today.slice(0, 7);
  const suma = (pred: (r: DayStats) => boolean): number =>
    rows.filter(pred).reduce((a, r) => a + r.activeSeconds, 0);
  const todaySecs = suma((r) => r.date === today);
  const weekSecs = suma((r) => isoWeekOf(r.date) === week);
  const monthSecs = suma((r) => r.date.startsWith(month));

  const activeDates = rows.filter((r) => r.activeSeconds > 0).map((r) => r.date);
  const st = streaks(activeDates, today);
  const serie30 = dailySeries(rows, 30, today);
  const consistencia = consistencyScore(serie30.map((p) => p.seconds));
  const pico = peakHour(hourlyTotals(rows));
  const tendencia = linearTrend(dailySeries(rows, 14, today).map((p) => p.seconds));
  const rows90 = rows.filter((r) => r.date >= addDays(today, -89));

  const runs = allRuns(rows);
  const build = statsDe(runs, 'build');
  const test = statsDe(runs, 'test');
  const espera = tiempoDeEspera(runs);
  const sesionesFoco = focusSessionCount(rows);
  const diasFoco = daysWithFocusSession(rows);
  const ratioFoco = focusDayRatio(rows);
  const frag = fragmentation(rows);

  const kpis = [
    tarjeta(ICONS.reloj, 'verde', 'Hoy', fmtHM(todaySecs), DEFS.activo),
    tarjeta(ICONS.calendario, 'azul', 'Esta semana', fmtHM(weekSecs), DEFS.activo),
    tarjeta(ICONS.grafico, 'violeta', 'Este mes', fmtHM(monthSecs), DEFS.activo),
    tarjeta(ICONS.onda, 'verde', 'Total', fmtHM(total.activeSeconds), DEFS.activo, `${total.activeDays} días activos`),
    tarjeta(ICONS.terminal, 'ambar', 'En terminal', fmtHM(total.terminalSeconds), DEFS.terminal,
      total.activeSeconds > 0 ? `${Math.round((total.terminalSeconds / total.activeSeconds) * 100)} % del tiempo activo` : undefined),
    tarjeta(ICONS.llama, 'ambar', 'Racha', `${st.current} d`, DEFS.racha, `máxima de ${st.longest}`),
    tarjeta(ICONS.balanza, 'azul', 'Consistencia', `${consistencia}/100`, DEFS.consistencia, 'últimos 30 días'),
    tarjeta(ICONS.diana, 'violeta', 'Hora pico', pico === null ? '—' : `${String(pico).padStart(2, '0')}:00`, DEFS.horaPico),
  ];

  const cuerpo = `
    <div class="rejilla-kpis">${kpis.join('')}</div>

    ${seccion(ICONS.grafico, 'Actividad de los últimos 30 días', DEFS.activo)}
    ${graficoBarras(serie30, tendencia)}

    ${seccion(ICONS.diana, 'Concentración', DEFS.sesionesFoco)}
    <div class="rejilla-kpis">
      ${tarjeta(ICONS.diana, 'verde', 'Sesiones de foco', String(sesionesFoco), DEFS.sesionesFoco, 'bloques de 15 min o más')}
      ${tarjeta(ICONS.calendario, 'azul', 'Días con foco', `${Math.round(ratioFoco * 100)} %`, DEFS.diasConFoco, `${diasFoco} de ${total.activeDays} días activos`)}
      ${tarjeta(ICONS.onda, 'ambar', 'Fragmentación', frag.toFixed(1).replace('.', ','), DEFS.fragmentacion, 'sesiones por día')}
      ${tarjeta(ICONS.reloj, 'violeta', 'Sesión media', fmtHM(total.avgSessionSeconds), {
        nombre: 'Sesión media',
        calculo: 'Duración media de los bloques continuos de trabajo.',
      })}
    </div>

    ${seccion(ICONS.rayo, 'Compilaciones y pruebas', DEFS.espera)}
    ${runs.length === 0
      ? `<p class="vacio">Sin compilaciones ni pruebas registradas todavía. Aparecerán en cuanto ejecutes una tarea o un comando en el terminal.</p>`
      : `<div class="rejilla-kpis">
          ${tarjetaEjecucion(ICONS.rayo, 'azul', 'Compilaciones', build, DEFS.compilaciones)}
          ${tarjetaEjecucion(ICONS.diana, 'verde', 'Pruebas', test, DEFS.pruebas)}
          ${tarjeta(ICONS.reloj, 'ambar', 'Tiempo de espera', fmtHM(espera / 1000), DEFS.espera, 'esperando a compilar o probar')}
          ${tarjeta(ICONS.aviso, 'violeta', 'Tasa de fallo', `${Math.round(statsDe(runs).tasaFallo * 100)} %`, DEFS.tasaFallo, `${statsDe(runs).fallos} de ${runs.length}`)}
        </div>`}

    ${seccion(ICONS.codigo, 'Cómo llega el código', DEFS.autoria)}
    ${seccionAutoria(total, opts.assistants ?? [])}

    ${seccion(ICONS.rayo, 'Entregas', DEFS.commits)}
    ${seccionCommits(rows, today)}

    ${seccion(ICONS.calendario, 'Cuándo trabajas', {
      nombre: 'Mapa de actividad',
      calculo: 'Tiempo activo acumulado por día de la semana y hora, en los últimos 90 días.',
    })}
    ${heatmap(rows90)}

    ${seccion(ICONS.carpeta, 'Proyectos', {
      nombre: 'Proyectos',
      calculo: 'Tiempo dedicado a cada carpeta de proyecto abierta en el editor.',
    })}
    ${tablaProyectos(rows, today)}

    ${seccion(ICONS.codigo, 'Lenguajes', {
      nombre: 'Lenguajes',
      calculo: 'Tiempo activo atribuido al lenguaje del archivo que estaba abierto.',
    })}
    ${lenguajes(rows)}
  `;

  return pagina(nonce, today, cuerpo);
}

function pagina(nonce: string, today: string, cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>DevPulse</title>
<style>${ESTILOS}</style>
</head>
<body>
  <header class="cabecera">
    <span class="logo">${ICONS.onda}</span>
    <h1>DevPulse</h1>
    <span class="fecha">${esc(today)}</span>
    <span class="separador"></span>
    <button data-cmd="refresh" class="secundario">Actualizar</button>
    <button data-cmd="exportCsv" class="secundario">CSV</button>
    <button data-cmd="exportExcel">Exportar Excel</button>
  </header>
  <main>${cuerpo}</main>
  <script nonce="${nonce}">
    const api = acquireVsCodeApi();
    for (const b of document.querySelectorAll('button[data-cmd]')) {
      b.addEventListener('click', () => api.postMessage({ command: b.dataset.cmd }));
    }
  </script>
</body>
</html>`;
}

function seccion(icono: string, titulo: string, def?: { nombre: string; calculo: string; matiz?: string }): string {
  return `<h2 class="seccion"><span class="icono-seccion">${icono}</span>${esc(titulo)}${
    def ? infoBoton(def.nombre, def.calculo, def.matiz) : ''
  }</h2>`;
}

function tarjeta(
  icono: string,
  color: string,
  etiqueta: string,
  valor: string,
  def: { nombre: string; calculo: string; matiz?: string },
  apoyo?: string
): string {
  return `<article class="tarjeta">
    <span class="icono icono-${color}">${icono}</span>
    <span class="cuerpo">
      <span class="etiqueta">${esc(etiqueta)}${infoBoton(def.nombre, def.calculo, def.matiz)}</span>
      <span class="valor">${esc(valor)}</span>
      ${apoyo ? `<span class="apoyo">${esc(apoyo)}</span>` : ''}
    </span>
  </article>`;
}

function tarjetaEjecucion(
  icono: string,
  color: string,
  etiqueta: string,
  s: ReturnType<typeof statsDe>,
  def: { nombre: string; calculo: string; matiz?: string }
): string {
  const apoyo = s.total > 0 ? `${s.total} ejecuciones · p90 ${ms(s.p90ms)}` : 'sin datos';
  return tarjeta(icono, color, etiqueta, s.total > 0 ? ms(s.p50ms) : '—', def, apoyo);
}

function seccionAutoria(
  total: ReturnType<typeof summarize>,
  assistants: string[]
): string {
  const totalChars = total.typedChars + total.bulkChars;
  if (totalChars === 0 && total.externalEdits === 0) {
    return '<p class="vacio">Aún no hay ediciones registradas.</p>';
  }
  const ratio = bulkRatio(total);
  const pctBloque = Math.round(ratio * 100);
  const pctTecleado = 100 - pctBloque;
  const barra = `<div class="reparto" role="img" aria-label="Tecleado ${pctTecleado} por ciento, en bloque ${pctBloque} por ciento">
    <span class="tramo tramo-tecleado" style="width:${pctTecleado}%"><title>Tecleado: ${pctTecleado} %</title></span>
    <span class="tramo tramo-bloque" style="width:${pctBloque}%"><title>En bloque: ${pctBloque} %</title></span>
  </div>
  <div class="leyenda"><span class="punto punto-tecleado"></span> tecleado ${pctTecleado} % <span class="punto punto-bloque"></span> en bloque ${pctBloque} %</div>`;
  const contexto =
    assistants.length > 0
      ? `Asistentes instalados: ${assistants.map(esc).join(', ')}`
      : 'Sin asistentes de IA detectados en este editor';
  return `<div class="rejilla-kpis">
      ${tarjeta(ICONS.codigo, 'verde', 'Tecleado', formatoMiles(total.typedChars), DEFS.tecleado, 'caracteres a mano')}
      ${tarjeta(ICONS.rayo, 'azul', 'En bloque', formatoMiles(total.bulkChars), DEFS.bloque, `${total.bulkInsertions} inserciones`)}
      ${tarjeta(ICONS.terminal, 'ambar', 'Editado fuera', String(total.externalEdits), DEFS.externo, 'archivos cambiados en disco')}
      ${tarjeta(ICONS.diana, 'violeta', 'Proporción en bloque', `${pctBloque} %`, DEFS.autoria, contexto)}
    </div>
    <div class="figura">${barra}</div>`;
}

function seccionCommits(rows: DayStats[], today: string): string {
  const commits = allCommits(rows);
  if (commits.length === 0) {
    return '<p class="vacio">Sin commits detectados todavía. Se registran automáticamente al confirmar cambios en los repositorios abiertos.</p>';
  }
  const porHora = hoursPerCommit(rows);
  const serie = dailySeries(rows, 30, today);
  const commitsPorDia = new Map<string, number>();
  for (const c of commits) {
    commitsPorDia.set(c.date, (commitsPorDia.get(c.date) ?? 0) + 1);
  }
  const ultimos30 = serie.reduce((a, p) => a + (commitsPorDia.get(p.date) ?? 0), 0);
  const diasConCommit = serie.filter((p) => (commitsPorDia.get(p.date) ?? 0) > 0).length;
  const diasActivos30 = serie.filter((p) => p.seconds > 0).length;
  const sinEntrega = serie.filter((p) => p.seconds >= 2 * 3600 && !(commitsPorDia.get(p.date) ?? 0)).length;

  const puntos = serie
    .map((p) => {
      const n = commitsPorDia.get(p.date) ?? 0;
      if (n === 0) {
        return '';
      }
      return `<span class="marca-commit" title="${fmtShortDate(p.date)}: ${n} commit${n === 1 ? '' : 's'} · ${fmtHM(p.seconds)} activas">${n}</span>`;
    })
    .join('');

  return `<div class="rejilla-kpis">
      ${tarjeta(ICONS.rayo, 'verde', 'Commits (30 días)', String(ultimos30), DEFS.commits, `${diasConCommit} de ${diasActivos30} días activos con entrega`)}
      ${tarjeta(ICONS.reloj, 'azul', 'Horas por commit', porHora === null ? '—' : porHora.toFixed(1).replace('.', ','), DEFS.horasPorCommit, 'tiempo activo entre entregas')}
      ${tarjeta(ICONS.aviso, 'ambar', 'Días largos sin entrega', String(sinEntrega), DEFS.sinEntrega, '2 h o más sin ningún commit')}
      ${tarjeta(ICONS.grafico, 'violeta', 'Total registrado', String(commits.length), DEFS.commits, 'desde que se instaló')}
    </div>
    ${puntos ? `<div class="figura tira-commits">${puntos}</div>` : ''}`;
}

function formatoMiles(n: number): string {
  return n.toLocaleString('es-ES');
}

function graficoBarras(serie: { date: string; seconds: number }[], tendencia: number): string {
  const W = 760;
  const H = 210;
  const izq = 44;
  const der = 10;
  const arr = 16;
  const aba = 26;
  const aw = W - izq - der;
  const ah = H - arr - aba;
  const max = Math.max(3600, ...serie.map((p) => p.seconds));
  const paso = aw / serie.length;
  const bw = Math.max(3, Math.min(24, paso - 4));
  const y = (v: number): number => arr + ah - (v / max) * ah;

  let iMax = 0;
  serie.forEach((p, i) => {
    if (p.seconds > serie[iMax].seconds) {
      iMax = i;
    }
  });

  const partes: string[] = [];
  for (const f of [0, 0.5, 1]) {
    partes.push(`<line class="rejilla" x1="${izq}" y1="${y(max * f)}" x2="${W - der}" y2="${y(max * f)}"/>`);
    partes.push(
      `<text class="eje" x="${izq - 7}" y="${y(max * f) + 4}" text-anchor="end">${((max * f) / 3600)
        .toFixed(1)
        .replace('.', ',')} h</text>`
    );
  }
  serie.forEach((p, i) => {
    if (p.seconds <= 0) {
      return;
    }
    const h = Math.max(3, (p.seconds / max) * ah);
    partes.push(
      `<rect class="barra" x="${(izq + i * paso + (paso - bw) / 2).toFixed(1)}" y="${(arr + ah - h).toFixed(
        1
      )}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${fmtShortDate(p.date)}: ${fmtHM(
        p.seconds
      )}</title></rect>`
    );
  });
  const suave = ema(serie.map((p) => p.seconds), 0.3);
  partes.push(
    `<polyline class="media" points="${suave
      .map((v, i) => `${(izq + i * paso + paso / 2).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ')}"/>`
  );
  if (serie[iMax].seconds > 0) {
    partes.push(
      `<text class="etiqueta-dato" x="${(izq + iMax * paso + paso / 2).toFixed(1)}" y="${(
        y(serie[iMax].seconds) - 6
      ).toFixed(1)}" text-anchor="middle">${fmtHours1(serie[iMax].seconds)}</text>`
    );
  }
  for (const i of [0, Math.floor(serie.length / 2), serie.length - 1]) {
    partes.push(
      `<text class="eje" x="${(izq + i * paso + paso / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${fmtShortDate(
        serie[i].date
      )}</text>`
    );
  }

  const signo = tendencia >= 0 ? '+' : '−';
  const leyenda = `<div class="leyenda"><span class="clave media-clave"></span> media móvil · tendencia ${signo}${Math.abs(
    tendencia / 3600
  )
    .toFixed(1)
    .replace('.', ',')} h/día</div>`;

  return `<figure class="figura"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tiempo activo por día">${partes.join(
    ''
  )}</svg>${leyenda}</figure>`;
}

function heatmap(rows: DayStats[]): string {
  const m: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const r of rows) {
    const d = (new Date(`${r.date}T00:00:00`).getDay() + 6) % 7;
    for (let h = 0; h < 24; h++) {
      m[d][h] += r.hourly[h] ?? 0;
    }
  }
  const max = Math.max(1, ...m.flat());
  const c = 20;
  const g = 3;
  const padL = 26;
  const padT = 16;
  const W = padL + 24 * (c + g);
  const H = padT + 7 * (c + g);
  const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const p: string[] = [];
  for (let h = 0; h < 24; h += 4) {
    p.push(`<text class="eje" x="${padL + h * (c + g) + c / 2}" y="${padT - 5}" text-anchor="middle">${h}h</text>`);
  }
  for (let d = 0; d < 7; d++) {
    p.push(`<text class="eje" x="${padL - 7}" y="${padT + d * (c + g) + c / 2 + 3}" text-anchor="end">${dias[d]}</text>`);
    for (let h = 0; h < 24; h++) {
      const v = m[d][h];
      const op = v > 0 ? (0.14 + 0.86 * (v / max)).toFixed(2) : '1';
      p.push(
        `<rect class="${v > 0 ? 'celda' : 'celda-vacia'}" x="${padL + h * (c + g)}" y="${
          padT + d * (c + g)
        }" width="${c}" height="${c}" rx="3" fill-opacity="${op}"><title>${dias[d]} ${String(h).padStart(
          2,
          '0'
        )}:00 — ${fmtHM(v)}</title></rect>`
      );
    }
  }
  return `<figure class="figura"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Actividad por día y hora">${p.join(
    ''
  )}</svg></figure>`;
}

function tablaProyectos(rows: DayStats[], today: string): string {
  const week = isoWeekOf(today);
  const month = today.slice(0, 7);
  const grupos = [...groupRows(rows, (r) => r.projectPath).entries()]
    .map(([ruta, fila]) => ({ ruta, fila, s: summarize(fila) }))
    .sort((a, b) => b.s.activeSeconds - a.s.activeSeconds);

  const filas = grupos
    .map(({ fila, s }) => {
      const sum = (p: (r: DayStats) => boolean): number =>
        fila.filter(p).reduce((a, r) => a + r.activeSeconds, 0);
      return `<tr>
        <td><span class="proyecto" title="${esc(fila[0].projectPath)}">${esc(fila[0].project)}</span></td>
        <td class="num">${fmtHM(sum((r) => r.date === today))}</td>
        <td class="num">${fmtHM(sum((r) => isoWeekOf(r.date) === week))}</td>
        <td class="num">${fmtHM(sum((r) => r.date.startsWith(month)))}</td>
        <td class="num fuerte">${fmtHM(s.activeSeconds)}</td>
        <td class="num">${s.sessionCount}</td>
        <td class="num">${s.linesAdded > 0 || s.linesDeleted > 0 ? `<span class="mas">+${s.linesAdded}</span> <span class="menos">−${s.linesDeleted}</span>` : '—'}</td>
      </tr>`;
    })
    .join('');

  return `<div class="tabla"><table>
    <thead><tr>
      <th>Proyecto</th><th class="num">Hoy</th><th class="num">Semana</th><th class="num">Mes</th>
      <th class="num">Total</th><th class="num">Sesiones</th>
      <th class="num">Líneas ${infoBoton(DEFS.lineas.nombre, DEFS.lineas.calculo, DEFS.lineas.matiz)}</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

function lenguajes(rows: DayStats[]): string {
  const totales = Object.entries(languageTotals(rows)).sort((a, b) => b[1] - a[1]);
  if (totales.length === 0) {
    return '<p class="vacio">Sin datos de lenguajes todavía.</p>';
  }
  const suma = totales.reduce((a, [, v]) => a + v, 0);
  const max = totales[0][1];
  const top = totales.slice(0, 10);
  const filas = top
    .map(([id, secs]) => {
      const est = languageStyle(id);
      const ancho = Math.max(2, Math.round((secs / max) * 100));
      const pct = suma > 0 ? Math.round((secs / suma) * 100) : 0;
      return `<div class="lenguaje">
        ${languageBadge(id)}
        <span class="nombre-lenguaje">${esc(est.nombre)}</span>
        <span class="via"><span class="relleno" style="width:${ancho}%;background:${est.color}"></span></span>
        <span class="cifra">${fmtHours1(secs)}</span>
        <span class="pct">${pct} %</span>
      </div>`;
    })
    .join('');
  const resto = totales.length - top.length;
  return `<div class="lista-lenguajes">${filas}${
    resto > 0 ? `<div class="mas-lenguajes">y ${resto} lenguaje${resto === 1 ? '' : 's'} más</div>` : ''
  }</div>`;
}

const ESTILOS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  --acento: #1a6fd4;
  --barra: #1a6fd4;
  font-family: var(--vscode-font-family);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  margin: 0; padding: 0 28px 56px; font-size: 13px;
}
body.vscode-dark, body.vscode-high-contrast { --acento: #3794ff; --barra: #22a87e; }
main { max-width: 1060px; margin: 0 auto; }
.cabecera {
  display: flex; align-items: center; gap: 10px;
  max-width: 1060px; margin: 0 auto; padding: 16px 0 14px;
  border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 6px;
  position: sticky; top: 0; background: var(--vscode-editor-background); z-index: 30;
}
.cabecera h1 { font-size: 16px; margin: 0; font-weight: 600; letter-spacing: .01em; }
.logo { color: var(--barra); display: inline-flex; }
.fecha { color: var(--vscode-descriptionForeground); font-size: 11px; }
.separador { flex: 1; }
button {
  background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  border: none; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 12px; font-family: inherit;
}
button:hover { background: var(--vscode-button-hoverBackground); }
button.secundario { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
h2.seccion {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; text-transform: uppercase; letter-spacing: .07em;
  color: var(--vscode-descriptionForeground); font-weight: 600; margin: 30px 0 12px;
}
.icono-seccion { display: inline-flex; color: var(--acento); }
.rejilla-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 10px; }
.tarjeta {
  display: flex; gap: 11px; align-items: flex-start;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border); border-radius: 9px; padding: 12px 14px;
}
.icono { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; }
.icono-verde { background: rgba(34,168,126,.16); color: #22a87e; }
.icono-azul { background: rgba(61,142,224,.16); color: #3d8ee0; }
.icono-ambar { background: rgba(179,135,44,.18); color: #b3872c; }
.icono-violeta { background: rgba(138,111,212,.18); color: #8a6fd4; }
.cuerpo { min-width: 0; display: flex; flex-direction: column; }
.etiqueta { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); }
.valor { font-size: 21px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.3; }
.apoyo { font-size: 10px; color: var(--vscode-descriptionForeground); }
.info { position: relative; display: inline-flex; }
.info-boton { background: none; border: none; padding: 0; color: var(--vscode-descriptionForeground); display: inline-grid; place-items: center; cursor: help; line-height: 0; }
.info-boton:hover, .info-boton:focus-visible { color: var(--acento); background: none; }
.info-globo {
  position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
  width: 250px; background: var(--vscode-editorHoverWidget-background, #1b1b1b);
  border: 1px solid var(--vscode-editorHoverWidget-border, #444); border-radius: 7px;
  padding: 9px 11px; font-size: 11.5px; line-height: 1.45; color: var(--vscode-foreground);
  display: none; flex-direction: column; gap: 5px; z-index: 40; text-transform: none; letter-spacing: normal;
  font-weight: 400; box-shadow: 0 6px 20px rgba(0,0,0,.35);
}
.info-globo strong { color: var(--acento); }
.info-globo em { font-style: normal; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--vscode-panel-border); padding-top: 5px; }
.info:hover .info-globo, .info:has(.info-boton:focus-visible) .info-globo { display: flex; }
.figura { margin: 0; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 9px; padding: 12px 14px; }
.figura svg { width: 100%; height: auto; display: block; }
.barra { fill: var(--barra); }
.barra:hover { fill: var(--acento); }
.rejilla { stroke: var(--vscode-panel-border); stroke-width: 1; }
.eje { fill: var(--vscode-descriptionForeground); font-size: 9.5px; }
.etiqueta-dato { fill: var(--vscode-foreground); font-size: 10px; font-weight: 600; }
.media { fill: none; stroke: var(--vscode-descriptionForeground); stroke-width: 1.8; stroke-dasharray: 4 3; }
.celda { fill: var(--barra); }
.celda-vacia { fill: var(--vscode-panel-border); fill-opacity: .22; }
.leyenda { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--vscode-descriptionForeground); margin-top: 8px; }
.clave { width: 14px; height: 0; border-top: 1.8px dashed var(--vscode-descriptionForeground); display: inline-block; }
.tabla { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 9px; overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th { text-align: left; font-weight: 600; color: var(--vscode-descriptionForeground); padding: 9px 13px; border-bottom: 1px solid var(--vscode-panel-border); font-size: 11px; white-space: nowrap; }
th.num, td.num { text-align: right; }
td { padding: 9px 13px; border-bottom: 1px solid var(--vscode-panel-border); font-variant-numeric: tabular-nums; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: rgba(127,127,127,.07); }
td.fuerte { font-weight: 650; }
.mas { color: #22a87e; }
.menos { color: #d16969; }
.lista-lenguajes { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 9px; padding: 12px 14px; }
.lenguaje { display: grid; grid-template-columns: 22px 140px 1fr 62px 42px; align-items: center; gap: 11px; padding: 6px 0; font-size: 12px; }
.marca-lenguaje { display: inline-grid; place-items: center; width: 22px; height: 22px; }
.marca-lenguaje svg { display: block; }
.sigla { font-size: 10px; font-weight: 700; letter-spacing: .02em; }
.nombre-lenguaje { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.via { background: var(--vscode-panel-border); border-radius: 3px; height: 7px; overflow: hidden; }
.relleno { display: block; height: 100%; border-radius: 3px; }
.cifra { text-align: right; font-variant-numeric: tabular-nums; }
.pct { text-align: right; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
.mas-lenguajes { font-size: 11px; color: var(--vscode-descriptionForeground); padding-top: 6px; }
.vacio { color: var(--vscode-descriptionForeground); padding: 18px 0; }
.reparto { display: flex; height: 12px; border-radius: 6px; overflow: hidden; gap: 2px; }
.tramo { display: block; height: 100%; }
.tramo-tecleado { background: #22a87e; }
.tramo-bloque { background: #3d8ee0; }
.punto { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin: 0 4px 0 10px; }
.punto-tecleado { background: #22a87e; margin-left: 0; }
.punto-bloque { background: #3d8ee0; }
.tira-commits { display: flex; flex-wrap: wrap; gap: 6px; }
.marca-commit { display: inline-grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 6px; background: rgba(34,168,126,.16); color: #22a87e; font-size: 11px; font-weight: 600; cursor: default; }
.vacio-inicial { text-align: center; padding: 80px 20px; max-width: 460px; margin: 0 auto; }
.vacio-inicial h2 { font-size: 17px; margin: 14px 0 8px; }
.vacio-inicial p { color: var(--vscode-descriptionForeground); line-height: 1.6; }
.icono-grande { color: var(--barra); display: inline-flex; transform: scale(2.4); }
.proyecto { font-weight: 500; }
`;
