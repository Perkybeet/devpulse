import { CommitRecord } from './model';

/** Lo mínimo que necesitamos de la API de la extensión Git de VS Code. */
export interface RepoLike {
  rootUri: { fsPath: string };
  state: { HEAD?: { commit?: string } };
}

/**
 * Detecta commits nuevos observando el HEAD de cada repositorio. Guarda solo el
 * hash abreviado y el momento: ni mensajes, ni ramas, ni autores. Sirve para
 * contrastar la actividad registrada con entregas reales y verificables.
 */
export class GitLink {
  private readonly heads = new Map<string, string>();

  /**
   * Registra el HEAD actual sin emitir nada: al arrancar no queremos
   * atribuir a hoy commits antiguos.
   */
  prime(repo: RepoLike): void {
    const head = repo.state.HEAD?.commit;
    if (head) {
      this.heads.set(repo.rootUri.fsPath, head);
    }
  }

  /** Devuelve el commit nuevo si el HEAD cambió a uno no visto. */
  observe(repo: RepoLike, nowMs: number): CommitRecord | null {
    const head = repo.state.HEAD?.commit;
    if (!head) {
      return null;
    }
    const anterior = this.heads.get(repo.rootUri.fsPath);
    this.heads.set(repo.rootUri.fsPath, head);
    if (anterior === undefined || anterior === head) {
      return null;
    }
    return { hash: head.slice(0, 10), at: nowMs };
  }

  /**
   * Proyecto (carpeta de workspace) al que pertenece un repositorio. Gana el
   * proyecto que contiene al repositorio; si ninguno lo contiene pero el
   * repositorio engloba proyectos (monorepo), se toma el primero de ellos.
   */
  static projectOf(repoPath: string, projectPaths: readonly string[]): string | null {
    let mejor: string | null = null;
    for (const p of projectPaths) {
      const contiene = repoPath === p || repoPath.startsWith(p.endsWith('/') ? p : `${p}/`);
      if (contiene && (mejor === null || p.length > mejor.length)) {
        mejor = p;
      }
    }
    if (mejor) {
      return mejor;
    }
    for (const p of projectPaths) {
      if (p.startsWith(`${repoPath}/`)) {
        return p;
      }
    }
    return null;
  }
}
