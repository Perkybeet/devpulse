import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { classifyRun, MAX_RUNS_PER_DAY, RunKind } from './core/feedbackLoops';
import { countChanges } from './core/lineCounter';
import { DayStats, localDateOf, localHourOf, MAX_FILES_PER_DAY, monthOfDate } from './core/model';
import { ensureKeyPair, signRows, verifySidecar, writeSidecar } from './core/signing';
import { isoWeekOf } from './core/statsEngine';
import { StatsStorage } from './core/storage';
import { ActivityTracker, TrackerOptions } from './core/tracker';
import { toCsv } from './export/csvExporter';
import { exportExcel } from './export/excelExporter';
import { DashboardPanel } from './ui/dashboard';
import { fmtHM } from './ui/format';
import { StatusBar } from './ui/statusBar';

interface DevPulseConfig {
  idleTimeoutSeconds: number;
  sessionGapSeconds: number;
  backgroundGraceSeconds: number;
  tickSeconds: number;
  hourlyRate: number;
  currency: string;
  excludedProjects: string[];
  trackTerminal: boolean;
  trackFeedbackLoops: boolean;
}

export interface TestApi {
  heartbeat(nowMs: number): Promise<void>;
  noteActivity(nowMs: number): void;
  flush(): Promise<void>;
  dataDir: string;
}

function readConfig(): DevPulseConfig {
  const c = vscode.workspace.getConfiguration('devpulse');
  return {
    idleTimeoutSeconds: c.get<number>('idleTimeoutSeconds', 120),
    sessionGapSeconds: c.get<number>('sessionGapSeconds', 600),
    backgroundGraceSeconds: c.get<number>('backgroundGraceSeconds', 1800),
    tickSeconds: c.get<number>('tickSeconds', 5),
    hourlyRate: c.get<number>('hourlyRate', 0),
    currency: c.get<string>('currency', 'EUR'),
    excludedProjects: c.get<string[]>('excludedProjects', []),
    trackTerminal: c.get<boolean>('trackTerminal', true),
    trackFeedbackLoops: c.get<boolean>('trackFeedbackLoops', true),
  };
}

/**
 * Identificador estable de esta ventana de VS Code. Los trabajadores suelen
 * tener una ventana abierta por proyecto y todas comparten el mismo
 * directorio de datos, así que cada una necesita su propia partición.
 */
function instanceIdFor(context: vscode.ExtensionContext): string {
  const KEY = 'devpulse.instanceId';
  let id = context.workspaceState.get<string>(KEY);
  if (!id) {
    id = crypto.randomUUID();
    void context.workspaceState.update(KEY, id);
  }
  return id;
}

let deactivateHook: (() => Promise<void>) | undefined;

export function activate(context: vscode.ExtensionContext): { _test: TestApi } {
  let config = readConfig();
  const trackerOpts: TrackerOptions = {
    idleTimeoutSec: config.idleTimeoutSeconds,
    sessionGapSec: config.sessionGapSeconds,
    backgroundGraceSec: config.backgroundGraceSeconds,
    maxTickGapSec: Math.max(30, config.tickSeconds * 3),
  };
  const applyTrackerOpts = (): void => {
    trackerOpts.idleTimeoutSec = config.idleTimeoutSeconds;
    trackerOpts.sessionGapSec = config.sessionGapSeconds;
    trackerOpts.backgroundGraceSec = config.backgroundGraceSeconds;
    trackerOpts.maxTickGapSec = Math.max(30, config.tickSeconds * 3);
  };
  const tracker = new ActivityTracker(trackerOpts);

  const dataDir = path.join(context.globalStorageUri.fsPath, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const storage = new StatsStorage(dataDir, instanceIdFor(context));
  const statusBar = new StatusBar();
  context.subscriptions.push(statusBar);

  let focused = vscode.window.state.focused;

  const now0 = Date.now();
  void storage.preloadMonth(monthOfDate(localDateOf(now0)));
  void storage.preloadMonth(monthOfDate(localDateOf(now0 - 31 * 86400000)));

  function currentProject(): { name: string; path: string } | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    let folder = folders[0];
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const f = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (f) {
        folder = f;
      }
    }
    if (config.excludedProjects.includes(folder.name)) {
      return null;
    }
    return { name: folder.name, path: folder.uri.fsPath };
  }

  async function onDocChange(e: vscode.TextDocumentChangeEvent): Promise<void> {
    if (e.document.uri.scheme !== 'file') {
      return;
    }
    const now = Date.now();
    tracker.noteActivity(now);
    if (e.contentChanges.length === 0) {
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(e.document.uri);
    const proj =
      folder && !config.excludedProjects.includes(folder.name)
        ? { name: folder.name, path: folder.uri.fsPath }
        : currentProject();
    if (!proj) {
      return;
    }
    const delta = countChanges(
      e.contentChanges.map((c) => ({ startLine: c.range.start.line, endLine: c.range.end.line, text: c.text }))
    );
    if (delta.added === 0 && delta.deleted === 0 && delta.chars === 0) {
      return;
    }
    const rel = vscode.workspace.asRelativePath(e.document.uri, false);
    await storage.mutateDay(localDateOf(now), proj.name, proj.path, (d) => {
      d.linesAdded += delta.added;
      d.linesDeleted += delta.deleted;
      d.charsTyped += delta.chars;
      if (d.filesTouched.length < MAX_FILES_PER_DAY && !d.filesTouched.includes(rel)) {
        d.filesTouched.push(rel);
      }
    });
  }

  async function onSave(doc: vscode.TextDocument): Promise<void> {
    if (doc.uri.scheme !== 'file') {
      return;
    }
    const now = Date.now();
    tracker.noteActivity(now);
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const proj =
      folder && !config.excludedProjects.includes(folder.name)
        ? { name: folder.name, path: folder.uri.fsPath }
        : currentProject();
    if (!proj) {
      return;
    }
    await storage.mutateDay(localDateOf(now), proj.name, proj.path, (d) => {
      d.saves += 1;
    });
  }

  /**
   * Comandos en marcha en el terminal integrado. Mientras haya alguno, el
   * tiempo cuenta como activo aunque no se toque el teclado: hoy buena parte
   * del trabajo ocurre en herramientas de línea de comandos dentro del editor,
   * y ninguna otra extensión del mercado lo contabiliza.
   */
  let terminalesOcupados = 0;

  /** Registra una compilación, prueba o depuración ya terminada. */
  async function registrarEjecucion(kind: RunKind, ms: number, ok: boolean): Promise<void> {
    if (!config.trackFeedbackLoops || kind === 'other' || ms <= 0) {
      return;
    }
    const proj = currentProject();
    if (!proj) {
      return;
    }
    const now = Date.now();
    await storage.mutateDay(localDateOf(now), proj.name, proj.path, (d) => {
      if (!d.runs) {
        d.runs = [];
      }
      d.runs.push({ kind, ms: Math.round(ms), ok, at: now });
      if (d.runs.length > MAX_RUNS_PER_DAY) {
        d.runs.splice(0, d.runs.length - MAX_RUNS_PER_DAY);
      }
    });
  }

  const inicioTareas = new Map<string, number>();
  const inicioShell = new Map<object, { at: number; kind: RunKind }>();
  const inicioDepuracion = new Map<string, number>();

  let ticking = false;
  async function heartbeat(nowMs: number): Promise<void> {
    if (ticking) {
      return;
    }
    ticking = true;
    try {
      const enTerminal = config.trackTerminal && terminalesOcupados > 0;
      if (enTerminal && focused) {
        tracker.noteActivity(nowMs);
      }
      const acc = tracker.tick(nowMs, focused);
      const proj = currentProject();
      if (proj && (acc.activeSec > 0 || acc.foregroundSec > 0 || acc.backgroundSec > 0 || acc.closedSession)) {
        const date = localDateOf(nowMs);
        const hour = localHourOf(nowMs);
        const lang = vscode.window.activeTextEditor?.document.languageId;
        await storage.mutateDay(date, proj.name, proj.path, (d) => {
          d.activeSeconds += acc.activeSec;
          d.foregroundSeconds += acc.foregroundSec;
          d.backgroundSeconds += acc.backgroundSec;
          if (enTerminal) {
            d.terminalSeconds = (d.terminalSeconds ?? 0) + acc.activeSec;
          }
          if (acc.activeSec > 0) {
            d.hourly[hour] += acc.activeSec;
            if (lang) {
              d.languages[lang] = (d.languages[lang] ?? 0) + acc.activeSec;
            }
          }
          if (acc.closedSession) {
            d.sessions.push(acc.closedSession);
          }
        });
      }
      updateStatusBar(nowMs, proj);
    } finally {
      ticking = false;
    }
  }

  function updateStatusBar(nowMs: number, proj: { name: string; path: string } | null): void {
    const date = localDateOf(nowMs);
    const rows = storage.cachedRows();
    const todayProj = proj ? storage.peekDay(date, proj.path)?.activeSeconds ?? 0 : 0;
    const todayAll = rows.filter((r) => r.date === date).reduce((a, r) => a + r.activeSeconds, 0);
    const week = isoWeekOf(date);
    const month = date.slice(0, 7);
    const weekSecs = rows.filter((r) => isoWeekOf(r.date) === week).reduce((a, r) => a + r.activeSeconds, 0);
    const monthSecs = rows.filter((r) => r.date.startsWith(month)).reduce((a, r) => a + r.activeSeconds, 0);
    statusBar.update(
      `$(watch) ${fmtHM(todayProj)}`,
      [
        proj ? `**${proj.name}** hoy: ${fmtHM(todayProj)}` : 'Sin proyecto activo',
        `Hoy (esta ventana): ${fmtHM(todayAll)}`,
        `Esta semana: ${fmtHM(weekSecs)} · Este mes: ${fmtHM(monthSecs)}`,
        'Clic para abrir el panel de DevPulse',
      ].join('\n\n')
    );
  }

  async function closeOpenSession(): Promise<void> {
    const session = tracker.closeSession();
    if (!session) {
      return;
    }
    const proj = currentProject();
    if (!proj) {
      return;
    }
    await storage.mutateDay(localDateOf(session.end), proj.name, proj.path, (d) => {
      d.sessions.push(session);
    });
  }

  const keysDir = path.join(context.globalStorageUri.fsPath, 'keys');

  /**
   * Multiselección de proyectos a exportar: permite dejar fuera los proyectos
   * personales. Con un solo proyecto no pregunta.
   */
  async function pickProjects(rows: DayStats[]): Promise<DayStats[] | null> {
    const byPath = new Map<string, { name: string; secs: number }>();
    for (const r of rows) {
      const entry = byPath.get(r.projectPath) ?? { name: r.project, secs: 0 };
      entry.secs += r.activeSeconds;
      byPath.set(r.projectPath, entry);
    }
    const items = [...byPath.entries()]
      .sort((a, b) => b[1].secs - a[1].secs)
      .map(([projectPath, e]) => ({
        label: e.name,
        description: fmtHM(e.secs),
        detail: projectPath,
        picked: true,
      }));
    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Elige qué proyectos incluir en la exportación (desmarca los personales)',
    });
    if (!picked) {
      return null;
    }
    if (picked.length === 0) {
      void vscode.window.showInformationMessage('DevPulse: no se seleccionó ningún proyecto; exportación cancelada.');
      return null;
    }
    const selected = new Set(picked.map((i) => i.detail));
    return rows.filter((r) => selected.has(r.projectPath));
  }

  async function withExportRows(fn: (rows: DayStats[]) => Promise<void>): Promise<void> {
    const all = await storage.readAllRows();
    if (all.length === 0) {
      void vscode.window.showInformationMessage('DevPulse: aún no hay datos registrados.');
      return;
    }
    const rows = await pickProjects(all);
    if (!rows) {
      return;
    }
    await fn(rows);
  }

  async function signExport(filePath: string, rows: DayStats[], generatedAtMs: number): Promise<string> {
    const keys = await ensureKeyPair(keysDir);
    return writeSidecar(filePath, rows, keys, new Date(generatedAtMs).toISOString());
  }

  async function pickSavePath(defaultName: string, filterLabel: string, ext: string): Promise<vscode.Uri | undefined> {
    return vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName)),
      filters: { [filterLabel]: [ext] },
    });
  }

  async function cmdExportExcel(): Promise<void> {
    await withExportRows(async (rows) => {
      const now = Date.now();
      const uri = await pickSavePath(`devpulse-informe-${localDateOf(now)}.xlsx`, 'Libro de Excel', 'xlsx');
      if (!uri) {
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'DevPulse: generando informe de Excel…' },
        async () => {
          const keys = await ensureKeyPair(keysDir);
          const rowsSig = signRows(rows, keys);
          await exportExcel(rows, uri.fsPath, {
            hourlyRate: config.hourlyRate,
            currency: config.currency,
            today: localDateOf(now),
            generatedAt: now,
            signature: {
              fingerprint: keys.fingerprint,
              sha256Rows: rowsSig.sha256Rows,
              signatureB64: rowsSig.signature,
            },
          });
          await signExport(uri.fsPath, rows, now);
        }
      );
      const action = await vscode.window.showInformationMessage(
        `Informe exportado y firmado: ${uri.fsPath} (entrega también el .firma.json adjunto)`,
        'Mostrar en carpeta'
      );
      if (action) {
        void vscode.commands.executeCommand('revealFileInOS', uri);
      }
    });
  }

  async function cmdExportCsv(): Promise<void> {
    await withExportRows(async (rows) => {
      const now = Date.now();
      const uri = await pickSavePath(`devpulse-datos-${localDateOf(now)}.csv`, 'CSV', 'csv');
      if (!uri) {
        return;
      }
      await fsp.writeFile(uri.fsPath, toCsv(rows), 'utf8');
      await signExport(uri.fsPath, rows, now);
      void vscode.window.showInformationMessage(`Datos exportados y firmados: ${uri.fsPath}`);
    });
  }

  async function cmdExportJson(): Promise<void> {
    await withExportRows(async (rows) => {
      const now = Date.now();
      const uri = await pickSavePath(`devpulse-datos-${localDateOf(now)}.json`, 'JSON', 'json');
      if (!uri) {
        return;
      }
      await fsp.writeFile(uri.fsPath, JSON.stringify(rows, null, 2), 'utf8');
      await signExport(uri.fsPath, rows, now);
      void vscode.window.showInformationMessage(`Datos exportados y firmados: ${uri.fsPath}`);
    });
  }

  async function cmdVerifyExport(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Verificar',
      filters: { 'Firma DevPulse (.firma.json)': ['json'] },
    });
    if (!picked || picked.length === 0) {
      return;
    }
    const res = await verifySidecar(picked[0].fsPath);
    if (res.valid) {
      const scope = res.fileChecked
        ? 'datos y fichero exportado íntegros'
        : 'datos firmados íntegros (el informe no estaba junto a la firma)';
      void vscode.window.showInformationMessage(
        `Verificación correcta: ${scope}. Huella de la clave: ${res.fingerprint}`
      );
    } else {
      void vscode.window.showErrorMessage(`Verificación FALLIDA: ${res.problems.join(' ')}`);
    }
  }

  async function cmdShowKeyFingerprint(): Promise<void> {
    const keys = await ensureKeyPair(keysDir);
    void vscode.window.showInformationMessage(
      `Huella de la clave de firma de esta instalación: ${keys.fingerprint}. Compártela con el administrador para que pueda atribuir tus exportaciones.`
    );
  }

  async function cmdResetData(): Promise<void> {
    const confirmLabel = 'Crear copia y restablecer';
    const answer = await vscode.window.showWarningMessage(
      'DevPulse moverá todos los datos registrados a una carpeta de copia de seguridad y empezará de cero. ¿Continuar?',
      { modal: true },
      confirmLabel
    );
    if (answer !== confirmLabel) {
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = await storage.resetToBackup(stamp);
    await storage.preloadMonth(monthOfDate(localDateOf(Date.now())));
    void vscode.window.showInformationMessage(
      backup ? `Datos restablecidos. Copia de seguridad en: ${backup}` : 'No había datos que restablecer.'
    );
  }

  let tickTimer: NodeJS.Timeout | undefined;
  function restartTimer(): void {
    if (tickTimer) {
      clearInterval(tickTimer);
    }
    tickTimer = setInterval(() => void heartbeat(Date.now()), config.tickSeconds * 1000);
  }
  restartTimer();
  const flushTimer = setInterval(() => void storage.flush(), 30000);

  context.subscriptions.push(
    { dispose: () => { if (tickTimer) { clearInterval(tickTimer); } clearInterval(flushTimer); } },
    vscode.window.onDidChangeWindowState((st) => {
      focused = st.focused;
      if (st.focused) {
        tracker.noteActivity(Date.now());
      }
    }),
    vscode.window.onDidChangeTextEditorSelection(() => tracker.noteActivity(Date.now())),
    vscode.window.onDidOpenTerminal(() => tracker.noteActivity(Date.now())),
    // Compilaciones y pruebas lanzadas como tareas de VS Code.
    vscode.tasks.onDidStartTask((e) => {
      inicioTareas.set(e.execution.task.name, Date.now());
      tracker.noteActivity(Date.now());
    }),
    vscode.tasks.onDidEndTaskProcess((e) => {
      const nombre = e.execution.task.name;
      const inicio = inicioTareas.get(nombre);
      inicioTareas.delete(nombre);
      if (inicio !== undefined) {
        const kind = classifyRun(`${nombre} ${e.execution.task.definition?.type ?? ''}`);
        void registrarEjecucion(kind, Date.now() - inicio, (e.exitCode ?? 0) === 0);
      }
      tracker.noteActivity(Date.now());
    }),
    vscode.debug.onDidStartDebugSession((s) => {
      inicioDepuracion.set(s.id, Date.now());
      tracker.noteActivity(Date.now());
    }),
    vscode.debug.onDidTerminateDebugSession((s) => {
      const inicio = inicioDepuracion.get(s.id);
      inicioDepuracion.delete(s.id);
      if (inicio !== undefined) {
        void registrarEjecucion('debug', Date.now() - inicio, true);
      }
    }),
    vscode.window.onDidChangeActiveTerminal(() => tracker.noteActivity(Date.now())),
    // La integración de shell existe desde VS Code 1.93; si no está, se ignora.
    vscode.window.onDidStartTerminalShellExecution?.((e) => {
      terminalesOcupados++;
      const linea = e.execution?.commandLine?.value ?? '';
      inicioShell.set(e.execution as object, { at: Date.now(), kind: classifyRun(linea) });
      tracker.noteActivity(Date.now());
    }) ?? { dispose: (): void => undefined },
    vscode.window.onDidEndTerminalShellExecution?.((e) => {
      terminalesOcupados = Math.max(0, terminalesOcupados - 1);
      const registro = inicioShell.get(e.execution as object);
      inicioShell.delete(e.execution as object);
      if (registro) {
        void registrarEjecucion(registro.kind, Date.now() - registro.at, (e.exitCode ?? 0) === 0);
      }
      tracker.noteActivity(Date.now());
    }) ?? { dispose: (): void => undefined },
    vscode.window.onDidChangeActiveTextEditor(() => tracker.noteActivity(Date.now())),
    vscode.workspace.onDidChangeTextDocument((e) => void onDocChange(e)),
    vscode.workspace.onDidSaveTextDocument((doc) => void onSave(doc)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('devpulse')) {
        config = readConfig();
        applyTrackerOpts();
        restartTimer();
      }
    }),
    vscode.commands.registerCommand('devpulse.showDashboard', () =>
      DashboardPanel.createOrShow(storage, () => ({ hourlyRate: config.hourlyRate, currency: config.currency }))
    ),
    vscode.commands.registerCommand('devpulse.exportExcel', () => cmdExportExcel()),
    vscode.commands.registerCommand('devpulse.exportCsv', () => cmdExportCsv()),
    vscode.commands.registerCommand('devpulse.exportJson', () => cmdExportJson()),
    vscode.commands.registerCommand('devpulse.verifyExport', () => cmdVerifyExport()),
    vscode.commands.registerCommand('devpulse.showKeyFingerprint', () => cmdShowKeyFingerprint()),
    vscode.commands.registerCommand('devpulse.openDataFolder', () =>
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dataDir))
    ),
    vscode.commands.registerCommand('devpulse.resetData', () => cmdResetData())
  );

  deactivateHook = async () => {
    await closeOpenSession();
    await storage.flush();
  };

  return {
    _test: {
      heartbeat,
      noteActivity: (ms: number) => tracker.noteActivity(ms),
      flush: () => storage.flush(),
      dataDir,
    },
  };
}

export function deactivate(): Thenable<void> | undefined {
  return deactivateHook?.();
}
