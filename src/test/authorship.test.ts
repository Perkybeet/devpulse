import * as assert from 'assert';
import { bulkRatio, classifyChanges, detectAssistants } from '../core/authorship';

const cambio = (text: string, extra: Partial<{ removedLines: number; isUndoRedo: boolean }> = {}) => ({
  text,
  removedLines: extra.removedLines ?? 0,
  isUndoRedo: extra.isUndoRedo ?? false,
});

describe('classifyChanges', () => {
  it('teclear letra a letra es autoría humana', () => {
    const d = classifyChanges('const x = 1;'.split('').map((ch) => cambio(ch)));
    assert.strictEqual(d.typedChars, 12);
    assert.strictEqual(d.bulkChars, 0);
    assert.strictEqual(d.bulkInsertions, 0);
  });

  it('un salto de línea con sangría automática sigue siendo tecleo', () => {
    const d = classifyChanges([cambio('\n    ')]);
    assert.strictEqual(d.typedChars, 5);
    assert.strictEqual(d.typedLines, 1);
    assert.strictEqual(d.bulkChars, 0);
  });

  it('una inserción grande de golpe es un bloque', () => {
    const fragmento = 'function suma(a: number, b: number): number {\n  return a + b;\n}\n';
    const d = classifyChanges([cambio(fragmento)]);
    assert.strictEqual(d.bulkChars, fragmento.length);
    assert.strictEqual(d.bulkLines, 3);
    assert.strictEqual(d.bulkInsertions, 1);
    assert.strictEqual(d.typedChars, 0);
  });

  it('varias líneas de una vez son bloque aunque sean cortas', () => {
    const d = classifyChanges([cambio('a\nb\nc')]);
    assert.strictEqual(d.bulkInsertions, 1);
  });

  it('deshacer y rehacer no cuentan como autoría', () => {
    const d = classifyChanges([cambio('mucho texto pegado que vuelve a aparecer', { isUndoRedo: true })]);
    assert.deepStrictEqual(d, { typedChars: 0, bulkChars: 0, typedLines: 0, bulkLines: 0, bulkInsertions: 0 });
  });

  it('borrar texto no suma autoría', () => {
    const d = classifyChanges([cambio('', { removedLines: 5 })]);
    assert.strictEqual(d.typedChars + d.bulkChars, 0);
  });

  it('una sesión mixta se reparte correctamente', () => {
    const d = classifyChanges([
      ...'let a'.split('').map((ch) => cambio(ch)),
      cambio(' = fetchAll(usuarios).filter((u) => u.activo);'),
      ...';\n'.split('').map((ch) => cambio(ch)),
    ]);
    assert.strictEqual(d.typedChars, 7);
    assert.strictEqual(d.bulkChars, 46);
    assert.strictEqual(d.bulkInsertions, 1);
  });
});

describe('bulkRatio', () => {
  it('calcula la proporción y no divide por cero', () => {
    assert.strictEqual(bulkRatio({ typedChars: 25, bulkChars: 75 }), 0.75);
    assert.strictEqual(bulkRatio({ typedChars: 0, bulkChars: 0 }), 0);
  });
});

describe('detectAssistants', () => {
  it('reconoce asistentes instalados sin distinguir mayúsculas', () => {
    const lista = detectAssistants(['GitHub.copilot', 'ms-python.python', 'Anthropic.claude-code', 'github.copilot']);
    assert.deepStrictEqual(lista, ['Claude Code', 'GitHub Copilot']);
  });

  it('sin asistentes devuelve lista vacía', () => {
    assert.deepStrictEqual(detectAssistants(['ms-python.python', 'esbenp.prettier-vscode']), []);
  });
});
