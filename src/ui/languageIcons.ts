/**
 * Identidad visual de cada lenguaje: su color oficial (el mismo que usa
 * GitHub) y una abreviatura corta. Se dibuja como una pastilla de color con
 * las iniciales en lugar de reproducir los logotipos, que son marcas
 * registradas y pesarían de más en el paquete.
 */
export interface LanguageStyle {
  nombre: string;
  color: string;
  sigla: string;
}

const LENGUAJES: Record<string, LanguageStyle> = {
  typescript: { nombre: 'TypeScript', color: '#3178c6', sigla: 'TS' },
  typescriptreact: { nombre: 'TypeScript React', color: '#3178c6', sigla: 'TSX' },
  javascript: { nombre: 'JavaScript', color: '#f1e05a', sigla: 'JS' },
  javascriptreact: { nombre: 'JavaScript React', color: '#f1e05a', sigla: 'JSX' },
  python: { nombre: 'Python', color: '#3572a5', sigla: 'PY' },
  java: { nombre: 'Java', color: '#b07219', sigla: 'JV' },
  csharp: { nombre: 'C#', color: '#178600', sigla: 'C#' },
  cpp: { nombre: 'C++', color: '#f34b7d', sigla: 'C+' },
  c: { nombre: 'C', color: '#555555', sigla: 'C' },
  go: { nombre: 'Go', color: '#00add8', sigla: 'GO' },
  rust: { nombre: 'Rust', color: '#dea584', sigla: 'RS' },
  php: { nombre: 'PHP', color: '#4f5d95', sigla: 'PHP' },
  ruby: { nombre: 'Ruby', color: '#701516', sigla: 'RB' },
  swift: { nombre: 'Swift', color: '#f05138', sigla: 'SW' },
  kotlin: { nombre: 'Kotlin', color: '#a97bff', sigla: 'KT' },
  dart: { nombre: 'Dart', color: '#00b4ab', sigla: 'DT' },
  scala: { nombre: 'Scala', color: '#c22d40', sigla: 'SC' },
  elixir: { nombre: 'Elixir', color: '#6e4a7e', sigla: 'EX' },
  html: { nombre: 'HTML', color: '#e34c26', sigla: '<>' },
  css: { nombre: 'CSS', color: '#563d7c', sigla: 'CSS' },
  scss: { nombre: 'SCSS', color: '#c6538c', sigla: 'SASS' },
  vue: { nombre: 'Vue', color: '#41b883', sigla: 'VUE' },
  svelte: { nombre: 'Svelte', color: '#ff3e00', sigla: 'SV' },
  json: { nombre: 'JSON', color: '#a0a0a0', sigla: '{}' },
  jsonc: { nombre: 'JSON', color: '#a0a0a0', sigla: '{}' },
  yaml: { nombre: 'YAML', color: '#cb171e', sigla: 'YML' },
  markdown: { nombre: 'Markdown', color: '#7a8b99', sigla: 'MD' },
  shellscript: { nombre: 'Shell', color: '#89e051', sigla: 'SH' },
  powershell: { nombre: 'PowerShell', color: '#012456', sigla: 'PS' },
  sql: { nombre: 'SQL', color: '#e38c00', sigla: 'SQL' },
  dockerfile: { nombre: 'Dockerfile', color: '#384d54', sigla: 'DK' },
  prisma: { nombre: 'Prisma', color: '#0c344b', sigla: 'PR' },
  terraform: { nombre: 'Terraform', color: '#7b42bc', sigla: 'TF' },
  lua: { nombre: 'Lua', color: '#000080', sigla: 'LUA' },
  r: { nombre: 'R', color: '#198ce7', sigla: 'R' },
  perl: { nombre: 'Perl', color: '#0298c3', sigla: 'PL' },
  haskell: { nombre: 'Haskell', color: '#5e5086', sigla: 'HS' },
  xml: { nombre: 'XML', color: '#0060ac', sigla: 'XML' },
  plaintext: { nombre: 'Texto', color: '#8b98a9', sigla: 'TXT' },
};

const RESERVA: LanguageStyle = { nombre: 'Otro', color: '#8b98a9', sigla: '·' };

export function languageStyle(languageId: string): LanguageStyle {
  const clave = (languageId ?? '').toLowerCase();
  const encontrado = LENGUAJES[clave];
  if (encontrado) {
    return encontrado;
  }
  // Lenguaje desconocido: pastilla neutra con las dos primeras letras.
  const sigla = clave.slice(0, 2).toUpperCase() || RESERVA.sigla;
  const nombre = clave ? clave.charAt(0).toUpperCase() + clave.slice(1) : RESERVA.nombre;
  return { nombre, color: RESERVA.color, sigla };
}

/** Blanco o negro según el contraste con el color de fondo (fórmula WCAG). */
export function contrastText(hex: string): string {
  const limpio = hex.replace('#', '');
  const componente = (i: number): number => {
    const c = parseInt(limpio.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminancia = 0.2126 * componente(0) + 0.7152 * componente(2) + 0.0722 * componente(4);
  return luminancia > 0.45 ? '#0d1219' : '#ffffff';
}
