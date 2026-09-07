import * as assert from 'assert';
import { DayStats, emptyDayStats } from '../core/model';
import {
  daysWithFocusSession,
  focusDayRatio,
  focusSessionCount,
  fragmentation,
  allRuns,
} from '../core/statsEngine';

const MIN = 60_000;

function dia(fecha: string, sesionesMin: number[], activo = 3600): DayStats {
  const d = emptyDayStats(fecha, 'demo', '/demo');
  d.activeSeconds = activo;
  let t = Date.parse(`${fecha}T09:00:00Z`);
  for (const m of sesionesMin) {
    d.sessions.push({ start: t, end: t + m * MIN });
    t += (m + 30) * MIN;
  }
  return d;
}

describe('sesiones de foco', () => {
  it('solo cuenta las sesiones que superan el mínimo', () => {
    const rows = [dia('2026-09-01', [5, 20, 45])];
    assert.strictEqual(focusSessionCount(rows), 2, 'la de 5 minutos no es foco');
    assert.strictEqual(focusSessionCount(rows, 40 * 60), 1);
  });

  it('cuenta días con al menos una sesión de foco', () => {
    const rows = [dia('2026-09-01', [30]), dia('2026-09-02', [5, 5]), dia('2026-09-03', [60])];
    assert.strictEqual(daysWithFocusSession(rows), 2);
  });

  it('la proporción de días con foco se calcula sobre días activos', () => {
    const rows = [dia('2026-09-01', [30]), dia('2026-09-02', [5])];
    assert.strictEqual(focusDayRatio(rows), 0.5);
  });

  it('sin actividad no divide por cero', () => {
    assert.strictEqual(focusDayRatio([]), 0);
    assert.strictEqual(fragmentation([]), 0);
    assert.strictEqual(focusSessionCount([]), 0);
  });

  it('la fragmentación son sesiones por día activo', () => {
    const rows = [dia('2026-09-01', [20, 20, 20]), dia('2026-09-02', [30])];
    assert.strictEqual(fragmentation(rows), 2);
  });

  it('una jornada troceada fragmenta más que una concentrada', () => {
    const troceada = [dia('2026-09-01', [6, 6, 6, 6, 6, 6, 6, 6])];
    const concentrada = [dia('2026-09-01', [120])];
    assert.ok(fragmentation(troceada) > fragmentation(concentrada));
    assert.strictEqual(focusSessionCount(troceada), 0, 'ninguna sesión llega al mínimo');
    assert.strictEqual(focusSessionCount(concentrada), 1);
  });
});

describe('allRuns', () => {
  it('reúne las ejecuciones de todas las filas y tolera datos antiguos', () => {
    const a = dia('2026-09-01', []);
    a.runs = [{ kind: 'build', ms: 1000, ok: true, at: 1 }];
    const b = dia('2026-09-02', []);
    // Fila escrita por una versión anterior, sin el campo runs
    delete (b as Partial<DayStats>).runs;
    assert.strictEqual(allRuns([a, b]).length, 1);
  });
});
