/**
 * Genera src/ui/languageIcons.generated.ts a partir de simple-icons.
 * Se empaquetan solo los lenguajes que interesan, para no cargar 3.459 logos.
 */
const fs = require('fs');
const path = require('path');
const si = require('simple-icons');

// languageId de VS Code -> [nombre visible, clave en simple-icons, color alternativo]
const MAPA = {
  typescript: ['TypeScript', 'siTypescript'],
  typescriptreact: ['TypeScript React', 'siReact'],
  javascript: ['JavaScript', 'siJavascript'],
  javascriptreact: ['JavaScript React', 'siReact'],
  python: ['Python', 'siPython'],
  java: ['Java', 'siOpenjdk'],
  csharp: ['C#', 'siDotnet'],
  fsharp: ['F#', 'siDotnet'],
  cpp: ['C++', 'siCplusplus'],
  c: ['C', 'siC'],
  go: ['Go', 'siGo'],
  rust: ['Rust', 'siRust'],
  php: ['PHP', 'siPhp'],
  ruby: ['Ruby', 'siRuby'],
  swift: ['Swift', 'siSwift'],
  kotlin: ['Kotlin', 'siKotlin'],
  dart: ['Dart', 'siDart'],
  scala: ['Scala', 'siScala'],
  elixir: ['Elixir', 'siElixir'],
  erlang: ['Erlang', 'siErlang'],
  clojure: ['Clojure', 'siClojure'],
  haskell: ['Haskell', 'siHaskell'],
  lua: ['Lua', 'siLua'],
  perl: ['Perl', 'siPerl'],
  r: ['R', 'siR'],
  julia: ['Julia', 'siJulia'],
  html: ['HTML', 'siHtml5'],
  css: ['CSS', 'siCss'],
  scss: ['SCSS', 'siSass'],
  less: ['Less', 'siLess'],
  vue: ['Vue', 'siVuedotjs'],
  svelte: ['Svelte', 'siSvelte'],
  astro: ['Astro', 'siAstro'],
  json: ['JSON', 'siJson'],
  jsonc: ['JSON', 'siJson'],
  yaml: ['YAML', 'siYaml'],
  toml: ['TOML', 'siToml'],
  xml: ['XML', 'siXml'],
  markdown: ['Markdown', 'siMarkdown'],
  mdx: ['MDX', 'siMdx'],
  shellscript: ['Shell', 'siGnubash'],
  bat: ['Batch', 'siGnometerminal'],
  powershell: ['PowerShell', 'siGnometerminal'],
  dockerfile: ['Dockerfile', 'siDocker'],
  dockercompose: ['Docker Compose', 'siDocker'],
  prisma: ['Prisma', 'siPrisma'],
  graphql: ['GraphQL', 'siGraphql'],
  terraform: ['Terraform', 'siTerraform'],
  dotenv: ['Dotenv', 'siDotenv'],
  makefile: ['Makefile', 'siGnu'],
  sql: ['SQL', 'siPostgresql'],
  postgres: ['PostgreSQL', 'siPostgresql'],
  mysql: ['MySQL', 'siMysql'],
  solidity: ['Solidity', 'siSolidity'],
  zig: ['Zig', 'siZig'],
  nim: ['Nim', 'siNim'],
  ocaml: ['OCaml', 'siOcaml'],
  objectivec: ['Objective-C', 'siApple'],
  groovy: ['Groovy', 'siApachegroovy'],
  vb: ['Visual Basic', 'siDotnet'],
  latex: ['LaTeX', 'siLatex'],
  git: ['Git', 'siGit'],
  ignore: ['Git ignore', 'siGit'],
  properties: ['Properties', 'siGnu'],
};

const salida = {};
const faltan = [];
for (const [id, [nombre, clave]] of Object.entries(MAPA)) {
  const icono = si[clave];
  if (!icono) {
    faltan.push(`${id} (${clave})`);
    continue;
  }
  salida[id] = { nombre, color: `#${icono.hex.toLowerCase()}`, path: icono.path };
}

const cuerpo = `// Fichero generado por scripts/generar-iconos.js. No editar a mano.
// Logotipos de simple-icons (CC0). Cada marca pertenece a su titular y aquí
// se usa únicamente para identificar el lenguaje correspondiente.

export interface IconoLenguaje {
  nombre: string;
  color: string;
  path: string;
}

export const ICONOS_LENGUAJE: Record<string, IconoLenguaje> = ${JSON.stringify(salida, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'ui', 'languageIcons.generated.ts'), cuerpo);
console.log(`generados ${Object.keys(salida).length} iconos`);
if (faltan.length) {
  console.log('sin icono disponible:', faltan.join(', '));
}
