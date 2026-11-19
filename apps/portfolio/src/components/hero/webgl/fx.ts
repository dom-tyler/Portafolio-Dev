import { BufferAttribute, BufferGeometry, Points, Vector2, Vector3, type WebGLRenderer, type Scene, type Camera, HalfFloatType, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { mulberry32 } from './geometry';
import { pointsMaterial } from './materials';

/** Polvo marfil suspendido: da profundidad al movimiento de cámara. */
export function buildDust(count = 520): Points {
  const rand = mulberry32(3);
  const pos = new Float32Array(count * 3);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = -12 + rand() * 26;
    pos[i * 3 + 1] = -10 + rand() * 13;
    pos[i * 3 + 2] = -8 + rand() * 18;
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
      this.pos[i * 3 + 1] = Math.max(0.01, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
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
      c *= mix(0.42, 1.0, smoothstep(0.08, 0.62, vUv.x));
      // Destello del cruce: velo neón contenido (la escena se queda legible si el scroll se detiene aquí).
      c = mix(c, c + vec3(1.0, 0.16, 0.22) * 0.9, uFlash) + vec3(1.0, 0.85, 0.8) * uFlash * uFlash * 0.25;
      c = toSRGB(clamp(neutral(max(c, 0.0)), 0.0, 1.0));
      c += (hash(vUv * 1000.0) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export function buildComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number) {
  // Sin MSAA: en GPUs integradas cuesta más que toda la escena. FXAA al final (solo con DPR bajo).
  const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom a un cuarto de resolución: es un desenfoque, la diferencia no se ve y cuesta 4x menos.
  const bloom = new UnrealBloomPass(new Vector2(w / 2, h / 2), 0.95, 0.6, 0.95);
  const setBloomSize = bloom.setSize.bind(bloom);
  bloom.setSize = (bw: number, bh: number) => setBloomSize(bw / 2, bh / 2);
  composer.addPass(bloom);
  const finish = new ShaderPass(FinalShader);
  composer.addPass(finish);
  const fxaa = new FXAAPass();
  composer.addPass(fxaa);
  return { composer, bloom, finish, fxaa };
}
