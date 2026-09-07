import * as assert from 'assert';
import { AlmacenClasificacion, Clasificacion, ProjectClassifier } from '../sync/classifier';
import { Outbox } from '../sync/outbox';

function almacenFalso(inicial: Record<string, Clasificacion> = {}): AlmacenClasificacion & { datos: Record<string, Clasificacion> } {
  const datos = { ...inicial };
  return {
    datos,
    leer: () => datos,
    guardar: (v) => {
      for (const k of Object.keys(datos)) {
        delete datos[k];
      }
      Object.assign(datos, v);
    },
  };
}

describe('ProjectClassifier', () => {
  it('un proyecto nuevo no se envía hasta decidirlo', () => {
    const c = new ProjectClassifier(almacenFalso());
    assert.strictEqual(c.estado('/w/nuevo'), 'sin-decidir');
    assert.strictEqual(c.seEnvia('/w/nuevo'), false, 'sin decisión no sale nada');
  });

  it('solo se envía lo marcado como trabajo', () => {
    const c = new ProjectClassifier(almacenFalso());
    c.marcar('/w/cliente', 'trabajo');
    c.marcar('/w/mi-juego', 'personal');
    assert.strictEqual(c.seEnvia('/w/cliente'), true);
    assert.strictEqual(c.seEnvia('/w/mi-juego'), false);
  });

  it('la decisión se puede cambiar más adelante', () => {
    const almacen = almacenFalso();
    const c = new ProjectClassifier(almacen);
    c.marcar('/w/p', 'trabajo');
    assert.strictEqual(c.seEnvia('/w/p'), true);
    c.marcar('/w/p', 'personal');
    assert.strictEqual(c.seEnvia('/w/p'), false);
    c.marcar('/w/p', 'sin-decidir');
    assert.strictEqual(c.estado('/w/p'), 'sin-decidir');
    assert.deepStrictEqual(almacen.datos, {}, 'volver a indeciso lo borra del almacén');
  });

  it('la clasificación persiste entre sesiones', () => {
    const almacen = almacenFalso();
    new ProjectClassifier(almacen).marcar('/w/a', 'trabajo');
    const otra = new ProjectClassifier(almacen);
    assert.strictEqual(otra.seEnvia('/w/a'), true);
  });

  it('lista lo clasificado para poder revisarlo', () => {
    const c = new ProjectClassifier(almacenFalso());
    c.marcar('/w/b', 'personal');
    c.marcar('/w/a', 'trabajo');
    assert.deepStrictEqual(c.listado(), [
      { projectPath: '/w/a', estado: 'trabajo' },
      { projectPath: '/w/b', estado: 'personal' },
    ]);
  });
});

describe('Outbox', () => {
  const base = { projectPath: '/w/a', projectName: 'a', date: '2026-09-08' };

  it('acumula varios ticks dentro del mismo minuto', () => {
    const o = new Outbox();
    o.anotarMinuto({ ...base, minute: 100, a: 5, f: 5, b: 0 });
    o.anotarMinuto({ ...base, minute: 100, a: 5, f: 5, b: 0 });
    const envio = o.construirEnvio('v1', '1.2.0')!;
    const minutos = (envio.cuerpo.projects as any[])[0].minutes;
    assert.strictEqual(minutos.length, 1);
    assert.strictEqual(minutos[0].a, 10);
  });

  it('un minuto nunca supera los 60 segundos por mucho que se insista', () => {
    const o = new Outbox();
    for (let i = 0; i < 30; i++) {
      o.anotarMinuto({ ...base, minute: 7, a: 60, f: 60, b: 60 });
    }
    const m = (o.construirEnvio('v1', '1.2.0')!.cuerpo.projects as any[])[0].minutes[0];
    assert.strictEqual(m.a, 60);
    assert.strictEqual(m.f, 60);
    assert.strictEqual(m.b, 0, 'sin hueco libre no cabe segundo plano');
  });

  it('el tiempo activo nunca supera al de primer plano', () => {
    const o = new Outbox();
    o.anotarMinuto({ ...base, minute: 1, a: 60, f: 20, b: 0 });
    const m = (o.construirEnvio('v1', '1.2.0')!.cuerpo.projects as any[])[0].minutes[0];
    assert.strictEqual(m.a, 20);
  });

  it('agrupa por proyecto y día, e incluye los contadores', () => {
    const o = new Outbox();
    o.anotarMinuto({ ...base, minute: 1, a: 60, f: 60, b: 0 });
    o.anotarMinuto({ projectPath: '/w/b', projectName: 'b', date: '2026-09-08', minute: 1, a: 30, f: 30, b: 0 });
    o.anotarContadores({
      ...base, linesAdded: 10, linesDeleted: 2, charsTyped: 100, saves: 1,
      languages: { typescript: 60 }, runs: [{ kind: 'build', ms: 900, ok: true }],
    });
    const proyectos = o.construirEnvio('v1', '1.2.0')!.cuerpo.projects as any[];
    assert.strictEqual(proyectos.length, 2);
    const a = proyectos.find((p) => p.path === '/w/a');
    assert.strictEqual(a.linesAdded, 10);
    assert.strictEqual(a.runs.length, 1);
    assert.strictEqual(a.languages.typescript, 60);
  });

  it('los contadores acumulados no se duplican al reenviar', () => {
    const o = new Outbox();
    const c = { ...base, linesAdded: 10, linesDeleted: 0, charsTyped: 0, saves: 0, languages: {}, runs: [] };
    o.anotarContadores(c);
    o.anotarContadores({ ...c, linesAdded: 15 });
    o.anotarContadores({ ...c, linesAdded: 12 });
    const p = (o.construirEnvio('v1', '1.2.0')!.cuerpo.projects as any[])[0];
    assert.strictEqual(p.linesAdded, 15, 'se conserva el mayor, no la suma');
  });

  it('confirmar borra solo lo aceptado', () => {
    const o = new Outbox();
    o.anotarMinuto({ ...base, minute: 1, a: 60, f: 60, b: 0 });
    o.anotarMinuto({ ...base, minute: 2, a: 60, f: 60, b: 0 });
    assert.strictEqual(o.pendientes, 2);
    o.confirmar([Outbox.clave('/w/a', 1)]);
    assert.strictEqual(o.pendientes, 1);
  });

  it('sobrevive a un reinicio del editor', () => {
    const o = new Outbox();
    o.anotarMinuto({ ...base, minute: 42, a: 60, f: 60, b: 0 });
    const estado = JSON.parse(JSON.stringify(o.serializar()));
    const otra = new Outbox();
    otra.cargar(estado);
    assert.strictEqual(otra.pendientes, 1);
  });

  it('sin nada pendiente no construye envío', () => {
    assert.strictEqual(new Outbox().construirEnvio('v1', '1.2.0'), null);
  });
});

describe('urlDeIngesta', () => {
  it('compone la ruta y tolera barras sobrantes', () => {
    const { urlDeIngesta } = require('../sync/uploader');
    assert.strictEqual(urlDeIngesta('https://devmonitor.example.com'), 'https://devmonitor.example.com/api/v1/heartbeat');
    assert.strictEqual(urlDeIngesta('https://devmonitor.example.com///'), 'https://devmonitor.example.com/api/v1/heartbeat');
  });

  it('asume https cuando no se indica esquema', () => {
    const { urlDeIngesta } = require('../sync/uploader');
    assert.strictEqual(urlDeIngesta('devmonitor.example.com'), 'https://devmonitor.example.com/api/v1/heartbeat');
  });

  it('respeta http explícito para instalaciones internas', () => {
    const { urlDeIngesta } = require('../sync/uploader');
    assert.strictEqual(urlDeIngesta('http://192.168.1.5:3000'), 'http://192.168.1.5:3000/api/v1/heartbeat');
  });

  it('devuelve cadena vacía si no hay dirección', () => {
    const { urlDeIngesta } = require('../sync/uploader');
    assert.strictEqual(urlDeIngesta(''), '');
    assert.strictEqual(urlDeIngesta('   '), '');
  });
});

describe('enviarLatido', () => {
  it('no intenta enviar sin dirección o sin token', async () => {
    const { enviarLatido } = require('../sync/uploader');
    const r = await enviarLatido('', 'tok', {});
    assert.strictEqual(r.ok, false);
    const r2 = await enviarLatido('https://x.example', '', {});
    assert.strictEqual(r2.ok, false);
  });
});
