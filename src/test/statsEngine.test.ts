import * as assert from 'assert';
import { DayStats, emptyDayStats } from '../core/model';
import {
  addDays,
  consistencyScore,
  dailySeries,
  ema,
  hourlyTotals,
  isoWeekOf,
  languageTotals,
  linearTrend,
  peakHour,
  streaks,
  summarize,
} from '../core/statsEngine';

function day(date: string, secs: number, extra: Partial<DayStats> = {}): DayStats {
  const d = emptyDayStats(date, extra.project ?? 'demo', extra.projectPath ?? '/demo');
  d.activeSeconds = secs;
  d.foregroundSeconds = secs;
  return { ...d, ...extra };
}

describe('isoWeekOf', () => {
  it('calcula semanas ISO en los bordes de año', () => {
    assert.strictEqual(isoWeekOf('2026-01-01'), '2026-W01'); // jueves
    assert.strictEqual(isoWeekOf('2024-12-30'), '2025-W01'); // lunes de la W01 de 2025
    assert.strictEqual(isoWeekOf('2023-01-01'), '2022-W52'); // domingo de la W52 de 2022
    assert.strictEqual(isoWeekOf('2026-08-27'), '2026-W35');
  });
});

describe('addDays', () => {
  it('cruza meses y años', () => {
    assert.strictEqual(addDays('2026-02-28', 1), '2026-03-01');
    assert.strictEqual(addDays('2026-01-01', -1), '2025-12-31');
    assert.strictEqual(addDays('2024-02-28', 1), '2024-02-29'); // bisiesto
  });
});

describe('summarize', () => {
  it('agrega totales, ratios y sesiones', () => {
    const rows = [
      day('2026-08-01', 3600, {
        backgroundSeconds: 1800,
        linesAdded: 100,
        linesDeleted: 40,
        filesTouched: ['a.ts', 'b.ts'],
        sessions: [{ start: 0, end: 600_000 }],
      }),
      day('2026-08-02', 7200, {
        linesAdded: 50,
        linesDeleted: 10,
        filesTouched: ['a.ts', 'c.ts'],
        sessions: [{ start: 0, end: 1_200_000 }],
      }),
    ];
    const s = summarize(rows);
    assert.strictEqual(s.activeSeconds, 10800);
    assert.strictEqual(s.netLines, 100);
    assert.strictEqual(s.activeDays, 2);
    assert.strictEqual(s.avgSecondsPerActiveDay, 5400);
    assert.strictEqual(s.uniqueFiles, 3); // a.ts se repite
    assert.strictEqual(s.sessionCount, 2);
    assert.strictEqual(s.avgSessionSeconds, 900);
    assert.strictEqual(s.focusRatio, 1);
    assert.ok(Math.abs(s.attentionRatio - 10800 / 12600) < 1e-9);
    assert.ok(Math.abs(s.linesPerHour - 100 / 3) < 1e-9);
  });

  it('devuelve ceros sin filas', () => {
    const s = summarize([]);
    assert.strictEqual(s.activeSeconds, 0);
    assert.strictEqual(s.focusRatio, 0);
    assert.strictEqual(s.linesPerHour, 0);
  });
});

describe('dailySeries', () => {
  it('rellena los huecos con cero y suma proyectos del mismo día', () => {
    const rows = [
      day('2026-08-25', 100),
      day('2026-08-25', 50, { projectPath: '/otro' }),
      day('2026-08-27', 200),
    ];
    const serie = dailySeries(rows, 3, '2026-08-27');
    assert.deepStrictEqual(serie, [
      { date: '2026-08-25', seconds: 150 },
      { date: '2026-08-26', seconds: 0 },
      { date: '2026-08-27', seconds: 200 },
    ]);
  });
});

describe('ema y linearTrend', () => {
  it('una serie constante mantiene su valor', () => {
    assert.deepStrictEqual(ema([5, 5, 5], 0.3), [5, 5, 5]);
    assert.strictEqual(linearTrend([5, 5, 5]), 0);
  });
  it('la pendiente de una recta es exacta', () => {
    assert.strictEqual(linearTrend([0, 10, 20]), 10);
  });
  it('con menos de dos puntos la pendiente es cero', () => {
    assert.strictEqual(linearTrend([7]), 0);
  });
});

describe('streaks', () => {
  it('cuenta racha actual y máxima', () => {
    const st = streaks(['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-20'], '2026-08-27');
    assert.strictEqual(st.current, 3);
    assert.strictEqual(st.longest, 3);
  });
  it('la racha sigue viva si hoy aún no hay registro', () => {
    const st = streaks(['2026-08-25', '2026-08-26'], '2026-08-27');
    assert.strictEqual(st.current, 2);
  });
  it('sin días activos no hay racha', () => {
    assert.deepStrictEqual(streaks([], '2026-08-27'), { current: 0, longest: 0 });
  });
});

describe('consistencyScore', () => {
  it('dedicación idéntica puntúa 100', () => {
    assert.strictEqual(consistencyScore([3600, 3600, 3600]), 100);
  });
  it('ignora los días a cero y penaliza la variabilidad', () => {
    const score = consistencyScore([3600, 0, 0, 36000]);
    assert.ok(score < 50, `esperaba < 50, obtuve ${score}`);
  });
  it('con un solo día activo devuelve 100', () => {
    assert.strictEqual(consistencyScore([0, 3600, 0]), 100);
  });
});

describe('hourly, lenguajes y hora pico', () => {
  it('agrega histograma horario y detecta la hora pico', () => {
    const a = day('2026-08-01', 0);
    a.hourly[9] = 1000;
    a.hourly[16] = 500;
    const b = day('2026-08-02', 0);
    b.hourly[9] = 200;
    const totals = hourlyTotals([a, b]);
    assert.strictEqual(totals[9], 1200);
    assert.strictEqual(peakHour(totals), 9);
  });
  it('peakHour devuelve null sin actividad', () => {
    assert.strictEqual(peakHour(new Array(24).fill(0)), null);
  });
  it('suma segundos por lenguaje', () => {
    const a = day('2026-08-01', 0, { languages: { typescript: 100, json: 20 } });
    const b = day('2026-08-02', 0, { languages: { typescript: 50 } });
    assert.deepStrictEqual(languageTotals([a, b]), { typescript: 150, json: 20 });
  });
});
