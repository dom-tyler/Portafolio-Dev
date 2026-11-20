import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector2, Vector3, type WebGLRenderer, type Scene, type Camera, HalfFloatType, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { mulberry32 } from './geometry';
import { pointsMaterial } from './materials';

/** Polvo marfil suspendido: da profundidad al movimiento de cámara. */
export function buildDust(count = 320): Points {
  const rand = mulberry32(3);
  const pos = new Float32Array(count * 3);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = -9 + rand() * 18;
    pos[i * 3 + 1] = -5 + rand() * 10;
    pos[i * 3 + 2] = -7 + rand() * 13;
    life[i] = 0.3 + rand() * 0.7;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aLife', new BufferAttribute(life, 1));
  const p = new Points(g, pointsMaterial());
  p.frustumCulled = false;
  return p;
}

/** Chispas: pool fijo de partículas que nacen donde un pulso termina su recorrido. */
export class Sparks {
  readonly points: Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private next = 0;
  private rand = mulberry32(99);

  constructor(private count = 220) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count).fill(1);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new BufferAttribute(this.life, 1));
    this.points = new Points(g, pointsMaterial({ spark: true }));
    this.points.frustumCulled = false;
  }

  burst(at: Vector3, n = 7, power = 1) {
    const r = this.rand;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y + 0.03;
      this.pos[i * 3 + 2] = at.z;
      const a = r() * Math.PI * 2;
      const sp = (0.4 + r() * 1.3) * power;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = (0.8 + r() * 1.6) * power;
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.max[i] = 0.25 + r() * 0.45;
      this.life[i] = 1;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt / this.max[i]);
      this.vel[i * 3 + 1] -= 6 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    const g = this.points.geometry;
    (g.attributes.position as BufferAttribute).needsUpdate = true;
    (g.attributes.aLife as BufferAttribute).needsUpdate = true;
  }
}

/**
 * Acabado en un solo pase: aberración cromática radial mínima, viñeta, atenuación lateral bajo el
 * texto, destello del cruce, tone mapping (Khronos PBR Neutral) y codificación sRGB.
 */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uExposure: { value: 1.05 },
    /** Atenuación lateral bajo el titular (1 en escritorio, 0 en móvil vertical). */
    uSideDim: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uFlash;
    uniform float uTime;
    uniform float uAspect;
    uniform float uExposure;
    uniform float uSideDim;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    vec3 neutral(vec3 color) {
      const float start = 0.76;
      const float desat = 0.15;
      color *= uExposure;
      float x = min(color.r, min(color.g, color.b));
      float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= offset;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < start) return color;
      float d = 1.0 - start;
      float newPeak = 1.0 - d * d / (peak + d - start);
      color *= newPeak / peak;
      float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
      return mix(color, vec3(newPeak), g);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
      vec2 off = d * r2 * 0.0022;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      c *= 1.0 - smoothstep(0.3, 1.2, r2) * 0.5;
      // Zona del titular: la escena cede contraste a la izquierda.
      c *= mix(mix(1.0, 0.42, uSideDim), 1.0, smoothstep(0.08, 0.62, vUv.x));
      // Destello del cruce: velo neón contenido (la escena se queda legible si el scroll se detiene aquí).
      c = mix(c, c + vec3(1.0, 0.16, 0.22) * 0.9, uFlash) + vec3(1.0, 0.85, 0.8) * uFlash * uFlash * 0.25;
      c = toSRGB(clamp(neutral(max(c, 0.0)), 0.0, 1.0));
      c += (hash(vUv * 1000.0) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

/**
 * Dibuja la escena a una resolución interna propia y la lleva a la resolución nativa del composer.
 * - Escala 1: dibuja directo en el búfer del composer (sin costo extra).
 * - Escala > 1 (supermuestreo): reduce con un filtro de caja de 4 tomas bilineales (exacto hasta 2x).
 * - Escala < 1: amplía con filtrado bilineal.
 * Así el bloom y el acabado siempre trabajan a resolución nativa y su aspecto no cambia.
 */
class ScenePass extends Pass {
  scale = 1;
  private rt: WebGLRenderTarget;
  private quad: FullScreenQuad;
  private mat: ShaderMaterial;
  private w = 1;
  private h = 1;

  constructor(
    private scene: Scene,
    private camera: Camera,
  ) {
    super();
    this.needsSwap = false;
    this.rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    this.mat = new ShaderMaterial({
      uniforms: { tScene: { value: null }, uOff: { value: new Vector2() }, uBox: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform vec2 uOff;
        uniform float uBox;
        varying vec2 vUv;
        void main() {
          if (uBox < 0.5) { gl_FragColor = texture2D(tScene, vUv); return; }
          gl_FragColor = 0.25 * (texture2D(tScene, vUv + vec2(-uOff.x, -uOff.y)) + texture2D(tScene, vUv + vec2(uOff.x, -uOff.y))
                               + texture2D(tScene, vUv + vec2(-uOff.x, uOff.y)) + texture2D(tScene, vUv + vec2(uOff.x, uOff.y)));
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  private native() {
    return Math.abs(this.scale - 1) < 1e-3;
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (this.native()) {
      this.rt.setSize(1, 1);
      return;
    }
    const iw = Math.max(1, Math.round(w * this.scale));
    const ih = Math.max(1, Math.round(h * this.scale));
    this.rt.setSize(iw, ih);
    // Un píxel de salida cubre `scale` texeles: tomas a ±scale/4 de texel promedian el área.
    (this.mat.uniforms.uOff.value as Vector2).set((this.scale * 0.25) / iw, (this.scale * 0.25) / ih);
    this.mat.uniforms.uBox.value = this.scale > 1 ? 1 : 0;
  }

  render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget) {
    const target = this.native() ? read : this.rt;
    renderer.setRenderTarget(this.renderToScreen && this.native() ? null : target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    if (this.native()) return;
    this.mat.uniforms.tScene.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    this.quad.render(renderer);
  }

  dispose() {
    this.rt.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}

export function buildComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number) {
  // Sin MSAA ni FXAA: MSAA en float duplica el costo en GPUs integradas y FXAA emborrona el detalle.
  // Los bordes se limpian con supermuestreo cuando la GPU tiene margen (ver quality.ts).
  const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  const scenePass = new ScenePass(scene, camera);
  composer.addPass(scenePass);
  // Bloom a un cuarto de resolución: es un desenfoque, la diferencia no se ve y cuesta 4x menos.
  const bloom = new UnrealBloomPass(new Vector2(w / 2, h / 2), 0.95, 0.6, 0.95);
  const setBloomSize = bloom.setSize.bind(bloom);
  bloom.setSize = (bw: number, bh: number) => setBloomSize(bw / 2, bh / 2);
  composer.addPass(bloom);
  const finish = new ShaderPass(FinalShader);
  composer.addPass(finish);
  /** Resolución interna de la escena respecto de la nativa. Llamar antes de composer.setSize. */
  const setSceneScale = (scale: number) => {
    scenePass.scale = scale;
  };
  return { composer, bloom, finish, setSceneScale };
}
