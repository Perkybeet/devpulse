/**
 * Autoría del código: distingue lo que se teclea de lo que aparece en bloque.
 *
 * El editor no dice de dónde viene una inserción, pero sí cuánto texto entra
 * en cada cambio. Una persona escribe de uno a tres caracteres por evento;
 * un pegado, un fragmento de plantilla o una sugerencia aceptada de un
 * asistente insertan decenas o cientos de caracteres de golpe. Medir esa
 * proporción es honesto: no afirma quién escribió, solo cómo llegó el texto.
 */

export interface AuthorshipChange {
  text: string;
  /** Líneas eliminadas por el cambio. */
  removedLines: number;
  /** Deshacer o rehacer no son autoría nueva. */
  isUndoRedo: boolean;
}

export interface AuthorshipDelta {
  /** Caracteres escritos a mano. */
  typedChars: number;
  /** Caracteres llegados en bloque. */
  bulkChars: number;
  typedLines: number;
  bulkLines: number;
  /** Número de inserciones en bloque (para la métrica de "aceptaciones"). */
  bulkInsertions: number;
}

/** A partir de este tamaño, un solo cambio se considera inserción en bloque. */
export const BULK_THRESHOLD_CHARS = 24;

export function classifyChanges(changes: readonly AuthorshipChange[]): AuthorshipDelta {
  const d: AuthorshipDelta = { typedChars: 0, bulkChars: 0, typedLines: 0, bulkLines: 0, bulkInsertions: 0 };
  for (const c of changes) {
    if (c.isUndoRedo || c.text.length === 0) {
      continue;
    }
    let newlines = 0;
    for (let i = 0; i < c.text.length; i++) {
      if (c.text.charCodeAt(i) === 10) {
        newlines++;
      }
    }
    // Un salto de línea con su sangría automática sigue siendo tecleo.
    const esBloque = c.text.length >= BULK_THRESHOLD_CHARS || newlines >= 2;
    if (esBloque) {
      d.bulkChars += c.text.length;
      d.bulkLines += newlines;
      d.bulkInsertions++;
    } else {
      d.typedChars += c.text.length;
      d.typedLines += newlines;
    }
  }
  return d;
}

export interface AuthorshipTotals {
  typedChars: number;
  bulkChars: number;
  typedLines: number;
  bulkLines: number;
  bulkInsertions: number;
  externalEdits: number;
}

/** Proporción de caracteres que llegaron en bloque, de 0 a 1. */
export function bulkRatio(t: { typedChars: number; bulkChars: number }): number {
  const total = t.typedChars + t.bulkChars;
  return total > 0 ? t.bulkChars / total : 0;
}

/** Identificadores de extensiones de asistencia por IA conocidas. */
export const AI_ASSISTANT_IDS: Record<string, string> = {
  'github.copilot': 'GitHub Copilot',
  'github.copilot-chat': 'GitHub Copilot Chat',
  'anthropic.claude-code': 'Claude Code',
  'openai.chatgpt': 'ChatGPT',
  'codeium.codeium': 'Codeium',
  'codeium.windsurf': 'Windsurf',
  'tabnine.tabnine-vscode': 'Tabnine',
  'amazonwebservices.amazon-q-vscode': 'Amazon Q',
  'continue.continue': 'Continue',
  'sourcegraph.cody-ai': 'Cody',
  'supermaven.supermaven': 'Supermaven',
  'google.geminicodeassist': 'Gemini Code Assist',
  'saoudrizwan.claude-dev': 'Cline',
  'rooveterinaryinc.roo-cline': 'Roo Code',
  'augment.vscode-augment': 'Augment',
};

export function detectAssistants(installedIds: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of installedIds) {
    const nombre = AI_ASSISTANT_IDS[id.toLowerCase()];
    if (nombre && !out.includes(nombre)) {
      out.push(nombre);
    }
  }
  return out.sort();
}
