import * as assert from 'assert';
import { ActivityTracker, TrackerOptions } from '../core/tracker';

const BASE = 1_000_000_000_000;

function opts(over: Partial<TrackerOptions> = {}): TrackerOptions {
  return { idleTimeoutSec: 120, sessionGapSec: 600, backgroundGraceSec: 1800, maxTickGapSec: 30, ...over };
}

describe('ActivityTracker', () => {
  it('acumula activo y primer plano con actividad reciente', () => {
    const t = new ActivityTracker(opts());
    t.noteActivity(BASE);
    t.tick(BASE, true);
    const a = t.tick(BASE + 5000, true);
    assert.strictEqual(a.activeSec, 5);
    assert.strictEqual(a.foregroundSec, 5);
    assert.strictEqual(a.backgroundSec, 0);
  });

  it('el primer tick no acredita tiempo', () => {
    const t = new ActivityTracker(opts());
    t.noteActivity(BASE);
    const a = t.tick(BASE, true);
    assert.strictEqual(a.activeSec, 0);
    assert.strictEqual(a.foregroundSec, 0);
  });

  it('sin actividad previa no cuenta activo aunque haya foco', () => {
    const t = new ActivityTracker(opts());
    t.tick(BASE, true);
    const a = t.tick(BASE + 5000, true);
    assert.strictEqual(a.activeSec, 0);
    assert.strictEqual(a.foregroundSec, 5);
  });

  it('deja de contar activo tras el idle timeout', () => {
    const t = new ActivityTracker(opts());
    t.noteActivity(BASE);
    t.tick(BASE, true);
    let last = t.tick(BASE + 30000, true);
    for (let i = 2; i <= 6; i++) {
      last = t.tick(BASE + i * 30000, true);
    }
    // a los 180s de la última actividad ya no es activo, pero sí primer plano
    assert.strictEqual(last.activeSec, 0);
    assert.strictEqual(last.foregroundSec, 30);
  });

  it('cuenta segundo plano solo dentro del periodo de gracia', () => {
    const t = new ActivityTracker(opts({ backgroundGraceSec: 60, maxTickGapSec: 100 }));
    t.noteActivity(BASE);
    t.tick(BASE, false);
    const a = t.tick(BASE + 30000, false);
    assert.strictEqual(a.backgroundSec, 30);
    assert.strictEqual(a.foregroundSec, 0);
    const b = t.tick(BASE + 95000, false);
    assert.strictEqual(b.backgroundSec, 0);
  });

  it('limita el tiempo acreditado tras una suspensión larga', () => {
    const t = new ActivityTracker(opts());
    t.noteActivity(BASE);
    t.tick(BASE, true);
    t.noteActivity(BASE + 3_600_000);
    const a = t.tick(BASE + 3_600_000, true);
    assert.strictEqual(a.activeSec, 30);
    assert.strictEqual(a.foregroundSec, 30);
  });

  it('cierra la sesión cuando la pausa supera sessionGap', () => {
    const t = new ActivityTracker(opts({ sessionGapSec: 60 }));
    t.noteActivity(BASE);
    t.tick(BASE, true);
    t.noteActivity(BASE + 5000);
    t.tick(BASE + 5000, true);
    assert.ok(t.hasOpenSession());
    const later = t.tick(BASE + 70000, true);
    assert.ok(later.closedSession, 'la sesión anterior debe cerrarse');
    const durationSec = Math.round((later.closedSession!.end - later.closedSession!.start) / 1000);
    assert.strictEqual(durationSec, 5);
  });

  it('closeSession devuelve y vacía la sesión abierta', () => {
    const t = new ActivityTracker(opts());
    t.noteActivity(BASE);
    t.tick(BASE, true);
    t.tick(BASE + 5000, true);
    const s = t.closeSession();
    assert.ok(s);
    assert.strictEqual(t.hasOpenSession(), false);
    assert.strictEqual(t.closeSession(), null);
  });
});
