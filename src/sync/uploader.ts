export interface ResultadoEnvio {
  ok: boolean;
  status: number;
  mensaje?: string;
}

/** Normaliza la dirección del servidor y compone la ruta de ingesta. */
export function urlDeIngesta(base: string): string {
  const limpia = (base ?? '').trim().replace(/\/+$/, '');
  if (!limpia) {
    return '';
  }
  const conEsquema = /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
  return `${conEsquema}/api/v1/heartbeat`;
}

/**
 * Envía la cola al servidor. Cualquier fallo se resuelve conservando los
 * datos: se reintentan en el siguiente ciclo, así que perder la conexión no
 * pierde horas.
 */
export async function enviarLatido(
  base: string,
  token: string,
  cuerpo: unknown,
  timeoutMs = 15000
): Promise<ResultadoEnvio> {
  const url = urlDeIngesta(base);
  if (!url || !token) {
    return { ok: false, status: 0, mensaje: 'falta la dirección del servidor o el token' };
  }
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), timeoutMs);
  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });
    if (!respuesta.ok) {
      return { ok: false, status: respuesta.status, mensaje: `el servidor respondió ${respuesta.status}` };
    }
    return { ok: true, status: respuesta.status };
  } catch (e) {
    return { ok: false, status: 0, mensaje: e instanceof Error ? e.message : 'error de red' };
  } finally {
    clearTimeout(corte);
  }
}
