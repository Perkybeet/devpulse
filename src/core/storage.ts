import { Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MAX_RUNS_PER_DAY } from './feedbackLoops';
import { DayStats, dayKey, emptyDayStats, monthOfDate } from './model';

const MONTH_FILE = /^\d{4}-\d{2}\.json$/;

interface MonthFile {
  version: number;
  days: Record<string, DayStats>;
}

/** Suma en `dst` los contadores de `src`; ambos deben ser el mismo día y proyecto. */
export function mergeDay(dst: DayStats, src: DayStats): void {
  dst.activeSeconds += src.activeSeconds;
  dst.foregroundSeconds += src.foregroundSeconds;
  dst.backgroundSeconds += src.backgroundSeconds;
  dst.terminalSeconds += src.terminalSeconds ?? 0;
  dst.linesAdded += src.linesAdded;
  dst.linesDeleted += src.linesDeleted;
  dst.charsTyped += src.charsTyped;
  dst.saves += src.saves;
  for (const f of src.filesTouched) {
    if (!dst.filesTouched.includes(f)) {
      dst.filesTouched.push(f);
    }
  }
  for (const [lang, secs] of Object.entries(src.languages)) {
    dst.languages[lang] = (dst.languages[lang] ?? 0) + secs;
  }
  for (let h = 0; h < 24; h++) {
    dst.hourly[h] += src.hourly[h] ?? 0;
  }
  dst.sessions.push(...src.sessions);
  if (src.runs) {
    dst.runs = [...(dst.runs ?? []), ...src.runs].slice(-MAX_RUNS_PER_DAY);
  }
}

/**
 * Persistencia particionada por mes en ficheros JSON (YYYY-MM.json) con
 * escritura atómica (tmp + rename). Mantiene una caché en memoria y solo
 * escribe los meses modificados.
 *
 * Cada ventana de VS Code ejecuta su propia copia de la extensión sobre el
 * mismo directorio, así que cada una escribe en su propia subcarpeta
 * (`<dir>/<instanceId>/YYYY-MM.json`). Sin esa partición, la última ventana
 * en guardar sobrescribía el trabajo registrado por las demás.
 */
export class StatsStorage {
  private readonly cache = new Map<string, MonthFile>();
  private readonly dirty = new Set<string>();
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly dir: string,
    private readonly instanceId: string = 'default'
  ) {}

  get directory(): string {
    return this.dir;
  }

  private get instanceDir(): string {
    return path.join(this.dir, this.instanceId);
  }

  private fileFor(month: string): string {
    return path.join(this.instanceDir, `${month}.json`);
  }

  private async ensureMonth(month: string): Promise<MonthFile> {
    const cached = this.cache.get(month);
    if (cached) {
      return cached;
    }
    let mf: MonthFile = { version: 1, days: {} };
    try {
      const raw = await fs.readFile(this.fileFor(month), 'utf8');
      const parsed = JSON.parse(raw) as MonthFile;
      if (parsed && typeof parsed === 'object' && parsed.days) {
        mf = parsed;
      }
    } catch {
      // Primer uso del mes o fichero ilegible: se parte de un mes vacío.
    }
    this.cache.set(month, mf);
    return mf;
  }

  async preloadMonth(month: string): Promise<void> {
    await this.ensureMonth(month);
  }

  async mutateDay(
    date: string,
    project: string,
    projectPath: string,
    fn: (d: DayStats) => void
  ): Promise<void> {
    const month = monthOfDate(date);
    const mf = await this.ensureMonth(month);
    const key = dayKey(date, projectPath);
    let d = mf.days[key];
    if (!d) {
      d = emptyDayStats(date, project, projectPath);
      mf.days[key] = d;
    }
    fn(d);
    this.dirty.add(month);
  }

  /** Lectura síncrona desde la caché; null si el mes no está cargado o no hay registro. */
  peekDay(date: string, projectPath: string): DayStats | null {
    const mf = this.cache.get(monthOfDate(date));
    return mf?.days[dayKey(date, projectPath)] ?? null;
  }

  /** Todas las filas de los meses actualmente cargados en caché. */
  cachedRows(): DayStats[] {
    const rows: DayStats[] = [];
    for (const mf of this.cache.values()) {
      for (const key of Object.keys(mf.days)) {
        rows.push(mf.days[key]);
      }
    }
    return rows;
  }

  flush(): Promise<void> {
    this.writing = this.writing.then(() => this.doFlush());
    return this.writing;
  }

  private async doFlush(): Promise<void> {
    const months = [...this.dirty];
    this.dirty.clear();
    if (months.length === 0) {
      return;
    }
    await fs.mkdir(this.instanceDir, { recursive: true });
    for (const month of months) {
      const mf = this.cache.get(month);
      if (!mf) {
        continue;
      }
      const file = this.fileFor(month);
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(mf), 'utf8');
      await fs.rename(tmp, file);
    }
  }

  /**
   * Todas las filas registradas, fusionando las particiones de todas las
   * ventanas de VS Code que hayan escrito en este directorio.
   */
  async readAllRows(): Promise<DayStats[]> {
    await this.flush();
    const merged = new Map<string, DayStats>();

    const addFile = async (file: string): Promise<void> => {
      let mf: MonthFile;
      try {
        mf = JSON.parse(await fs.readFile(file, 'utf8')) as MonthFile;
      } catch {
        return; // Fichero ilegible o a medio escribir: se ignora.
      }
      if (!mf || typeof mf !== 'object' || !mf.days) {
        return;
      }
      for (const day of Object.values(mf.days)) {
        const key = dayKey(day.date, day.projectPath);
        const prev = merged.get(key);
        if (prev) {
          mergeDay(prev, day);
        } else {
          merged.set(key, JSON.parse(JSON.stringify(day)) as DayStats);
        }
      }
    };

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(this.dir, { withFileTypes: true });
    } catch {
      // Directorio aún no creado: no hay datos en disco.
    }
    for (const entry of entries) {
      if (entry.isFile() && MONTH_FILE.test(entry.name)) {
        await addFile(path.join(this.dir, entry.name)); // Datos de versiones previas a la partición.
      } else if (entry.isDirectory()) {
        let inner: string[] = [];
        try {
          inner = await fs.readdir(path.join(this.dir, entry.name));
        } catch {
          continue;
        }
        for (const name of inner) {
          if (MONTH_FILE.test(name)) {
            await addFile(path.join(this.dir, entry.name, name));
          }
        }
      }
    }

    const rows = [...merged.values()];
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project));
    return rows;
  }

  /**
   * Mueve el directorio de datos a una copia de seguridad hermana y arranca
   * de cero. Devuelve la ruta de la copia, o null si no había datos.
   */
  async resetToBackup(stamp: string): Promise<string | null> {
    await this.flush();
    this.cache.clear();
    this.dirty.clear();
    const backup = `${this.dir}-backup-${stamp}`;
    try {
      await fs.rename(this.dir, backup);
    } catch {
      return null;
    }
    await fs.mkdir(this.dir, { recursive: true });
    return backup;
  }
}
