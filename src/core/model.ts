import { RunRecord } from './feedbackLoops';

export interface SessionRecord {
  /** Inicio de la sesión en milisegundos epoch. */
  start: number;
  /** Fin de la sesión en milisegundos epoch. */
  end: number;
}

export interface DayStats {
  /** Fecha local en formato YYYY-MM-DD. */
  date: string;
  project: string;
  projectPath: string;
  /** Segundos con interacción reciente y ventana enfocada. */
  activeSeconds: number;
  /** Segundos con la ventana enfocada (incluye tiempo activo). */
  foregroundSeconds: number;
  /** Segundos con la ventana abierta pero sin foco, dentro del periodo de gracia. */
  backgroundSeconds: number;
  /** Segundos de tiempo activo mientras se ejecutaba un comando en el terminal integrado. */
  terminalSeconds: number;
  linesAdded: number;
  linesDeleted: number;
  charsTyped: number;
  saves: number;
  filesTouched: string[];
  /** Segundos activos por languageId. */
  languages: Record<string, number>;
  /** Segundos activos por hora local del día (24 posiciones). */
  hourly: number[];
  sessions: SessionRecord[];
  /** Compilaciones, pruebas y depuraciones ejecutadas ese día. */
  runs: RunRecord[];
  /** Caracteres escritos a mano. */
  typedChars: number;
  /** Caracteres llegados en bloque: pegados, plantillas o sugerencias aceptadas. */
  bulkChars: number;
  typedLines: number;
  bulkLines: number;
  bulkInsertions: number;
  /** Archivos del proyecto modificados fuera del editor (herramientas, agentes, scripts). */
  externalEdits: number;
  /** Commits detectados en los repositorios del proyecto. */
  commits: CommitRecord[];
}

export interface CommitRecord {
  /** Hash abreviado. */
  hash: string;
  /** Momento del commit en epoch ms. */
  at: number;
}

export const MAX_FILES_PER_DAY = 500;

export function emptyDayStats(date: string, project: string, projectPath: string): DayStats {
  return {
    date,
    project,
    projectPath,
    activeSeconds: 0,
    foregroundSeconds: 0,
    backgroundSeconds: 0,
    terminalSeconds: 0,
    linesAdded: 0,
    linesDeleted: 0,
    charsTyped: 0,
    saves: 0,
    filesTouched: [],
    languages: {},
    hourly: new Array(24).fill(0),
    sessions: [],
    runs: [],
    typedChars: 0,
    bulkChars: 0,
    typedLines: 0,
    bulkLines: 0,
    bulkInsertions: 0,
    externalEdits: 0,
    commits: [],
  };
}

export function dayKey(date: string, projectPath: string): string {
  return `${date}::${projectPath}`;
}

export function localDateOf(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function localHourOf(ms: number): number {
  return new Date(ms).getHours();
}

export function monthOfDate(date: string): string {
  return date.slice(0, 7);
}
