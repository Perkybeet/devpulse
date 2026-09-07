/**
 * Bucles de retroalimentación: cuánto tardan las compilaciones y las pruebas,
 * y con qué frecuencia fallan.
 *
 * Es la categoría de métricas mejor fundamentada de todo el producto y la que
 * ningún competidor mide: describe el sistema, no a la persona. Nadie hace su
 * compilación más lenta a propósito, así que no se puede manipular, y cuando
 * empeora se puede actuar.
 */

export type RunKind = 'build' | 'test' | 'debug' | 'other';

export interface RunRecord {
  kind: RunKind;
  /** Duración en milisegundos. */
  ms: number;
  /** Terminó con código de salida cero. */
  ok: boolean;
  /** Momento de finalización, en epoch ms. */
  at: number;
}

export const MAX_RUNS_PER_DAY = 400;

const PATRON_TEST = /\b(test|tests|jest|vitest|mocha|pytest|phpunit|rspec|junit|karma|cypress|playwright|spec)\b/i;
const PATRON_BUILD = /\b(build|compile|tsc|webpack|rollup|vite|esbuild|make|gradle|maven|mvn|cargo|dotnet|bundle|dist)\b/i;

/**
 * Clasifica una ejecución por su nombre o línea de comandos. Se comprueba
 * primero "test" porque `npm run test:build` es una prueba, no una compilación.
 */
export function classifyRun(texto: string): RunKind {
  const t = (texto ?? '').trim();
  if (!t) {
    return 'other';
  }
  if (PATRON_TEST.test(t)) {
    return 'test';
  }
  if (PATRON_BUILD.test(t)) {
    return 'build';
  }
  return 'other';
}

/**
 * Percentil por interpolación lineal. Se usan percentiles y no medias porque
 * una sola compilación en frío distorsiona la media de toda la jornada.
 */
export function percentile(valores: number[], p: number): number {
  const xs = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) {
    return 0;
  }
  if (xs.length === 1) {
    return xs[0];
  }
  const pos = (xs.length - 1) * Math.min(Math.max(p, 0), 1);
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (bajo === alto) {
    return xs[bajo];
  }
  return xs[bajo] + (xs[alto] - xs[bajo]) * (pos - bajo);
}

export interface RunStats {
  total: number;
  fallos: number;
  /** Proporción de ejecuciones con código de salida distinto de cero. */
  tasaFallo: number;
  p50ms: number;
  p90ms: number;
  /** Tiempo total de espera acumulado. */
  totalMs: number;
}

export function statsDe(runs: RunRecord[], kind?: RunKind): RunStats {
  const sel = kind ? runs.filter((r) => r.kind === kind) : runs;
  const duraciones = sel.map((r) => r.ms);
  const fallos = sel.filter((r) => !r.ok).length;
  return {
    total: sel.length,
    fallos,
    tasaFallo: sel.length > 0 ? fallos / sel.length : 0,
    p50ms: percentile(duraciones, 0.5),
    p90ms: percentile(duraciones, 0.9),
    totalMs: duraciones.reduce((a, b) => a + b, 0),
  };
}

/**
 * Tiempo total de espera por compilaciones y pruebas. Es la cifra que
 * convierte una molestia difusa en un argumento: "el equipo pierde N horas al
 * mes esperando a que compile".
 */
export function tiempoDeEspera(runs: RunRecord[]): number {
  return runs.filter((r) => r.kind === 'build' || r.kind === 'test').reduce((a, r) => a + r.ms, 0);
}
