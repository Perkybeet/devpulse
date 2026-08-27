import * as assert from 'assert';
import { countChanges } from '../core/lineCounter';

describe('countChanges', () => {
  it('teclear un carácter no suma líneas', () => {
    const d = countChanges([{ startLine: 0, endLine: 0, text: 'a' }]);
    assert.deepStrictEqual(d, { added: 0, deleted: 0, chars: 1 });
  });

  it('insertar saltos de línea suma líneas añadidas', () => {
    const d = countChanges([{ startLine: 3, endLine: 3, text: 'uno\ndos\ntres\n' }]);
    assert.strictEqual(d.added, 3);
    assert.strictEqual(d.deleted, 0);
  });

  it('borrar un rango multilinea suma líneas eliminadas', () => {
    const d = countChanges([{ startLine: 2, endLine: 5, text: '' }]);
    assert.strictEqual(d.added, 0);
    assert.strictEqual(d.deleted, 3);
    assert.strictEqual(d.chars, 0);
  });

  it('reemplazar un rango multilinea cuenta en ambos lados', () => {
    const d = countChanges([{ startLine: 0, endLine: 2, text: 'x\ny\n' }]);
    assert.strictEqual(d.added, 2);
    assert.strictEqual(d.deleted, 2);
  });

  it('suma varios cambios del mismo evento', () => {
    const d = countChanges([
      { startLine: 0, endLine: 0, text: '\n' },
      { startLine: 4, endLine: 6, text: '' },
      { startLine: 9, endLine: 9, text: 'hola' },
    ]);
    assert.deepStrictEqual(d, { added: 1, deleted: 2, chars: 5 });
  });

  it('devuelve ceros sin cambios', () => {
    assert.deepStrictEqual(countChanges([]), { added: 0, deleted: 0, chars: 0 });
  });
});
