import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DayStats } from './model';

export interface KeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  fingerprint: string;
}

export interface RowsSignature {
  sha256Rows: string;
  signature: string;
  fingerprint: string;
  publicKeyPem: string;
}

export interface SignatureBundle {
  version: 1;
  tool: 'devpulse';
  generatedAt: string;
  projects: string[];
  exportFile: string;
  sha256File: string;
  sha256Rows: string;
  rows: DayStats[];
  publicKeyPem: string;
  keyFingerprint: string;
  signature: string;
}

export interface VerifyResult {
  valid: boolean;
  problems: string[];
  fingerprint: string;
  /** true si el fichero exportado estaba junto a la firma y se pudo comprobar su hash. */
  fileChecked: boolean;
}

/** JSON canónico con claves ordenadas, para que hash y firma sean estables. */
export function canonicalJson(value: unknown): string {
  const sortValue = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      return v.map(sortValue);
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = sortValue((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sortValue(value));
}

export function sha256Hex(data: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function fingerprintOf(publicKeyPem: string): string {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }) as Buffer;
  const hash = crypto.createHash('sha256').update(der).digest('hex');
  return hash
    .slice(0, 32)
    .match(/.{4}/g)!
    .join('-')
    .toUpperCase();
}

/**
 * Crea (o carga) el par de claves Ed25519 de esta instalación. La clave
 * privada nunca sale del equipo; la huella de la pública es lo que el
 * administrador registra para atribuir las exportaciones.
 */
export async function ensureKeyPair(keysDir: string): Promise<KeyPair> {
  const privPath = path.join(keysDir, 'devpulse-ed25519.pem');
  const pubPath = path.join(keysDir, 'devpulse-ed25519.pub.pem');
  try {
    const privateKeyPem = await fs.readFile(privPath, 'utf8');
    const publicKeyPem = await fs.readFile(pubPath, 'utf8');
    return { privateKeyPem, publicKeyPem, fingerprint: fingerprintOf(publicKeyPem) };
  } catch {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await fs.mkdir(keysDir, { recursive: true });
    await fs.writeFile(privPath, privateKeyPem, { mode: 0o600 });
    await fs.writeFile(pubPath, publicKeyPem, 'utf8');
    return { privateKeyPem, publicKeyPem, fingerprint: fingerprintOf(publicKeyPem) };
  }
}

export function signRows(rows: DayStats[], keys: KeyPair): RowsSignature {
  const payload = canonicalJson(rows);
  return {
    sha256Rows: sha256Hex(payload),
    signature: crypto.sign(null, Buffer.from(payload, 'utf8'), keys.privateKeyPem).toString('base64'),
    fingerprint: keys.fingerprint,
    publicKeyPem: keys.publicKeyPem,
  };
}

/**
 * Escribe junto al fichero exportado un `.firma.json` con los datos canónicos,
 * el hash del fichero y la firma Ed25519 del conjunto. Es el documento
 * probatorio: cualquier cambio posterior en el informe o en la firma se
 * detecta en la verificación.
 */
export async function writeSidecar(
  exportPath: string,
  rows: DayStats[],
  keys: KeyPair,
  generatedAtIso: string
): Promise<string> {
  const fileBytes = await fs.readFile(exportPath);
  const data: Omit<SignatureBundle, 'signature'> = {
    version: 1,
    tool: 'devpulse',
    generatedAt: generatedAtIso,
    projects: [...new Set(rows.map((r) => r.project))].sort(),
    exportFile: path.basename(exportPath),
    sha256File: sha256Hex(fileBytes),
    sha256Rows: sha256Hex(canonicalJson(rows)),
    rows,
    publicKeyPem: keys.publicKeyPem,
    keyFingerprint: keys.fingerprint,
  };
  const signature = crypto
    .sign(null, Buffer.from(canonicalJson(data), 'utf8'), keys.privateKeyPem)
    .toString('base64');
  const bundle: SignatureBundle = { ...data, signature };
  const sidecarPath = `${exportPath}.firma.json`;
  await fs.writeFile(sidecarPath, JSON.stringify(bundle, null, 2), 'utf8');
  return sidecarPath;
}

export async function verifySidecar(sidecarPath: string): Promise<VerifyResult> {
  const problems: string[] = [];
  let bundle: SignatureBundle;
  try {
    bundle = JSON.parse(await fs.readFile(sidecarPath, 'utf8')) as SignatureBundle;
  } catch {
    return {
      valid: false,
      problems: ['El fichero de firma no existe o no es un JSON válido.'],
      fingerprint: '',
      fileChecked: false,
    };
  }

  const { signature, ...data } = bundle;
  let signatureOk = false;
  try {
    signatureOk = crypto.verify(
      null,
      Buffer.from(canonicalJson(data), 'utf8'),
      bundle.publicKeyPem,
      Buffer.from(signature ?? '', 'base64')
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    problems.push('La firma Ed25519 no coincide con el contenido: el fichero de firma fue alterado.');
  }
  if (sha256Hex(canonicalJson(bundle.rows ?? [])) !== bundle.sha256Rows) {
    problems.push('El hash SHA-256 de los datos no coincide con el declarado.');
  }

  let fileChecked = false;
  if (bundle.exportFile) {
    const exportPath = path.join(path.dirname(sidecarPath), bundle.exportFile);
    try {
      const bytes = await fs.readFile(exportPath);
      fileChecked = true;
      if (sha256Hex(bytes) !== bundle.sha256File) {
        problems.push(`El fichero exportado (${bundle.exportFile}) fue modificado después de la firma.`);
      }
    } catch {
      // El informe no está junto a la firma: se verifica solo el contenido firmado.
    }
  }

  return {
    valid: problems.length === 0,
    problems,
    fingerprint: bundle.keyFingerprint ?? '',
    fileChecked,
  };
}
