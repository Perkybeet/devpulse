import * as assert from 'assert';
import { classifyRun, percentile, RunRecord, statsDe, tiempoDeEspera } from '../core/feedbackLoops';

describe('classifyRun', () => {
  it('reconoce pruebas en varios lenguajes', () => {
    for (const cmd of ['npm test', 'npx jest --watch', 'pytest -q', 'cargo test', 'go test ./...', 'vitest run', 'bundle exec rspec']) {
      assert.strictEqual(classifyRun(cmd), 'test', cmd);
    }
  });

  it('reconoce compilaciones', () => {
    for (const cmd of ['npm run build', 'tsc -p .', 'cargo build --release', 'make', 'mvn package', 'vite build']) {
      assert.strictEqual(classifyRun(cmd), 'build', cmd);
    }
  });

  it('una tarea que compila para probar cuenta como prueba', () => {
    assert.strictEqual(classifyRun('npm run test:build'), 'test');
  });

  it('lo que no encaja queda como otros', () => {
    assert.strictEqual(classifyRun('git status'), 'other');
    assert.strictEqual(classifyRun(''), 'other');
    assert.strictEqual(classifyRun('   '), 'other');
  });
});

describe('percentile', () => {
  it('calcula percentiles con interpolación', () => {
    assert.strictEqual(percentile([1, 2, 3, 4], 0.5), 2.5);
    assert.strictEqual(percentile([10], 0.9), 10);
    assert.strictEqual(percentile([], 0.5), 0);
    assert.strictEqual(percentile([5, 1, 3], 0), 1);
    assert.strictEqual(percentile([5, 1, 3], 1), 5);
  });

  it('no se deja arrastrar por un valor extremo como haría la media', () => {
    const conPico = [1000, 1000, 1000, 60000];
    assert.strictEqual(percentile(conPico, 0.5), 1000);
    const media = conPico.reduce((a, b) => a + b, 0) / conPico.length;
    assert.ok(media > 15000, 'la media sí se dispara');
  });
});

function run(kind: RunRecord['kind'], ms: number, ok = true): RunRecord {
  return { kind, ms, ok, at: 0 };
}

describe('statsDe', () => {
  it('agrega totales, fallos y percentiles por tipo', () => {
    const runs = [run('build', 1000), run('build', 3000, false), run('test', 500), run('other', 99)];
    const build = statsDe(runs, 'build');
    assert.strictEqual(build.total, 2);
    assert.strictEqual(build.fallos, 1);
    assert.strictEqual(build.tasaFallo, 0.5);
    assert.strictEqual(build.p50ms, 2000);
    assert.strictEqual(build.totalMs, 4000);

    const todo = statsDe(runs);
    assert.strictEqual(todo.total, 4);
  });

  it('sin ejecuciones devuelve ceros y no divide por cero', () => {
    const s = statsDe([], 'test');
    assert.strictEqual(s.total, 0);
    assert.strictEqual(s.tasaFallo, 0);
    assert.strictEqual(s.p90ms, 0);
  });
});

describe('tiempoDeEspera', () => {
  it('suma solo compilaciones y pruebas', () => {
    const runs = [run('build', 2000), run('test', 3000), run('other', 10000), run('debug', 5000)];
    assert.strictEqual(tiempoDeEspera(runs), 5000);
  });
});
