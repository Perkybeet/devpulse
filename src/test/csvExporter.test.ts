import * as assert from 'assert';
import { emptyDayStats } from '../core/model';
import { toCsv } from '../export/csvExporter';

describe('toCsv', () => {
  it('genera BOM, cabecera y decimales con coma', () => {
    const row = emptyDayStats('2026-08-27', 'demo', '/demo');
    row.activeSeconds = 5400; // 1,5 h
    row.linesAdded = 10;
    row.linesDeleted = 4;
    const csv = toCsv([row]);
    assert.ok(csv.startsWith('\uFEFF'), 'debe empezar con BOM UTF-8');
    const lines = csv.replace('\uFEFF', '').trimEnd().split('\r\n');
    assert.strictEqual(lines.length, 2);
    assert.ok(lines[0].startsWith('Fecha;Proyecto;Ruta;HorasActivas'));
    const cols = lines[1].split(';');
    assert.strictEqual(cols[0], '2026-08-27');
    assert.strictEqual(cols[3], '1,5');
    assert.strictEqual(cols[9], '6'); // líneas netas
  });

  it('entrecomilla campos con separador o comillas', () => {
    const row = emptyDayStats('2026-08-27', 'cliente; interno "x"', '/p');
    const csv = toCsv([row]);
    assert.ok(csv.includes('"cliente; interno ""x"""'));
  });
});
