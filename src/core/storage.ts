import * as fs from 'fs/promises';
import * as path from 'path';
import { DayStats, dayKey, emptyDayStats, monthOfDate } from './model';

interface MonthFile {
  version: number;
  days: Record<string, DayStats>;
}

/**
 * Persistencia particionada por mes en ficheros JSON (YYYY-MM.json) con
 * escritura atómica (tmp + rename). Mantiene una caché en memoria y solo
 * escribe los meses modificados.
 */
export class StatsStorage {
  private readonly cache = new Map<string, MonthFile>();
  private readonly dirty = new Set<string>();
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly dir: string) {}

  get directory(): string {
    return this.dir;
  }

  private fileFor(month: string): string {
    return path.join(this.dir, `${month}.json`);
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
    await fs.mkdir(this.dir, { recursive: true });
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

  /** Todas las filas registradas (disco + caché), ordenadas por fecha. */
  async readAllRows(): Promise<DayStats[]> {
    await this.flush();
    const rows: DayStats[] = [];
    const seen = new Set<string>();
    let names: string[] = [];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      // Directorio aún no creado: no hay datos en disco.
    }
    for (const n of names) {
      if (!/^\d{4}-\d{2}\.json$/.test(n)) {
        continue;
      }
      const month = n.slice(0, 7);
      seen.add(month);
      const mf = await this.ensureMonth(month);
      for (const key of Object.keys(mf.days)) {
        rows.push(mf.days[key]);
      }
    }
    for (const [month, mf] of this.cache) {
      if (!seen.has(month)) {
        for (const key of Object.keys(mf.days)) {
          rows.push(mf.days[key]);
        }
      }
    }
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
