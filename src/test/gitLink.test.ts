import * as assert from 'assert';
import { GitLink } from '../core/gitLink';

const repo = (path: string, head?: string) => ({ rootUri: { fsPath: path }, state: { HEAD: head ? { commit: head } : undefined } });

describe('GitLink', () => {
  it('al arrancar no atribuye a hoy los commits antiguos', () => {
    const g = new GitLink();
    g.prime(repo('/w/a', 'abc123'));
    assert.strictEqual(g.observe(repo('/w/a', 'abc123'), 1000), null);
  });

  it('detecta un commit nuevo cuando cambia el HEAD', () => {
    const g = new GitLink();
    g.prime(repo('/w/a', 'abc123def456'));
    const c = g.observe(repo('/w/a', 'fedcba987654321'), 5000);
    assert.deepStrictEqual(c, { hash: 'fedcba9876', at: 5000 });
  });

  it('el mismo HEAD no se cuenta dos veces', () => {
    const g = new GitLink();
    g.prime(repo('/w/a', 'aaa'));
    g.observe(repo('/w/a', 'bbb'), 1);
    assert.strictEqual(g.observe(repo('/w/a', 'bbb'), 2), null);
  });

  it('un repositorio sin HEAD (vacío) se ignora', () => {
    const g = new GitLink();
    assert.strictEqual(g.observe(repo('/w/a'), 1), null);
  });

  it('un repositorio visto por primera vez sin prime no emite commit', () => {
    const g = new GitLink();
    assert.strictEqual(g.observe(repo('/w/nuevo', 'abc'), 1), null, 'la primera observación solo registra');
    assert.ok(g.observe(repo('/w/nuevo', 'def'), 2), 'la segunda ya detecta el cambio');
  });

  it('asocia el repositorio al proyecto más específico', () => {
    const proyectos = ['/w', '/w/cliente', '/otro'];
    assert.strictEqual(GitLink.projectOf('/w/cliente', proyectos), '/w/cliente');
    assert.strictEqual(GitLink.projectOf('/w/cliente/sub', proyectos), '/w/cliente');
    assert.strictEqual(GitLink.projectOf('/w', proyectos), '/w');
    assert.strictEqual(GitLink.projectOf('/fuera', proyectos), null);
  });

  it('un repositorio padre de un proyecto también se asocia', () => {
    assert.strictEqual(GitLink.projectOf('/mono', ['/mono/paquete-a']), '/mono/paquete-a');
  });
});
