/**
 * Clasificación de cada proyecto como laboral o personal.
 *
 * Nada se envía al servidor sin una decisión expresa: mientras un proyecto
 * esté sin clasificar no sale del equipo. Así el trabajo personal permanece
 * privado incluso con el envío activado, y no depende de acordarse de
 * excluirlo a tiempo.
 */
export type Clasificacion = 'trabajo' | 'personal' | 'sin-decidir';

export interface AlmacenClasificacion {
  leer(): Record<string, Clasificacion>;
  guardar(valor: Record<string, Clasificacion>): void;
}

export class ProjectClassifier {
  private mapa: Record<string, Clasificacion>;

  constructor(private readonly almacen: AlmacenClasificacion) {
    this.mapa = { ...almacen.leer() };
  }

  estado(projectPath: string): Clasificacion {
    return this.mapa[projectPath] ?? 'sin-decidir';
  }

  /** Solo los proyectos marcados como laborales se envían. */
  seEnvia(projectPath: string): boolean {
    return this.estado(projectPath) === 'trabajo';
  }

  marcar(projectPath: string, valor: Clasificacion): void {
    if (valor === 'sin-decidir') {
      delete this.mapa[projectPath];
    } else {
      this.mapa[projectPath] = valor;
    }
    this.almacen.guardar({ ...this.mapa });
  }

  /** Proyectos ya clasificados, para poder revisarlos y cambiarlos. */
  listado(): { projectPath: string; estado: Clasificacion }[] {
    return Object.entries(this.mapa)
      .map(([projectPath, estado]) => ({ projectPath, estado }))
      .sort((a, b) => a.projectPath.localeCompare(b.projectPath));
  }
}
