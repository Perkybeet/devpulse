import * as assert from 'assert';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DayStats, emptyDayStats } from '../core/model';
import { exportExcel } from '../export/excelExporter';

function fixture(): DayStats[] {
  const mk = (date: string, project: string, projectPath: string, secs: number): DayStats => {
    const d = emptyDayStats(date, project, projectPath);
    d.activeSeconds = secs;
    d.foregroundSeconds = secs + 600;
    d.backgroundSeconds = 300;
    d.linesAdded = 120;
    d.linesDeleted = 30;
    d.charsTyped = 4000;
    d.saves = 6;
    d.filesTouched = ['src/a.ts', 'src/b.ts'];
    d.languages = { typescript: secs * 0.8, json: secs * 0.2 };
    d.hourly[10] = secs;
    d.sessions = [{ start: Date.UTC(2026, 7, 1, 9, 0), end: Date.UTC(2026, 7, 1, 9, 0) + secs * 1000 }];
    return d;
  };
  return [
    mk('2026-07-30', 'alfa', '/alfa', 7200), // 2026-W31
    mk('2026-08-03', 'alfa', '/alfa', 3600), // 2026-W32
    mk('2026-08-04', 'beta', '/beta', 1800), // 2026-W32
  ];
}

describe('exportExcel', () => {
  const SHEETS = ['Resumen', 'Proyectos', 'Diario', 'Semanal', 'Mensual', 'Lenguajes', 'Sesiones', 'Horas del día'];

  it('genera un libro válido con todas las hojas y datos coherentes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devpulse-xlsx-'));
    const file = path.join(dir, 'informe.xlsx');
    await exportExcel(fixture(), file, {
      hourlyRate: 50,
      currency: 'EUR',
      today: '2026-08-27',
      generatedAt: Date.UTC(2026, 7, 27, 12, 0),
    });
    assert.ok(fs.existsSync(file));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    for (const name of SHEETS) {
      assert.ok(wb.getWorksheet(name), `falta la hoja ${name}`);
    }

    const diario = wb.getWorksheet('Diario')!;
    assert.strictEqual(diario.rowCount, 4); // cabecera + 3 días
    assert.strictEqual(diario.getCell('A2').value, '2026-07-30');
    assert.strictEqual(diario.getCell('C2').value, 2); // 7200 s = 2,00 h

    const proyectos = wb.getWorksheet('Proyectos')!;
    assert.strictEqual(proyectos.rowCount, 3); // cabecera + 2 proyectos
    assert.strictEqual(proyectos.getCell('A2').value, 'alfa'); // ordenado por horas desc
    const header = proyectos.getRow(1).values as (string | undefined)[];
    assert.ok(header.some((h) => typeof h === 'string' && h.includes('EUR')));

    const semanal = wb.getWorksheet('Semanal')!;
    const periodos = new Set<string>();
    semanal.eachRow((row, n) => {
      if (n > 1) {
        periodos.add(String(row.getCell(1).value));
      }
    });
    assert.deepStrictEqual([...periodos].sort(), ['2026-W31', '2026-W32']);

    const mensual = wb.getWorksheet('Mensual')!;
    const meses = new Set<string>();
    mensual.eachRow((row, n) => {
      if (n > 1) {
        meses.add(String(row.getCell(1).value));
      }
    });
    assert.deepStrictEqual([...meses].sort(), ['2026-07', '2026-08']);

    const lenguajes = wb.getWorksheet('Lenguajes')!;
    assert.strictEqual(lenguajes.getCell('A2').value, 'typescript'); // ordenado desc

    const sesiones = wb.getWorksheet('Sesiones')!;
    assert.strictEqual(sesiones.rowCount, 4); // cabecera + 3 sesiones

    const horas = wb.getWorksheet('Horas del día')!;
    assert.strictEqual(horas.rowCount, 25); // cabecera + 24 horas

    const resumen = wb.getWorksheet('Resumen')!;
    assert.strictEqual(resumen.getCell('A1').value, 'DevPulse — Informe de dedicación');
  });

  it('con datos de firma añade la hoja Verificación', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devpulse-xlsx-'));
    const file = path.join(dir, 'informe.xlsx');
    await exportExcel(fixture(), file, {
      hourlyRate: 0,
      currency: 'EUR',
      today: '2026-08-27',
      generatedAt: Date.UTC(2026, 7, 27, 12, 0),
      signature: { fingerprint: 'AAAA-BBBB', sha256Rows: 'abc123', signatureB64: 'ZmlybWE=' },
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ver = wb.getWorksheet('Verificación');
    assert.ok(ver, 'debe existir la hoja Verificación');
    const values: string[] = [];
    ver!.eachRow((row) => values.push(String(row.getCell(2).value ?? '')));
    assert.ok(values.includes('AAAA-BBBB'));
    assert.ok(values.includes('abc123'));
  });

  it('sin tarifa no añade la fila de coste al resumen', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devpulse-xlsx-'));
    const file = path.join(dir, 'informe.xlsx');
    await exportExcel(fixture(), file, {
      hourlyRate: 0,
      currency: 'EUR',
      today: '2026-08-27',
      generatedAt: Date.UTC(2026, 7, 27, 12, 0),
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const resumen = wb.getWorksheet('Resumen')!;
    let hasCost = false;
    resumen.eachRow((row) => {
      if (String(row.getCell(1).value ?? '').startsWith('Coste estimado')) {
        hasCost = true;
      }
    });
    assert.strictEqual(hasCost, false);
  });
});
