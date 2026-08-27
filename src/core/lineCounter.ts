export interface SimpleChange {
  startLine: number;
  endLine: number;
  text: string;
}

export interface ChurnDelta {
  added: number;
  deleted: number;
  chars: number;
}

/**
 * Convierte los cambios de un TextDocumentChangeEvent en líneas añadidas y
 * eliminadas. Mide el trabajo de edición realizado (churn), no el diff neto
 * frente al repositorio: reescribir una línea cuenta en ambos lados.
 */
export function countChanges(changes: readonly SimpleChange[]): ChurnDelta {
  let added = 0;
  let deleted = 0;
  let chars = 0;
  for (const c of changes) {
    deleted += Math.max(0, c.endLine - c.startLine);
    let newlines = 0;
    for (let i = 0; i < c.text.length; i++) {
      if (c.text.charCodeAt(i) === 10) {
        newlines++;
      }
    }
    added += newlines;
    chars += c.text.length;
  }
  return { added, deleted, chars };
}
