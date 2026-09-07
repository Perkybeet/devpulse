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
    const cabeceras = lines[0].split(';');
    const cols = lines[1].split(';');
    const valor = (nombre: string): string => cols[cabeceras.indexOf(nombre)];
    assert.strictEqual(valor('Fecha'), '2026-08-27');
    assert.strictEqual(valor('HorasActivas'), '1,5');
    assert.strictEqual(valor('LineasNetas'), '6');
    assert.strictEqual(valor('SegundosTerminal'), '0');
    assert.strictEqual(cabeceras.length, cols.length, 'cada fila debe tener tantos campos como cabeceras');
  });

  it('entrecomilla campos con separador o comillas', () => {
    const row = emptyDayStats('2026-08-27', 'cliente; interno "x"', '/p');
    const csv = toCsv([row]);
    assert.ok(csv.includes('"cliente; interno ""x"""'));
  });
});
