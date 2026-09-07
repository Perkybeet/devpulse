import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StatsStorage } from '../core/storage';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devpulse-storage-'));
}

describe('StatsStorage', () => {
  it('crea, muta y persiste un día; otra instancia lo relee', async () => {
    const dir = tmpDir();
    const s1 = new StatsStorage(dir);
    await s1.mutateDay('2026-08-27', 'demo', '/demo', (d) => {
      d.activeSeconds += 120;
      d.linesAdded += 10;
    });
    await s1.mutateDay('2026-08-27', 'demo', '/demo', (d) => {
      d.activeSeconds += 30;
    });
    await s1.flush();

    assert.ok(fs.existsSync(path.join(dir, 'default', '2026-08.json')));
    assert.ok(!fs.existsSync(path.join(dir, 'default', '2026-08.json.tmp')), 'no debe quedar fichero temporal');

    const s2 = new StatsStorage(dir);
    const rows = await s2.readAllRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].activeSeconds, 150);
    assert.strictEqual(rows[0].linesAdded, 10);
    assert.strictEqual(rows[0].project, 'demo');
  });

  it('separa proyectos y meses, y ordena por fecha', async () => {
    const dir = tmpDir();
    const s = new StatsStorage(dir);
    await s.mutateDay('2026-09-01', 'b', '/b', (d) => (d.activeSeconds = 1));
    await s.mutateDay('2026-08-31', 'a', '/a', (d) => (d.activeSeconds = 2));
    await s.mutateDay('2026-08-31', 'b', '/b', (d) => (d.activeSeconds = 3));
    await s.flush();
    assert.ok(fs.existsSync(path.join(dir, 'default', '2026-08.json')));
    assert.ok(fs.existsSync(path.join(dir, 'default', '2026-09.json')));
    const rows = await s.readAllRows();
    assert.deepStrictEqual(
      rows.map((r) => `${r.date}:${r.project}`),
      ['2026-08-31:a', '2026-08-31:b', '2026-09-01:b']
    );
  });

  it('peekDay lee de caché sin tocar disco', async () => {
    const dir = tmpDir();
    const s = new StatsStorage(dir);
    assert.strictEqual(s.peekDay('2026-08-27', '/demo'), null);
    await s.mutateDay('2026-08-27', 'demo', '/demo', (d) => (d.activeSeconds = 42));
    assert.strictEqual(s.peekDay('2026-08-27', '/demo')?.activeSeconds, 42);
  });

  it('ignora ficheros que no son meses y JSON corrupto', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'notas.txt'), 'hola');
    fs.writeFileSync(path.join(dir, '2026-07.json'), '{corrupto');
    const s = new StatsStorage(dir);
    const rows = await s.readAllRows();
    assert.deepStrictEqual(rows, []);
  });

  it('dos ventanas de VS Code simultáneas no se pisan los datos', async () => {
    const dir = tmpDir();
    // Ambas ventanas arrancan a la vez y precargan el mes, como hace activate().
    const ventanaA = new StatsStorage(dir, 'ventana-A');
    const ventanaB = new StatsStorage(dir, 'ventana-B');
    await ventanaA.preloadMonth('2026-09');
    await ventanaB.preloadMonth('2026-09');

    await ventanaA.mutateDay('2026-09-07', 'proyecto-A', '/w/A', (d) => (d.activeSeconds = 3600));
    await ventanaA.flush();
    await ventanaB.mutateDay('2026-09-07', 'proyecto-B', '/w/B', (d) => (d.activeSeconds = 1800));
    await ventanaB.flush();

    const rows = await ventanaA.readAllRows();
    assert.strictEqual(rows.length, 2, 'deben sobrevivir las dos jornadas');
    assert.deepStrictEqual(
      rows.map((r) => `${r.project}=${r.activeSeconds}`).sort(),
      ['proyecto-A=3600', 'proyecto-B=1800']
    );
  });

  it('fusiona sumando cuando dos ventanas comparten día y proyecto', async () => {
    const dir = tmpDir();
    const a = new StatsStorage(dir, 'A');
    const b = new StatsStorage(dir, 'B');
    await a.mutateDay('2026-09-07', 'comun', '/w/c', (d) => {
      d.activeSeconds = 600;
      d.linesAdded = 10;
      d.languages.typescript = 600;
      d.hourly[9] = 600;
      d.filesTouched.push('a.ts');
    });
    await b.mutateDay('2026-09-07', 'comun', '/w/c', (d) => {
      d.activeSeconds = 400;
      d.linesAdded = 5;
      d.languages.typescript = 400;
      d.hourly[9] = 400;
      d.filesTouched.push('a.ts', 'b.ts');
    });
    await a.flush();
    await b.flush();

    const rows = await a.readAllRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].activeSeconds, 1000);
    assert.strictEqual(rows[0].linesAdded, 15);
    assert.strictEqual(rows[0].languages.typescript, 1000);
    assert.strictEqual(rows[0].hourly[9], 1000);
    assert.deepStrictEqual(rows[0].filesTouched.sort(), ['a.ts', 'b.ts']);
  });

  it('sigue leyendo los datos escritos antes de la partición por ventana', async () => {
    const dir = tmpDir();
    fs.mkdirSync(dir, { recursive: true });
    const antiguo = {
      version: 1,
      days: {
        '2026-08-01::/viejo': {
          date: '2026-08-01', project: 'viejo', projectPath: '/viejo',
          activeSeconds: 720, foregroundSeconds: 720, backgroundSeconds: 0,
          linesAdded: 0, linesDeleted: 0, charsTyped: 0, saves: 0,
          filesTouched: [], languages: {}, hourly: new Array(24).fill(0), sessions: [],
        },
      },
    };
    fs.writeFileSync(path.join(dir, '2026-08.json'), JSON.stringify(antiguo));
    const rows = await new StatsStorage(dir, 'nueva').readAllRows();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].activeSeconds, 720);
  });

  it('resetToBackup mueve los datos y arranca de cero', async () => {
    const dir = tmpDir();
    const s = new StatsStorage(dir);
    await s.mutateDay('2026-08-27', 'demo', '/demo', (d) => (d.activeSeconds = 10));
    await s.flush();
    const backup = await s.resetToBackup('20260827');
    assert.ok(backup && fs.existsSync(backup));
    assert.ok(fs.existsSync(path.join(backup!, 'default', '2026-08.json')));
    const rows = await s.readAllRows();
    assert.deepStrictEqual(rows, []);
  });
});
