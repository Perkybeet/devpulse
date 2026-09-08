import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createVscodeStub, installStub, makeContext } from './vscodeStub';

/* eslint-disable @typescript-eslint/no-explicit-any */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Recoge todos los días de todas las particiones de ventana. */
function leerDias(dataDir: string): any[] {
  const salida: any[] = [];
  const visitar = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        visitar(p);
      } else if (/^\d{4}-\d{2}\.json$/.test(e.name)) {
        salida.push(...Object.values(JSON.parse(fs.readFileSync(p, 'utf8')).days));
      }
    }
  };
  visitar(dataDir);
  return salida;
}

describe('extensión empaquetada (humo)', function () {
  let restore: (() => void) | undefined;
  let tmp: string;
  let wsPath: string;
  let stub: any;
  let ext: any;
  let ctx: any;
  let api: any;

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devpulse-smoke-'));
    wsPath = path.join(tmp, 'proyecto-demo');
    fs.mkdirSync(wsPath, { recursive: true });
    stub = createVscodeStub({ workspacePath: wsPath, configOverrides: { tickSeconds: 60 } });
    restore = installStub(stub);
    const bundlePath = path.resolve(__dirname, '..', '..', 'dist', 'extension.js');
    assert.ok(fs.existsSync(bundlePath), 'dist/extension.js debe existir (ejecuta npm run bundle)');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ext = require(bundlePath);
    ctx = makeContext(path.join(tmp, 'storage'));
    api = ext.activate(ctx)._test;
  });

  after(async () => {
    if (ext) {
      await ext.deactivate();
    }
    if (ctx) {
      for (const d of ctx.subscriptions) {
        d.dispose();
      }
    }
    restore?.();
  });

  it('acumula tiempo activo, horario y lenguaje con actividad y foco', async () => {
    const base = Date.now();
    const docUri = stub.Uri.file(path.join(wsPath, 'src', 'index.ts'));
    stub.window.activeTextEditor = { document: { uri: docUri, languageId: 'typescript' } };
    api.noteActivity(base);
    await api.heartbeat(base);
    for (let i = 1; i <= 12; i++) {
      api.noteActivity(base + i * 5000);
      await api.heartbeat(base + i * 5000);
    }
    await api.flush();

    const days: any[] = leerDias(api.dataDir);
    assert.ok(days.length >= 1, 'debe haber al menos un día registrado');
    const totalActive = days.reduce((a, d) => a + d.activeSeconds, 0);
    assert.ok(totalActive >= 55, `esperaba >= 55 s activos, hay ${totalActive}`);
    const tsSecs = days.reduce((a, d) => a + (d.languages.typescript ?? 0), 0);
    assert.ok(tsSecs > 0, 'debe atribuir tiempo al lenguaje typescript');
    const hourly = days.reduce((a: number, d: any) => a + d.hourly.reduce((x: number, y: number) => x + y, 0), 0);
    assert.ok(hourly >= 55, 'el histograma horario debe registrar el tiempo activo');
    assert.strictEqual(days[0].project, 'proyecto-demo');
  });

  it('registra líneas añadidas, eliminadas y archivos al editar', async () => {
    const docUri = stub.Uri.file(path.join(wsPath, 'src', 'app.ts'));
    stub._emitters.docChange.fire({
      document: { uri: docUri, languageId: 'typescript' },
      contentChanges: [
        { range: { start: { line: 0 }, end: { line: 0 } }, text: 'uno\ndos\ntres\n' },
        { range: { start: { line: 5 }, end: { line: 7 } }, text: '' },
      ],
    });
    stub._emitters.docSave.fire({ uri: docUri, languageId: 'typescript' });
    await sleep(100);
    await api.flush();

    const days: any[] = leerDias(api.dataDir);
    const added = days.reduce((a, d) => a + d.linesAdded, 0);
    const deleted = days.reduce((a, d) => a + d.linesDeleted, 0);
    const saves = days.reduce((a, d) => a + d.saves, 0);
    assert.strictEqual(added, 3);
    assert.strictEqual(deleted, 2);
    assert.strictEqual(saves, 1);
    assert.ok(days.some((d) => d.filesTouched.includes(path.join('src', 'app.ts'))));
  });

  it('registra compilaciones y pruebas con su duración y resultado', async () => {
    const t0 = Date.now();
    // Una tarea de compilación que termina bien
    stub._emitters.taskStart.fire({ execution: { task: { name: 'npm: build', definition: { type: 'npm' } } } });
    await sleep(60);
    stub._emitters.taskEnd.fire({ execution: { task: { name: 'npm: build', definition: { type: 'npm' } } }, exitCode: 0 });

    // Una ejecución de pruebas en el terminal que falla
    const ejecucion = { commandLine: { value: 'npm test' } };
    stub._emitters.shellStart.fire({ execution: ejecucion });
    await sleep(60);
    stub._emitters.shellEnd.fire({ execution: ejecucion, exitCode: 1 });

    await sleep(120);
    await api.flush();

    const runs = leerDias(api.dataDir).flatMap((d: any) => d.runs ?? []);
    const build = runs.find((r: any) => r.kind === 'build');
    const test = runs.find((r: any) => r.kind === 'test');
    assert.ok(build, `esperaba una compilación, hay: ${JSON.stringify(runs)}`);
    assert.strictEqual(build.ok, true);
    assert.ok(build.ms >= 40, `duración registrada demasiado corta: ${build.ms}`);
    assert.ok(test, 'esperaba una ejecución de pruebas');
    assert.strictEqual(test.ok, false, 'la prueba salió con código 1');
    assert.ok(build.at >= t0);
  });

  it('el tiempo de terminal cuenta como actividad sin tocar el teclado', async () => {
    const base = Date.now();
    const ejecucion = { commandLine: { value: 'npm run watch' } };
    stub._emitters.shellStart.fire({ execution: ejecucion });

    const antes = leerDias(api.dataDir).reduce((a: number, d: any) => a + (d.terminalSeconds ?? 0), 0);
    // Sin ninguna interacción de teclado: solo el comando corriendo
    await api.heartbeat(base + 600_000);
    await api.heartbeat(base + 600_000 + 30_000);
    await api.flush();
    stub._emitters.shellEnd.fire({ execution: ejecucion, exitCode: 0 });

    const despues = leerDias(api.dataDir).reduce((a: number, d: any) => a + (d.terminalSeconds ?? 0), 0);
    assert.ok(despues > antes, `el terminal debe acreditar tiempo activo (antes ${antes}, después ${despues})`);
  });

  it('distingue lo tecleado de lo insertado en bloque', async () => {
    const docUri = stub.Uri.file(path.join(wsPath, 'src', 'autoria.ts'));
    const rango = { start: { line: 0 }, end: { line: 0 } };
    const suma = (campo: string): number => leerDias(api.dataDir).reduce((a: number, d: any) => a + (d[campo] ?? 0), 0);
    await api.flush();
    const typedAntes = suma('typedChars');
    const bulkAntes = suma('bulkChars');
    const insercionesAntes = suma('bulkInsertions');
    // Tecleo humano: un carácter por evento
    for (const ch of 'let a = 1;') {
      stub._emitters.docChange.fire({ document: { uri: docUri, languageId: 'typescript' }, contentChanges: [{ range: rango, text: ch }] });
    }
    // Sugerencia aceptada o pegado: un bloque de golpe
    const bloque = 'export function total(xs: number[]): number {\n  return xs.reduce((a, b) => a + b, 0);\n}\n';
    stub._emitters.docChange.fire({ document: { uri: docUri, languageId: 'typescript' }, contentChanges: [{ range: rango, text: bloque }] });
    // Deshacer no cuenta como autoría
    stub._emitters.docChange.fire({ document: { uri: docUri, languageId: 'typescript' }, reason: 1, contentChanges: [{ range: rango, text: 'texto que reaparece al deshacer y es largo' }] });
    await sleep(120);
    await api.flush();

    assert.strictEqual(suma('typedChars') - typedAntes, 10, 'los 10 caracteres tecleados');
    assert.strictEqual(suma('bulkChars') - bulkAntes, bloque.length, 'el bloque completo, sin el deshacer');
    assert.strictEqual(suma('bulkInsertions') - insercionesAntes, 1);
  });

  it('cuenta los archivos modificados fuera del editor', async () => {
    const cerrado = stub.Uri.file(path.join(wsPath, 'src', 'generado-por-agente.ts'));
    const abierto = stub.Uri.file(path.join(wsPath, 'src', 'abierto.ts'));
    const ignorado = stub.Uri.file(path.join(wsPath, 'node_modules', 'x', 'index.js'));
    stub._abiertos.push({ uri: abierto });

    await api.onCambioEnDisco(cerrado);
    await api.onCambioEnDisco(cerrado); // el mismo archivo en menos de 2 s no se duplica
    await api.onCambioEnDisco(abierto); // ya se cuenta por el documento
    await api.onCambioEnDisco(ignorado);
    await api.flush();

    const externos = leerDias(api.dataDir).reduce((a: number, d: any) => a + (d.externalEdits ?? 0), 0);
    assert.strictEqual(externos, 1);
  });

  it('registra los commits nuevos sin atribuir los antiguos', async () => {
    await api.onRepositorio(stub._repo, true); // arranque: solo memoriza el HEAD
    stub._repo.state.HEAD.commit = 'abc123def456789';
    await api.onRepositorio(stub._repo, false);
    await api.onRepositorio(stub._repo, false); // el mismo HEAD no repite
    await api.flush();

    const commits = leerDias(api.dataDir).flatMap((d: any) => d.commits ?? []);
    assert.strictEqual(commits.length, 1);
    assert.strictEqual(commits[0].hash, 'abc123def4');
    assert.ok(commits[0].at > 0);
  });

  it('exporta un Excel válido, firmado y con las 10 hojas', async () => {
    const xlsxPath = path.join(tmp, 'informe.xlsx');
    stub._setSavePath(xlsxPath);
    await stub.commands.executeCommand('devpulse.exportExcel');
    assert.ok(fs.existsSync(xlsxPath), 'el fichero xlsx debe existir');
    assert.ok(fs.existsSync(`${xlsxPath}.firma.json`), 'debe generarse la firma .firma.json');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const sheets = ['Resumen', 'Proyectos', 'Diario', 'Semanal', 'Mensual', 'Compilaciones y pruebas', 'Lenguajes', 'Sesiones', 'Horas del día', 'Verificación'];
    for (const name of sheets) {
      assert.ok(wb.getWorksheet(name), `falta la hoja ${name}`);
    }
    assert.ok(wb.getWorksheet('Diario').rowCount >= 2, 'Diario debe tener datos');
  });

  it('exporta CSV con BOM y JSON válido', async () => {
    const csvPath = path.join(tmp, 'datos.csv');
    stub._setSavePath(csvPath);
    await stub.commands.executeCommand('devpulse.exportCsv');
    const csv = fs.readFileSync(csvPath, 'utf8');
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('Fecha;Proyecto;Ruta'));

    const jsonPath = path.join(tmp, 'datos.json');
    stub._setSavePath(jsonPath);
    await stub.commands.executeCommand('devpulse.exportJson');
    const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.ok(Array.isArray(rows) && rows.length >= 1);
    assert.ok(rows[0].date && rows[0].project);
  });

  it('permite excluir proyectos personales de la exportación', async () => {
    // Se inyecta un mes antiguo con un proyecto personal directamente en disco.
    const fakeMonth = {
      version: 1,
      days: {
        '2020-01-15::/personal': {
          date: '2020-01-15',
          project: 'personal',
          projectPath: '/personal',
          activeSeconds: 5400,
          foregroundSeconds: 5400,
          backgroundSeconds: 0,
          linesAdded: 10,
          linesDeleted: 2,
          charsTyped: 100,
          saves: 1,
          filesTouched: ['x.ts'],
          languages: { typescript: 5400 },
          hourly: new Array(24).fill(0),
          sessions: [],
        },
      },
    };
    fs.writeFileSync(path.join(api.dataDir, '2020-01.json'), JSON.stringify(fakeMonth));

    const csvPath = path.join(tmp, 'solo-trabajo.csv');
    stub._setSavePath(csvPath);
    stub._setQuickPickLabels(['proyecto-demo']); // el usuario desmarca "personal"
    await stub.commands.executeCommand('devpulse.exportCsv');
    stub._setQuickPickLabels(undefined);

    const csv = fs.readFileSync(csvPath, 'utf8');
    assert.ok(csv.includes('proyecto-demo'), 'debe incluir el proyecto de trabajo');
    assert.ok(!csv.includes('personal'), 'no debe incluir el proyecto personal');

    // La firma acompaña solo a lo exportado: tampoco contiene el proyecto personal.
    const bundle = JSON.parse(fs.readFileSync(`${csvPath}.firma.json`, 'utf8'));
    assert.deepStrictEqual(bundle.projects, ['proyecto-demo']);
  });

  it('verifica una exportación firmada y detecta la manipulación posterior', async () => {
    const xlsxPath = path.join(tmp, 'informe.xlsx');
    const sidecar = `${xlsxPath}.firma.json`;
    stub._messages.length = 0;

    stub._setOpenPath(sidecar);
    await stub.commands.executeCommand('devpulse.verifyExport');
    assert.ok(
      stub._messages.some((m: string) => m.includes('Verificación correcta')),
      `esperaba verificación correcta, mensajes: ${stub._messages.join(' | ')}`
    );

    fs.appendFileSync(xlsxPath, 'bytes extra');
    stub._messages.length = 0;
    await stub.commands.executeCommand('devpulse.verifyExport');
    assert.ok(
      stub._messages.some((m: string) => m.includes('Verificación FALLIDA')),
      `esperaba verificación fallida, mensajes: ${stub._messages.join(' | ')}`
    );
  });

  it('muestra la huella de la clave de firma', async () => {
    stub._messages.length = 0;
    await stub.commands.executeCommand('devpulse.showKeyFingerprint');
    assert.ok(stub._messages.some((m: string) => /Huella de la clave/.test(m)));
  });

  it('solo envía al servidor los proyectos marcados como de trabajo', async () => {
    // Se configura un servidor simulado interceptando la llamada de red
    await ctx.globalState.update('devpulse.serverUrl', 'https://servidor.prueba');
    await ctx.secrets.store('devpulse.serverToken', 'dmt_prueba');

    const enviados: any[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: any) => {
      enviados.push(JSON.parse(init.body));
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;

    try {
      api.classifier.marcar(wsPath, 'trabajo');
      api.classifier.marcar('/personal', 'personal');

      const base = Date.now();
      api.noteActivity(base);
      await api.heartbeat(base);
      for (let i = 1; i <= 4; i++) {
        api.noteActivity(base + i * 5000);
        await api.heartbeat(base + i * 5000);
      }
      await api.sincronizar(true);
    } finally {
      globalThis.fetch = fetchOriginal;
    }

    assert.strictEqual(enviados.length, 1, 'debe haberse enviado un latido');
    const rutas = enviados[0].projects.map((p: any) => p.path);
    assert.ok(rutas.includes(wsPath), `esperaba el proyecto de trabajo, hay: ${JSON.stringify(rutas)}`);
    assert.ok(!rutas.includes('/personal'), 'el proyecto personal no debe salir del equipo');

    // Cada minuto declarado cabe dentro de un minuto real
    for (const p of enviados[0].projects) {
      for (const m of p.minutes) {
        assert.ok(m.a <= 60 && m.f <= 60 && m.f + m.b <= 60, `minuto imposible: ${JSON.stringify(m)}`);
        assert.ok(m.a <= m.f, 'el tiempo activo no puede superar al de primer plano');
      }
    }
  });

  it('un fallo de red no pierde horas: quedan pendientes para el siguiente intento', async () => {
    await ctx.globalState.update('devpulse.serverUrl', 'https://servidor.caido');
    await ctx.secrets.store('devpulse.serverToken', 'dmt_prueba');

    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('sin conexión');
    }) as typeof fetch;

    try {
      const base = Date.now() + 3_600_000;
      api.noteActivity(base);
      await api.heartbeat(base);
      api.noteActivity(base + 5000);
      await api.heartbeat(base + 5000);
      const antes = api.outbox.pendientes;
      assert.ok(antes > 0, 'debe haber minutos en cola');
      await api.sincronizar(true);
      assert.strictEqual(api.outbox.pendientes, antes, 'nada se descarta si el envío falla');
    } finally {
      globalThis.fetch = fetchOriginal;
      await ctx.globalState.update('devpulse.serverUrl', '');
    }
  });

  it('el panel de métricas genera HTML con KPIs y gráficos', async () => {
    await stub.commands.executeCommand('devpulse.showDashboard');
    assert.strictEqual(stub._panels.length, 1);
    const html = stub._panels[0].webview.html as string;
    assert.ok(html.includes('DevPulse'));
    assert.ok(html.includes('proyecto-demo'), 'debe listar el proyecto');
    assert.ok(html.includes('<svg'), 'debe dibujar gráficos');

    for (const seccion of ['Actividad de los últimos 30 días', 'Concentración', 'Compilaciones y pruebas', 'Cuándo trabajas', 'Proyectos', 'Lenguajes']) {
      assert.ok(html.includes(seccion), `falta la sección ${seccion}`);
    }
    // Cada métrica debe poder explicarse: los botones de ayuda llevan su texto
    assert.ok(html.includes('info-globo'), 'deben existir las explicaciones');
    assert.ok(html.includes('Sesiones de foco'), 'métrica de foco presente');
    assert.ok(html.includes('En terminal'), 'métrica de terminal presente');
    // Pastilla de lenguaje con su color oficial
    assert.ok(html.includes('#3178c6'), 'el color de TypeScript debe aparecer');
    // Nada de emojis en la interfaz
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'la interfaz no debe contener emojis');
  });

  it('restablece los datos creando una copia de seguridad', async () => {
    stub._setWarningResponse('Crear copia y restablecer');
    await stub.commands.executeCommand('devpulse.resetData');
    const parent = path.dirname(api.dataDir);
    const backups = fs.readdirSync(parent).filter((f: string) => f.startsWith('data-backup-'));
    assert.strictEqual(backups.length, 1, 'debe existir exactamente una copia de seguridad');
    const backupFiles = fs.readdirSync(path.join(parent, backups[0]));
    assert.ok(backupFiles.some((f) => /^\d{4}-\d{2}\.json$/.test(f)), 'la copia debe contener los datos');
    assert.ok(fs.existsSync(api.dataDir), 'el directorio de datos debe recrearse');
    assert.strictEqual(fs.readdirSync(api.dataDir).length, 0, 'y estar vacío');
  });
});
