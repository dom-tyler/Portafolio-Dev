/**
 * Resolución adaptativa del hero.
 *
 * El lienzo siempre tiene la resolución nativa de la pantalla; lo que cambia es la resolución
 * interna a la que se dibuja la escena (`pr`, píxeles internos por píxel CSS). Con margen de GPU
 * sube por encima de la nativa (supermuestreo: bordes limpios sin FXAA) y con carga baja en pasos
 * pequeños. Nunca se queda pegada abajo: si la carga baja, vuelve a subir.
 *
 * Mide el tiempo real de GPU con EXT_disjoint_timer_query_webgl2 cuando existe. Sin esa extensión
 * (Safari) usa los FPS y solo baja.
 */

export interface ResolutionOptions {
  /** Resolución interna inicial. */
  start: number;
  min: number;
  max: number;
  /** Presupuesto de GPU por cuadro, en ms. */
  budgetMs?: number;
  step?: number;
}

export type QualityChange = { pr: number; bloom: boolean };

export class ResolutionController {
  pr: number;
  bloom = true;
  readonly min: number;
  readonly max: number;
  readonly budget: number;
  readonly step: number;
  private ceiling: number;
  private ema = -1;
  private samples = 0;
  private lastChange = -Infinity;
  private lastDir: 'up' | 'down' | null = null;
  private lastDecision = 0;
  private overSince = -1;

  constructor(o: ResolutionOptions) {
    this.step = o.step ?? 0.125;
    this.min = o.min;
    this.max = Math.max(o.min, o.max);
    this.budget = o.budgetMs ?? 12;
    this.ceiling = this.max;
    this.pr = clamp(o.start, this.min, this.max);
  }

  /** Muestra de tiempo de GPU (ms). Devuelve el cambio a aplicar o null. */
  gpu(ms: number, now: number, allowUp: boolean): QualityChange | null {
    if (!(ms > 0) || !Number.isFinite(ms)) return null;
    // Tras un cambio, los primeros cuadros reservan memoria: se descartan.
    if (now - this.lastChange < 250) return null;
    this.ema = this.ema < 0 ? ms : this.ema + (ms - this.ema) * 0.12;
    this.samples++;
    if (this.samples < 12 || now - this.lastDecision < 500) return null;
    this.lastDecision = now;
    const e = this.ema;

    if (e > this.budget * 1.15) {
      if (this.pr > this.min + 1e-6) {
        // Si la última subida fue reciente, esa resolución ya no cabe: queda como techo.
        if (this.lastDir === 'up' && now - this.lastChange < 4000) this.ceiling = this.pr - this.step;
        const ideal = this.pr * Math.sqrt(this.budget / e);
        const next = Math.max(this.min, Math.min(this.pr - this.step, this.snap(ideal)));
        return this.change(next, 'down', now);
      }
      if (this.overSince < 0) this.overSince = now;
      if (this.bloom && now - this.overSince > 3000) {
        this.bloom = false;
        return this.change(this.pr, 'down', now);
      }
      return null;
    }
    this.overSince = -1;

    const room = Math.min(this.max, this.ceiling);
    if (allowUp && now - this.lastChange > 1500 && this.pr + this.step <= room + 1e-6) {
      // El costo escala con el área: solo sube si la estimación tras el paso deja margen.
      const next = this.pr + this.step;
      const predicted = e * (next / this.pr) ** 2;
      if (predicted < this.budget * 0.85) return this.change(next, 'up', now);
    }
    return null;
  }

  /** Sin temporizador de GPU (o como red de seguridad): solo baja si los FPS no alcanzan. */
  fps(fps: number, now: number): QualityChange | null {
    if (now - this.lastChange < 1500 || fps >= 48) return null;
    if (this.pr > this.min + 1e-6) {
      this.ceiling = Math.min(this.ceiling, this.pr - this.step);
      return this.change(Math.max(this.min, this.pr - this.step), 'down', now);
    }
    if (this.bloom) {
      this.bloom = false;
      return this.change(this.pr, 'down', now);
    }
    return null;
  }

  private snap(v: number) {
    return Math.round(v / this.step) * this.step;
  }

  private change(pr: number, dir: 'up' | 'down', now: number): QualityChange {
    this.pr = clamp(pr, this.min, this.max);
    this.lastDir = dir;
    this.lastChange = now;
    this.ema = -1;
    this.samples = 0;
    return { pr: this.pr, bloom: this.bloom };
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Tiempo de GPU de cada cuadro, sin bloquear: una consulta por cuadro y lectura diferida. */
export class GpuTimer {
  private gl: WebGL2RenderingContext;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
  private queue: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  private constructor(gl: WebGL2RenderingContext, ext: GpuTimer['ext']) {
    this.gl = gl;
    this.ext = ext;
  }

  static create(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuTimer | null {
    if (!('createQuery' in gl)) return null;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimer['ext'] | null;
    return ext ? new GpuTimer(gl, ext) : null;
  }

  begin() {
    if (this.active || this.queue.length > 4) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.queue.push(this.active);
    this.active = null;
  }

  /** El resultado más antiguo disponible, en ms (o null). */
  poll(): number | null {
    const { gl } = this;
    const q = this.queue[0];
    if (!q || !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return null;
    this.queue.shift();
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
    gl.deleteQuery(q);
    return disjoint ? null : ns / 1e6;
  }

  dispose() {
    if (this.active) this.end();
    for (const q of this.queue) this.gl.deleteQuery(q);
    this.queue = [];
  }
}
