/** Iconos de trazo dibujados a mano, sin dependencias externas. */
const TRAZO = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

function svg(contenido: string): string {
  return `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" ${TRAZO}>${contenido}</svg>`;
}

export const ICONS = {
  reloj: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  calendario: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>'),
  diana: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'),
  terminal: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>'),
  rayo: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  llama: svg('<path d="M12 22c4 0 7-2.7 7-6.5 0-4.5-4-6-4-10-3 1.5-4 4-4 6-1-1-1.5-2-1.5-3.5C7 10 5 12 5 15.5 5 19.3 8 22 12 22z"/>'),
  carpeta: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  codigo: svg('<path d="M9 6l-5 6 5 6M15 6l5 6-5 6"/>'),
  grafico: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  onda: svg('<path d="M2 12h4l2-6 3 13 3-9 2 4h6"/>'),
  aviso: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>'),
  balanza: svg('<path d="M12 3v18M5 7h14M7 7l-3 6h6zM17 7l-3 6h6z"/>'),
};

/** Botón de ayuda con su texto explicativo. */
export function infoBoton(titulo: string, texto: string, matiz?: string): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<span class="info"><button type="button" class="info-boton" aria-label="Qué significa ${esc(titulo)}">
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="17" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>
    </svg></button><span class="info-globo" role="tooltip"><strong>${esc(titulo)}</strong><span>${esc(
      texto
    )}</span>${matiz ? `<em>${esc(matiz)}</em>` : ''}</span></span>`;
}
