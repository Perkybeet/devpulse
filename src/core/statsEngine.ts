import { RunRecord } from './feedbackLoops';
import { DayStats } from './model';

export interface Summary {
  activeSeconds: number;
  foregroundSeconds: number;
  backgroundSeconds: number;
  terminalSeconds: number;
  linesAdded: number;
  linesDeleted: number;
  netLines: number;
  charsTyped: number;
  saves: number;
  uniqueFiles: number;
  sessionCount: number;
  avgSessionSeconds: number;
  activeDays: number;
  avgSecondsPerActiveDay: number;
  /** Segundos activos / segundos en primer plano (concentración con foco). */
  focusRatio: number;
  /** Primer plano / (primer plano + segundo plano). */
  attentionRatio: number;
  linesPerHour: number;
}

/** Semana ISO 8601 en formato YYYY-Www (el año puede diferir del natural en los bordes). */
export function isoWeekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - day + 3); // jueves de la semana
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Thu = Date.UTC(year, 0, 4 - jan4Day + 3);
  const week = 1 + Math.round((d.getTime() - week1Thu) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function summarize(rows: DayStats[]): Summary {
  const s: Summary = {
    activeSeconds: 0,
    foregroundSeconds: 0,
    backgroundSeconds: 0,
    terminalSeconds: 0,
    linesAdded: 0,
    linesDeleted: 0,
    netLines: 0,
    charsTyped: 0,
    saves: 0,
    uniqueFiles: 0,
    sessionCount: 0,
    avgSessionSeconds: 0,
    activeDays: 0,
    avgSecondsPerActiveDay: 0,
    focusRatio: 0,
    attentionRatio: 0,
    linesPerHour: 0,
  };
  const files = new Set<string>();
  const activeDates = new Set<string>();
  let sessionSeconds = 0;
  for (const r of rows) {
    s.activeSeconds += r.activeSeconds;
    s.foregroundSeconds += r.foregroundSeconds;
    s.backgroundSeconds += r.backgroundSeconds;
    s.terminalSeconds += r.terminalSeconds ?? 0;
    s.linesAdded += r.linesAdded;
    s.linesDeleted += r.linesDeleted;
    s.charsTyped += r.charsTyped;
    s.saves += r.saves;
    if (r.activeSeconds > 0) {
      activeDates.add(r.date);
    }
    for (const f of r.filesTouched) {
      files.add(`${r.projectPath}::${f}`);
    }
    for (const sess of r.sessions) {
      s.sessionCount++;
      sessionSeconds += Math.max(0, (sess.end - sess.start) / 1000);
    }
  }
  s.netLines = s.linesAdded - s.linesDeleted;
  s.uniqueFiles = files.size;
  s.activeDays = activeDates.size;
  s.avgSecondsPerActiveDay = s.activeDays > 0 ? s.activeSeconds / s.activeDays : 0;
  s.avgSessionSeconds = s.sessionCount > 0 ? sessionSeconds / s.sessionCount : 0;
  s.focusRatio = s.foregroundSeconds > 0 ? s.activeSeconds / s.foregroundSeconds : 0;
  const attended = s.foregroundSeconds + s.backgroundSeconds;
  s.attentionRatio = attended > 0 ? s.foregroundSeconds / attended : 0;
  const hours = s.activeSeconds / 3600;
  s.linesPerHour = hours > 0 ? s.netLines / hours : 0;
  return s;
}

export function groupRows(rows: DayStats[], keyFn: (r: DayStats) => string): Map<string, DayStats[]> {
  const map = new Map<string, DayStats[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const list = map.get(k);
    if (list) {
      list.push(r);
    } else {
      map.set(k, [r]);
    }
  }
  return map;
}

/** Serie diaria de segundos activos de los últimos `days` días terminando en `today`, con huecos a cero. */
export function dailySeries(rows: DayStats[], days: number, today: string): { date: string; seconds: number }[] {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.activeSeconds);
  }
  const out: { date: string; seconds: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    out.push({ date, seconds: byDate.get(date) ?? 0 });
  }
  return out;
}

/** Media móvil exponencial de la serie. */
export function ema(values: number[], alpha: number): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (const v of values) {
    prev = prev === null ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** Pendiente por mínimos cuadrados (unidades por paso). Con menos de 2 puntos devuelve 0. */
export function linearTrend(values: number[]): number {
  const n = values.length;
  if (n < 2) {
    return 0;
  }
  const meanX = (n - 1) / 2;
  let meanY = 0;
  for (const v of values) {
    meanY += v;
  }
  meanY /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  return den === 0 ? 0 : num / den;
}

/** Rachas de días consecutivos con actividad. La racha actual admite que hoy aún no tenga registro. */
export function streaks(activeDates: Iterable<string>, today: string): { current: number; longest: number } {
  const set = new Set(activeDates);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    prev = d;
    if (run > longest) {
      longest = run;
    }
  }
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/**
 * Índice de consistencia 0-100: 100 significa dedicación idéntica todos los
 * días activos; baja cuando el coeficiente de variación crece.
 */
export function consistencyScore(dailySeconds: number[]): number {
  const active = dailySeconds.filter((v) => v > 0);
  if (active.length < 2) {
    return 100;
  }
  const mean = active.reduce((a, b) => a + b, 0) / active.length;
  const variance = active.reduce((a, b) => a + (b - mean) * (b - mean), 0) / active.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.round(100 * Math.max(0, 1 - cv));
}

export function hourlyTotals(rows: DayStats[]): number[] {
  const out = new Array(24).fill(0);
  for (const r of rows) {
    for (let h = 0; h < 24 && h < r.hourly.length; h++) {
      out[h] += r.hourly[h];
    }
  }
  return out;
}

export function languageTotals(rows: DayStats[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    for (const [lang, secs] of Object.entries(r.languages)) {
      out[lang] = (out[lang] ?? 0) + secs;
    }
  }
  return out;
}

export function peakHour(hourly: number[]): number | null {
  let best = -1;
  let bestVal = 0;
  for (let h = 0; h < hourly.length; h++) {
    if (hourly[h] > bestVal) {
      bestVal = hourly[h];
      best = h;
    }
  }
  return best >= 0 ? best : null;
}

/**
 * Sesiones de foco: bloques continuos de trabajo por encima de una duración
 * mínima.
 *
 * Se cuentan sesiones y días, nunca horas acumuladas: la investigación con
 * más de trece mil desarrolladores encontró que el total de horas en foco no
 * predice la concentración percibida, mientras que el número de sesiones y el
 * porcentaje de días con al menos una sí lo hacen.
 */
export const FOCUS_MIN_SECONDS = 15 * 60;

export function focusSessionCount(rows: DayStats[], minSeconds = FOCUS_MIN_SECONDS): number {
  let total = 0;
  for (const r of rows) {
    for (const s of r.sessions) {
      if ((s.end - s.start) / 1000 >= minSeconds) {
        total++;
      }
    }
  }
  return total;
}

export function daysWithFocusSession(rows: DayStats[], minSeconds = FOCUS_MIN_SECONDS): number {
  const dias = new Set<string>();
  for (const r of rows) {
    if (r.sessions.some((s) => (s.end - s.start) / 1000 >= minSeconds)) {
      dias.add(r.date);
    }
  }
  return dias.size;
}

/** Proporción de días activos en los que hubo al menos una sesión de foco. */
export function focusDayRatio(rows: DayStats[], minSeconds = FOCUS_MIN_SECONDS): number {
  const activos = new Set(rows.filter((r) => r.activeSeconds > 0).map((r) => r.date));
  if (activos.size === 0) {
    return 0;
  }
  return daysWithFocusSession(rows, minSeconds) / activos.size;
}

/**
 * Fragmentación: sesiones por día activo. Cuantas más sesiones cortas, más
 * troceada estuvo la jornada.
 */
export function fragmentation(rows: DayStats[]): number {
  const activos = new Set(rows.filter((r) => r.activeSeconds > 0).map((r) => r.date));
  if (activos.size === 0) {
    return 0;
  }
  const sesiones = rows.reduce((a, r) => a + r.sessions.length, 0);
  return sesiones / activos.size;
}

/** Todas las ejecuciones de compilación y prueba registradas en las filas. */
export function allRuns(rows: DayStats[]): RunRecord[] {
  const out: RunRecord[] = [];
  for (const r of rows) {
    if (r.runs) {
      out.push(...r.runs);
    }
  }
  return out;
}
