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

    assert.ok(fs.existsSync(path.join(dir, '2026-08.json')));
    assert.ok(!fs.existsSync(path.join(dir, '2026-08.json.tmp')), 'no debe quedar fichero temporal');

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
    assert.ok(fs.existsSync(path.join(dir, '2026-08.json')));
    assert.ok(fs.existsSync(path.join(dir, '2026-09.json')));
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

  it('resetToBackup mueve los datos y arranca de cero', async () => {
    const dir = tmpDir();
    const s = new StatsStorage(dir);
    await s.mutateDay('2026-08-27', 'demo', '/demo', (d) => (d.activeSeconds = 10));
    await s.flush();
    const backup = await s.resetToBackup('20260827');
    assert.ok(backup && fs.existsSync(backup));
    assert.ok(fs.existsSync(path.join(backup!, '2026-08.json')));
    const rows = await s.readAllRows();
    assert.deepStrictEqual(rows, []);
  });
});
