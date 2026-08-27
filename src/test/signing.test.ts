import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { emptyDayStats } from '../core/model';
import { canonicalJson, ensureKeyPair, fingerprintOf, signRows, verifySidecar, writeSidecar } from '../core/signing';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixtureRows() {
  const a = emptyDayStats('2026-08-27', 'cliente', '/cliente');
  a.activeSeconds = 3600;
  a.linesAdded = 42;
  const b = emptyDayStats('2026-08-26', 'cliente', '/cliente');
  b.activeSeconds = 1800;
  return [a, b];
}

describe('canonicalJson', () => {
  it('es estable ante el orden de las claves', () => {
    assert.strictEqual(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe('ensureKeyPair', () => {
  it('crea el par de claves y lo reutiliza en llamadas posteriores', async () => {
    const dir = tmpDir('devpulse-keys-');
    const k1 = await ensureKeyPair(dir);
    const k2 = await ensureKeyPair(dir);
    assert.strictEqual(k1.fingerprint, k2.fingerprint);
    assert.strictEqual(k1.privateKeyPem, k2.privateKeyPem);
    assert.ok(k1.privateKeyPem.includes('PRIVATE KEY'));
    assert.ok(k1.publicKeyPem.includes('PUBLIC KEY'));
    assert.match(k1.fingerprint, /^[0-9A-F]{4}(-[0-9A-F]{4}){7}$/);
    assert.strictEqual(fingerprintOf(k1.publicKeyPem), k1.fingerprint);
  });

  it('instalaciones distintas tienen huellas distintas', async () => {
    const k1 = await ensureKeyPair(tmpDir('devpulse-keys-'));
    const k2 = await ensureKeyPair(tmpDir('devpulse-keys-'));
    assert.notStrictEqual(k1.fingerprint, k2.fingerprint);
  });
});

describe('firma y verificación de exportaciones', () => {
  it('una exportación intacta verifica correctamente', async () => {
    const dir = tmpDir('devpulse-sig-');
    const exportPath = path.join(dir, 'informe.csv');
    fs.writeFileSync(exportPath, 'Fecha;Proyecto\n2026-08-27;cliente\n');
    const keys = await ensureKeyPair(path.join(dir, 'keys'));
    const sidecar = await writeSidecar(exportPath, fixtureRows(), keys, '2026-08-27T12:00:00.000Z');

    const res = await verifySidecar(sidecar);
    assert.deepStrictEqual(res.problems, []);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.fileChecked, true);
    assert.strictEqual(res.fingerprint, keys.fingerprint);
  });

  it('detecta la manipulación del fichero exportado', async () => {
    const dir = tmpDir('devpulse-sig-');
    const exportPath = path.join(dir, 'informe.csv');
    fs.writeFileSync(exportPath, 'contenido original');
    const keys = await ensureKeyPair(path.join(dir, 'keys'));
    const sidecar = await writeSidecar(exportPath, fixtureRows(), keys, '2026-08-27T12:00:00.000Z');

    fs.appendFileSync(exportPath, ' + horas infladas');
    const res = await verifySidecar(sidecar);
    assert.strictEqual(res.valid, false);
    assert.ok(res.problems.some((p) => p.includes('modificado')));
  });

  it('detecta la manipulación de los datos firmados', async () => {
    const dir = tmpDir('devpulse-sig-');
    const exportPath = path.join(dir, 'informe.csv');
    fs.writeFileSync(exportPath, 'contenido');
    const keys = await ensureKeyPair(path.join(dir, 'keys'));
    const sidecar = await writeSidecar(exportPath, fixtureRows(), keys, '2026-08-27T12:00:00.000Z');

    const bundle = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
    bundle.rows[0].activeSeconds = 999999; // inflar horas a posteriori
    fs.writeFileSync(sidecar, JSON.stringify(bundle, null, 2));

    const res = await verifySidecar(sidecar);
    assert.strictEqual(res.valid, false);
    assert.ok(res.problems.length >= 1);
  });

  it('detecta un re-firmado con otra clave si se compara la huella', async () => {
    const dir = tmpDir('devpulse-sig-');
    const exportPath = path.join(dir, 'informe.csv');
    fs.writeFileSync(exportPath, 'contenido');
    const original = await ensureKeyPair(path.join(dir, 'keys-original'));
    const atacante = await ensureKeyPair(path.join(dir, 'keys-atacante'));
    await writeSidecar(exportPath, fixtureRows(), original, '2026-08-27T12:00:00.000Z');
    const reFirmado = await writeSidecar(exportPath, fixtureRows(), atacante, '2026-08-27T12:00:00.000Z');

    // La firma del atacante es internamente válida…
    const res = await verifySidecar(reFirmado);
    assert.strictEqual(res.valid, true);
    // …pero su huella no es la registrada por el administrador.
    assert.notStrictEqual(res.fingerprint, original.fingerprint);
  });

  it('falla con un fichero de firma inexistente', async () => {
    const res = await verifySidecar(path.join(tmpDir('devpulse-sig-'), 'no-existe.firma.json'));
    assert.strictEqual(res.valid, false);
  });
});
