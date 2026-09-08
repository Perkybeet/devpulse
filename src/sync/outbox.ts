import { RunKind } from '../core/feedbackLoops';

/** Actividad acumulada dentro de un minuto concreto de un proyecto. */
export interface MinutoPendiente {
  minute: number;
  projectPath: string;
  projectName: string;
  date: string;
  a: number;
  f: number;
  b: number;
}

export interface ContadoresPendientes {
  projectPath: string;
  projectName: string;
  date: string;
  linesAdded: number;
  linesDeleted: number;
  charsTyped: number;
  saves: number;
  languages: Record<string, number>;
  runs: { kind: RunKind; ms: number; ok: boolean }[];
  typedChars?: number;
  bulkChars?: number;
  bulkInsertions?: number;
  externalEdits?: number;
  commits?: { hash: string; at: number }[];
}

export interface EstadoOutbox {
  minutos: Record<string, MinutoPendiente>;
  contadores: Record<string, ContadoresPendientes>;
}

const MAX_MINUTOS = 20_000;

/**
 * Cola de salida: guarda lo que aún no ha llegado al servidor.
 *
 * Los segundos se topan a 60 por minuto antes de salir, de modo que un
 * cliente manipulado no pueda declarar más tiempo del que cabe en el reloj.
 */
export class Outbox {
  private minutos = new Map<string, MinutoPendiente>();
  private contadores = new Map<string, ContadoresPendientes>();

  static clave(projectPath: string, minute: number): string {
    return `${projectPath}|${minute}`;
  }

  cargar(estado: EstadoOutbox | undefined): void {
    if (!estado) {
      return;
    }
    for (const [k, v] of Object.entries(estado.minutos ?? {})) {
      this.minutos.set(k, v);
    }
    for (const [k, v] of Object.entries(estado.contadores ?? {})) {
      this.contadores.set(k, v);
    }
  }

  serializar(): EstadoOutbox {
    return {
      minutos: Object.fromEntries(this.minutos),
      contadores: Object.fromEntries(this.contadores),
    };
  }

  anotarMinuto(m: MinutoPendiente): void {
    const clave = Outbox.clave(m.projectPath, m.minute);
    const previo = this.minutos.get(clave);
    const tope = (v: number): number => Math.min(60, Math.max(0, Math.round(v)));
    if (previo) {
      previo.a = tope(previo.a + m.a);
      previo.f = tope(previo.f + m.f);
      previo.b = tope(Math.min(previo.b + m.b, 60 - previo.f));
    } else {
      const f = tope(m.f);
      this.minutos.set(clave, {
        ...m,
        a: Math.min(tope(m.a), f),
        f,
        b: tope(Math.min(m.b, 60 - f)),
      });
    }
    if (this.minutos.size > MAX_MINUTOS) {
      const sobra = this.minutos.size - MAX_MINUTOS;
      const claves = [...this.minutos.keys()].slice(0, sobra);
      for (const k of claves) {
        this.minutos.delete(k);
      }
    }
  }

  anotarContadores(c: ContadoresPendientes): void {
    const clave = `${c.projectPath}|${c.date}`;
    const previo = this.contadores.get(clave);
    if (!previo) {
      this.contadores.set(clave, { ...c, languages: { ...c.languages }, runs: [...c.runs] });
      return;
    }
    // Los contadores llegan acumulados: se conserva el mayor visto.
    previo.linesAdded = Math.max(previo.linesAdded, c.linesAdded);
    previo.linesDeleted = Math.max(previo.linesDeleted, c.linesDeleted);
    previo.charsTyped = Math.max(previo.charsTyped, c.charsTyped);
    previo.saves = Math.max(previo.saves, c.saves);
    previo.typedChars = Math.max(previo.typedChars ?? 0, c.typedChars ?? 0);
    previo.bulkChars = Math.max(previo.bulkChars ?? 0, c.bulkChars ?? 0);
    previo.bulkInsertions = Math.max(previo.bulkInsertions ?? 0, c.bulkInsertions ?? 0);
    previo.externalEdits = Math.max(previo.externalEdits ?? 0, c.externalEdits ?? 0);
    if ((c.commits?.length ?? 0) > (previo.commits?.length ?? 0)) {
      previo.commits = [...(c.commits ?? [])];
    }
    for (const [lang, secs] of Object.entries(c.languages)) {
      previo.languages[lang] = Math.max(previo.languages[lang] ?? 0, secs);
    }
    previo.runs = c.runs.length > previo.runs.length ? [...c.runs] : previo.runs;
  }

  /** Convierte lo pendiente en el cuerpo que espera el servidor. */
  construirEnvio(instanceId: string, clientVersion: string, assistants: string[] = []): {
    cuerpo: Record<string, unknown>;
    claves: string[];
  } | null {
    if (this.minutos.size === 0 && this.contadores.size === 0) {
      return null;
    }
    const porProyecto = new Map<string, { path: string; name: string; date: string; minutes: unknown[] }>();
    const claves: string[] = [];

    for (const [clave, m] of this.minutos) {
      claves.push(clave);
      const k = `${m.projectPath}|${m.date}`;
      let entrada = porProyecto.get(k);
      if (!entrada) {
        entrada = { path: m.projectPath, name: m.projectName, date: m.date, minutes: [] };
        porProyecto.set(k, entrada);
      }
      entrada.minutes.push({ m: m.minute, a: m.a, f: m.f, b: m.b });
    }

    const proyectos = [...porProyecto.entries()].map(([k, v]) => {
      const c = this.contadores.get(k);
      return {
        path: v.path,
        name: v.name,
        date: v.date,
        minutes: v.minutes,
        linesAdded: c?.linesAdded ?? 0,
        linesDeleted: c?.linesDeleted ?? 0,
        charsTyped: c?.charsTyped ?? 0,
        saves: c?.saves ?? 0,
        languages: c?.languages ?? {},
        runs: c?.runs ?? [],
        typedChars: c?.typedChars ?? 0,
        bulkChars: c?.bulkChars ?? 0,
        bulkInsertions: c?.bulkInsertions ?? 0,
        externalEdits: c?.externalEdits ?? 0,
        commits: c?.commits ?? [],
      };
    });

    // Contadores de días sin minutos pendientes (por ejemplo, tras reenviar)
    for (const [k, c] of this.contadores) {
      if (!porProyecto.has(k)) {
        proyectos.push({
          path: c.projectPath,
          name: c.projectName,
          date: c.date,
          minutes: [],
          linesAdded: c.linesAdded,
          linesDeleted: c.linesDeleted,
          charsTyped: c.charsTyped,
          saves: c.saves,
          languages: c.languages,
          runs: c.runs,
          typedChars: c.typedChars ?? 0,
          bulkChars: c.bulkChars ?? 0,
          bulkInsertions: c.bulkInsertions ?? 0,
          externalEdits: c.externalEdits ?? 0,
          commits: c.commits ?? [],
        });
      }
    }

    return { cuerpo: { instanceId, clientVersion, assistants, projects: proyectos }, claves };
  }

  /** Elimina los minutos ya confirmados por el servidor. */
  confirmar(claves: string[]): void {
    for (const k of claves) {
      this.minutos.delete(k);
    }
  }

  get pendientes(): number {
    return this.minutos.size;
  }
}
