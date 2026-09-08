import * as assert from 'assert';
import { contrastText, languageBadge, languageStyle } from '../ui/languageIcons';

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

describe('logotipos de lenguaje', () => {
  it('los lenguajes conocidos traen su logotipo, no unas iniciales', () => {
    for (const id of ['typescript', 'python', 'go', 'rust', 'docker'.replace('docker', 'dockerfile'), 'markdown']) {
      const e = languageStyle(id);
      assert.ok(e.path && e.path.length > 50, `${id} debería tener logotipo`);
    }
  });

  it('dibuja el logotipo dentro de la pastilla con el color de marca', () => {
    const html = languageBadge('typescript');
    assert.ok(html.includes('<svg'), 'debe dibujar el logotipo');
    assert.ok(html.includes('#3178c6'), 'con el color oficial de fondo');
    assert.ok(html.includes('TypeScript'), 'y el nombre como texto alternativo');
    assert.ok(!html.includes('>TS<'), 'ya no debe mostrar iniciales');
  });

  it('los lenguajes sin logotipo caen en iniciales legibles', () => {
    const html = languageBadge('lenguaje-inexistente');
    assert.ok(html.includes('sigla'), 'usa la pastilla con iniciales');
    assert.ok(!html.includes('<svg'));
  });

  it('cada lenguaje tiene su propio color, sin repeticiones confusas', () => {
    const docker = languageStyle('dockerfile');
    const compose = languageStyle('dockercompose');
    const dotenv = languageStyle('dotenv');
    assert.notStrictEqual(docker.color, dotenv.color, 'Docker y Dotenv no pueden verse igual');
    assert.strictEqual(docker.color, compose.color, 'Docker y Compose comparten marca a propósito');
    assert.ok(dotenv.path, 'Dotenv debe tener su propio logotipo');
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

describe('asegurarVisibilidad', () => {
  it('aclara las marcas casi negras para que no se pierdan en tema oscuro', () => {
    const { asegurarVisibilidad } = require('../ui/languageIcons');
    const aclarado = asegurarVisibilidad('#000000');
    assert.notStrictEqual(aclarado, '#000000');
    assert.strictEqual(languageStyle('markdown').color !== '#000000', true, 'Markdown no puede quedar en negro puro');
  });

  it('no toca los colores que ya se ven bien', () => {
    const { asegurarVisibilidad } = require('../ui/languageIcons');
    assert.strictEqual(asegurarVisibilidad('#3178c6'), '#3178c6');
    assert.strictEqual(asegurarVisibilidad('#ecd53f'), '#ecd53f');
  });
});
