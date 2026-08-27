import { DayStats } from '../core/model';

export interface CsvOptions {
  /** Separador de campos. Excel en español espera ';'. */
  separator: string;
  /** Usar coma decimal (convención es-ES). */
  decimalComma: boolean;
}

export const DEFAULT_CSV_OPTIONS: CsvOptions = { separator: ';', decimalComma: true };

/**
 * Exporta las filas diarias a CSV con BOM UTF-8 para que Excel lo abra
 * directamente con acentos y columnas correctas.
 */
export function toCsv(rows: DayStats[], opts: CsvOptions = DEFAULT_CSV_OPTIONS): string {
  const sep = opts.separator;
  const esc = (v: string): string =>
    v.includes(sep) || /["\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const num = (v: number): string => {
    const s = String(v);
    return opts.decimalComma ? s.replace('.', ',') : s;
  };

  const header = [
    'Fecha',
    'Proyecto',
    'Ruta',
    'HorasActivas',
    'SegundosActivos',
    'SegundosPrimerPlano',
    'SegundosSegundoPlano',
    'LineasAnadidas',
    'LineasEliminadas',
    'LineasNetas',
    'Caracteres',
    'Guardados',
    'ArchivosTocados',
    'Sesiones',
  ];
  const lines = [header.join(sep)];
  for (const r of rows) {
    const hours = Math.round((r.activeSeconds / 3600) * 100) / 100;
    lines.push(
      [
        r.date,
        esc(r.project),
        esc(r.projectPath),
        num(hours),
        String(Math.round(r.activeSeconds)),
        String(Math.round(r.foregroundSeconds)),
        String(Math.round(r.backgroundSeconds)),
        String(r.linesAdded),
        String(r.linesDeleted),
        String(r.linesAdded - r.linesDeleted),
        String(r.charsTyped),
        String(r.saves),
        String(r.filesTouched.length),
        String(r.sessions.length),
      ].join(sep)
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
