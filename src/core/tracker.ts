import { SessionRecord } from './model';

export interface TrackerOptions {
  idleTimeoutSec: number;
  sessionGapSec: number;
  backgroundGraceSec: number;
  /** Límite superior del tiempo acreditable entre dos ticks (suspensión del equipo, etc.). */
  maxTickGapSec: number;
}

export interface Accrual {
  activeSec: number;
  foregroundSec: number;
  backgroundSec: number;
  /** Sesión cerrada en este tick, si la pausa superó sessionGapSec. */
  closedSession: SessionRecord | null;
}

/**
 * Acumulador de tiempo basado en heartbeats: cada tick reparte el tiempo
 * transcurrido desde el tick anterior entre activo / primer plano / segundo
 * plano según el foco de la ventana y la última interacción registrada.
 * Las sesiones se forman por coalescencia: interacciones separadas por menos
 * de sessionGapSec pertenecen a la misma sesión.
 */
export class ActivityTracker {
  private lastTickMs: number | null = null;
  private lastActivityMs = 0;
  private lastFocusedMs = 0;
  private session: SessionRecord | null = null;

  constructor(private readonly opts: TrackerOptions) {}

  noteActivity(nowMs: number): void {
    if (nowMs > this.lastActivityMs) {
      this.lastActivityMs = nowMs;
    }
  }

  hasOpenSession(): boolean {
    return this.session !== null;
  }

  tick(nowMs: number, focused: boolean): Accrual {
    const out: Accrual = { activeSec: 0, foregroundSec: 0, backgroundSec: 0, closedSession: null };
    const prev = this.lastTickMs;
    this.lastTickMs = nowMs;

    let dt = prev === null ? 0 : (nowMs - prev) / 1000;
    if (dt < 0) {
      dt = 0;
    }
    if (dt > this.opts.maxTickGapSec) {
      dt = this.opts.maxTickGapSec;
    }

    if (dt > 0) {
      if (focused) {
        this.lastFocusedMs = nowMs;
        out.foregroundSec = dt;
        const idleFor = (nowMs - this.lastActivityMs) / 1000;
        if (this.lastActivityMs > 0 && idleFor <= this.opts.idleTimeoutSec) {
          out.activeSec = dt;
        }
      } else {
        const lastSignal = Math.max(this.lastActivityMs, this.lastFocusedMs);
        if (lastSignal > 0 && (nowMs - lastSignal) / 1000 <= this.opts.backgroundGraceSec) {
          out.backgroundSec = dt;
        }
      }
    }

    if (out.activeSec > 0) {
      if (this.session && (nowMs - this.session.end) / 1000 > this.opts.sessionGapSec) {
        out.closedSession = this.session;
        this.session = null;
      }
      if (!this.session) {
        this.session = { start: Math.round(nowMs - out.activeSec * 1000), end: nowMs };
      } else {
        this.session.end = nowMs;
      }
    } else if (this.session && (nowMs - this.session.end) / 1000 > this.opts.sessionGapSec) {
      out.closedSession = this.session;
      this.session = null;
    }

    return out;
  }

  /** Cierra y devuelve la sesión abierta (al desactivar la extensión). */
  closeSession(): SessionRecord | null {
    const s = this.session;
    this.session = null;
    return s;
  }
}
