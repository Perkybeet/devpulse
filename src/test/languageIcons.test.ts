import * as assert from 'assert';
import { contrastText, languageStyle } from '../ui/languageIcons';

describe('languageStyle', () => {
  it('devuelve el color oficial de los lenguajes conocidos', () => {
    assert.strictEqual(languageStyle('typescript').color, '#3178c6');
    assert.strictEqual(languageStyle('TypeScript').color, '#3178c6', 'no distingue mayúsculas');
    assert.strictEqual(languageStyle('rust').sigla, 'RS');
    assert.strictEqual(languageStyle('go').nombre, 'Go');
  });

  it('inventa una pastilla razonable para lenguajes desconocidos', () => {
    const s = languageStyle('brainfuck');
    assert.strictEqual(s.sigla, 'BR');
    assert.strictEqual(s.nombre, 'Brainfuck');
    assert.ok(s.color.startsWith('#'));
  });

  it('tolera valores vacíos', () => {
    const s = languageStyle('');
    assert.ok(s.nombre.length > 0);
    assert.ok(s.sigla.length > 0);
  });
});

describe('contrastText', () => {
  it('elige texto oscuro sobre colores claros y claro sobre oscuros', () => {
    assert.strictEqual(contrastText('#f1e05a'), '#0d1219', 'amarillo de JavaScript');
    assert.strictEqual(contrastText('#3178c6'), '#ffffff', 'azul de TypeScript');
    assert.strictEqual(contrastText('#ffffff'), '#0d1219');
    assert.strictEqual(contrastText('#000000'), '#ffffff');
  });
});
