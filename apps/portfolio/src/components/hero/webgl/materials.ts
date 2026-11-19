import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, type Texture } from 'three';
import { C } from './palette';

/**
 * Uniformes compartidos por referencia entre todos los materiales: se actualizan una vez por cuadro.
 * Iluminación propia y barata (luz clave + hemisférica + luz puntual neón del die) en lugar de PBR
 * con mapas de entorno: controla mejor la paleta y pesa mucho menos.
 */
export const shared = {
  uTime: { value: 0 },
  uLightDir: { value: new Vector3(-0.45, 1, 0.35).normalize() },
  uNeonLightPos: { value: new Vector3(0, 0.6, 0) },
  uNeonLight: { value: 1 },
  uFogColor: { value: C.graphite.clone() },
  uFogNear: { value: 10 },
  uFogFar: { value: 30 },
  /** Intensidad global de la corriente (0 = apagada). */
  uCurrent: { value: 1 },
};

const fogPars = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  float fogF(float d) { return smoothstep(uFogNear, uFogFar, d); }
`;

const lightPars = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uNeonLightPos;
  uniform float uNeonLight;
  uniform vec3 uNeon;
  vec3 neonLight(vec3 n, vec3 w) {
    vec3 d = uNeonLightPos - w;
    float dist2 = dot(d, d);
    float ndl = max(dot(n, normalize(d)), 0.0);
    return uNeon * uNeonLight * ndl / (1.0 + dist2 * 1.6);
  }
`;

const instancedVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  varying float vDepth;
  varying vec2 vUv;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 w = m * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(m) * normal);
    vUv = uv;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export interface LitOptions {
  color: Color;
  spec?: Color;
  shininess?: number;
  specK?: number;
  rim?: number;
  emissive?: Color;
  opacity?: number;
  map?: Texture | null;
}

/** Material sólido con iluminación propia. Soporta InstancedMesh y un mapa opcional (multiplicado). */
export function litMaterial(o: LitOptions): ShaderMaterial {
  const transparent = (o.opacity ?? 1) < 1;
  return new ShaderMaterial({
    defines: o.map ? { USE_LITMAP: '' } : {},
    uniforms: {
      ...shared,
      uColor: { value: o.color },
      uSpec: { value: o.spec ?? C.ivory },
      uShin: { value: o.shininess ?? 40 },
      uSpecK: { value: o.specK ?? 0.4 },
      uRim: { value: o.rim ?? 0.15 },
      uEmissive: { value: o.emissive ?? new Color(0, 0, 0) },
      uOpacity: { value: o.opacity ?? 1 },
      uNeon: { value: C.neon },
      uMap: { value: o.map ?? null },
    },
    transparent,
    depthWrite: !transparent,
    vertexShader: instancedVertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uSpec;
      uniform float uShin;
      uniform float uSpecK;
      uniform float uRim;
      uniform vec3 uEmissive;
      uniform float uOpacity;
      uniform sampler2D uMap;
      ${fogPars}
      ${lightPars}
      varying vec3 vN;
      varying vec3 vW;
      varying float vDepth;
      varying vec2 vUv;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vW);
        vec3 L = normalize(uLightDir);
        float dif = max(dot(n, L), 0.0);
        float hemi = 0.5 + 0.5 * n.y;
        vec3 H = normalize(L + V);
        float sp = pow(max(dot(n, H), 0.0), uShin);
        float fr = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 base = uColor;
        vec3 em = uEmissive;
        #ifdef USE_LITMAP
          vec4 t = texture2D(uMap, vUv);
          base = mix(base, t.rgb, t.a);
          em += t.rgb * t.a * 0.35;
        #endif
        vec3 c = base * (0.16 + 0.22 * hemi + 0.8 * dif) + uSpec * sp * uSpecK + uSpec * fr * uRim + em;
        c += base * neonLight(n, vW) * 1.4;
        gl_FragColor = vec4(mix(c, uFogColor, fogF(vDepth)), uOpacity);
      }
    `,
  });
}

/**
 * Cobre con relieve + corriente neón. Cada vértice lleva su distancia a lo largo de la pista (aDist),
 * su posición transversal (aAcross, -1..1) y los datos de la pista (aTrace: largo, semilla, velocidad, viva).
 * El pulso es un cometa: frente nítido y cola exponencial, con núcleo más caliente en el centro.
 */
export function traceMaterial({ periodic = false, flat = false } = {}): ShaderMaterial {
  return new ShaderMaterial({
    defines: { ...(periodic ? { PERIODIC: '' } : {}), ...(flat ? { FLAT: '' } : {}) },
    uniforms: {
      ...shared,
      uCopper: { value: C.copper },
      uCopperHi: { value: C.copperHi },
      uNeon: { value: C.neon },
      uReveal: { value: 1e4 },
      uOpacity: { value: 1 },
      uBase: { value: 1 },
      uGlow: { value: 1 },
      uFadeIn: { value: 0 },
    },
    transparent: true,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aDist;
      attribute float aAcross;
      attribute vec4 aTrace;
      varying vec3 vN;
      varying vec3 vW;
      varying float vDepth;
      varying float vDist;
      varying float vAcross;
      varying vec4 vTrace;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vDist = aDist;
        vAcross = aAcross;
        vTrace = aTrace;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uCurrent;
      uniform vec3 uCopper;
      uniform vec3 uCopperHi;
      uniform float uReveal;
      uniform float uOpacity;
      uniform float uBase;
      uniform float uGlow;
      uniform float uFadeIn;
      ${fogPars}
      ${lightPars}
      varying vec3 vN;
      varying vec3 vW;
      varying float vDepth;
      varying float vDist;
      varying float vAcross;
      varying vec4 vTrace;
      void main() {
        if (vDist > uReveal) discard;
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        vec3 L = normalize(uLightDir);
        float dif = max(dot(n, L), 0.0);
        vec3 H = normalize(L + V);
        float sp = pow(max(dot(n, H), 0.0), 60.0);
        float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col = uCopper * (0.05 + 0.36 * dif) + uCopperHi * sp * 0.9 + uCopper * fr * 0.22;
        col += uCopper * neonLight(n, vW) * 1.2;
        col *= uBase;

        float len = vTrace.x;
        float seed = vTrace.y;
        float speed = abs(vTrace.z);
        float live = vTrace.w;
        float d = vTrace.z < 0.0 ? len - vDist : vDist;
        float core = 1.0 - smoothstep(0.15, 1.0, abs(vAcross));
        float e = 0.0;
        #ifdef PERIODIC
          // Paquetes de datos periódicos (grafo de servicios).
          float spacing = 2.4;
          float ph = fract((d - uTime * speed) / spacing + seed);
          float behind = (1.0 - ph) * spacing;
          e = exp(-behind / 0.45) + 0.06;
        #else
          float period = len + 5.0 + seed * 4.0;
          float head = mod(uTime * speed + seed * 37.0, period);
          float behind = head - d;
          e = behind >= 0.0 ? exp(-behind / (0.9 + len * 0.07)) : exp(behind * 22.0);
          e *= step(d, len + 0.01);
        #endif
        e *= live * uCurrent;
        vec3 em = uNeon * e * (0.5 + 4.5 * core) * uGlow;
        float alpha = uOpacity * (uFadeIn > 0.0 ? smoothstep(0.0, uFadeIn, vDist) : 1.0);
        gl_FragColor = vec4(mix(col + em, uFogColor, fogF(vDepth)), alpha);
      }
    `,
  });
}

/** Máscara de soldadura brillante con serigrafía (canvas) y ruido sutil. */
export function maskMaterial(silk: Texture, size: { w: number; h: number }): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      uSilk: { value: silk },
      uMask: { value: C.soldermask },
      uIvory: { value: C.ivory },
      uCopper: { value: C.copper },
      uNeon: { value: C.neon },
      uSize: { value: new Vector3(size.w, size.h, 0) },
      uOpacity: { value: 1 },
    },
    transparent: true,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vUv = uv;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSilk;
      uniform vec3 uMask;
      uniform vec3 uIvory;
      uniform vec3 uCopper;
      uniform vec3 uSize;
      uniform float uOpacity;
      ${fogPars}
      ${lightPars}
      varying vec3 vW;
      varying vec2 vUv;
      varying float vDepth;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 p = vW.xz;
        float nz = noise(p * 6.0) * 0.6 + noise(p * 23.0) * 0.4;
        vec3 n = normalize(vec3((noise(p * 9.0) - 0.5) * 0.06, 1.0, (noise(p * 9.0 + 7.0) - 0.5) * 0.06));
        vec3 V = normalize(cameraPosition - vW);
        vec3 L = normalize(uLightDir);
        vec3 H = normalize(L + V);
        float sp = pow(max(dot(n, H), 0.0), 90.0);
        float broad = pow(max(dot(n, H), 0.0), 8.0);
        float fr = pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec4 silk = texture2D(uSilk, vUv);
        // Canal R: serigrafía marfil. Canal G: cobre bajo la máscara (planos de tierra). Canal B: retícula.
        vec3 base = uMask * (0.75 + 0.25 * nz);
        base = mix(base, mix(uMask, uCopper, 0.32), silk.g * 0.85);
        base += uIvory * silk.b * 0.05;
        vec3 c = base * (0.35 + 0.75 * max(dot(n, L), 0.0));
        c += uIvory * (sp * 0.35 + broad * 0.025 + fr * 0.05);
        c = mix(c, uIvory * 0.62, silk.r * 0.85);
        c += uMask * neonLight(n, vW) * 3.2;
        // Bordes de la placa: se funde con el grafito.
        vec2 q = abs(vW.xz) / (uSize.xy * 0.5);
        float edge = 1.0 - smoothstep(0.72, 1.0, max(q.x, q.y));
        float f = fogF(vDepth);
        gl_FragColor = vec4(mix(c, uFogColor, max(f, 1.0 - edge)), uOpacity);
      }
    `,
  });
}

/** Die decapado: textura base + máscara de emisión (canal alfa) con barrido y parpadeo de arco. */
export function dieMaterial(map: Texture, glow: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      uMap: { value: map },
      uGlow: { value: glow },
      uNeon: { value: C.neon },
      uFlicker: { value: 0 },
      uHeat: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform sampler2D uGlow;
      uniform float uTime;
      uniform float uFlicker;
      uniform float uHeat;
      uniform float uCurrent;
      uniform vec3 uNeon;
      uniform vec3 uLightDir;
      ${fogPars}
      varying vec2 vUv;
      varying float vDepth;
      varying vec3 vW;
      void main() {
        vec3 base = texture2D(uMap, vUv).rgb;
        float g = texture2D(uGlow, vUv).r;
        vec3 V = normalize(cameraPosition - vW);
        vec3 H = normalize(normalize(uLightDir) + V);
        float sp = pow(max(H.y, 0.0), 120.0);
        vec3 c = base * 0.9 + vec3(sp) * 0.25;
        // Barrido diagonal de "reloj" sobre las pistas internas del die.
        float sweep = exp(-pow(fract((vUv.x + vUv.y) * 0.5 - uTime * 0.18) - 0.5, 2.0) * 180.0);
        float e = g * (0.35 + 1.8 * sweep + 3.0 * uFlicker) * uCurrent;
        c += uNeon * e;
        // Calor del cruce: el die se vuelve luz para atravesarlo.
        // Microdetalle procedural: dos niveles de celdas que aparecen solo cuando se pueden resolver,
        // así al acercarse el die gana detalle en lugar de volverse un borrón.
        vec2 q1 = vUv * 56.0;
        vec2 q2 = vUv * 448.0;
        vec2 w1 = fwidth(q1);
        vec2 w2 = fwidth(q2);
        vec2 g1 = abs(fract(q1) - 0.5) / max(w1, 1e-4);
        vec2 g2 = abs(fract(q2) - 0.5) / max(w2, 1e-4);
        float l1 = (1.0 - min(min(g1.x, g1.y), 1.0)) * (1.0 - smoothstep(0.25, 0.7, max(w1.x, w1.y)));
        float l2 = (1.0 - min(min(g2.x, g2.y), 1.0)) * (1.0 - smoothstep(0.25, 0.7, max(w2.x, w2.y)));
        float h2 = fract(sin(dot(floor(q2), vec2(41.3, 289.1))) * 15731.7);
        float lit = step(0.86, h2) * (1.0 - smoothstep(0.3, 0.9, max(w2.x, w2.y)));
        float pulse = 0.6 + 0.4 * sin(uTime * 3.0 + h2 * 40.0);
        c += base * (l1 * 0.5 + l2 * 0.35);
        // Al entrar se encienden las pistas internas y las celdas (no un velo plano).
        c += uNeon * uHeat * (0.1 + 1.8 * g + l1 * 1.4 + l2 * 0.9 + lit * pulse * 2.2);
        gl_FragColor = vec4(mix(c, uFogColor, fogF(vDepth)), 1.0);
      }
    `,
  });
}

/** Panel de vidrio con línea fina, contenido en canvas, despliegue vertical y corriente por el borde. */
export function panelMaterial(map: Texture, aspect: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      uMap: { value: map },
      uAspect: { value: aspect },
      uReveal: { value: 0 },
      uWidth: { value: 0 },
      uOpacity: { value: 0 },
      uContent: { value: 1 },
      uNeon: { value: C.neon },
      uIvory: { value: C.ivory },
      uCopper: { value: C.copper },
      uGlass: { value: C.graphite },
      uSeed: { value: Math.random() },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      varying vec3 vW;
      varying vec3 vN;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uAspect;
      uniform float uReveal;
      uniform float uWidth;
      uniform float uOpacity;
      uniform float uContent;
      uniform float uTime;
      uniform float uCurrent;
      uniform float uSeed;
      uniform vec3 uNeon;
      uniform vec3 uIvory;
      uniform vec3 uCopper;
      uniform vec3 uGlass;
      ${fogPars}
      varying vec2 vUv;
      varying float vDepth;
      varying vec3 vW;
      varying vec3 vN;
      // Línea de ~w píxeles con antialias (independiente de la distancia).
      float line(float d, float w) {
        float aa = max(fwidth(d), 1e-5);
        return 1.0 - smoothstep(w * aa, (w + 1.0) * aa, abs(d));
      }
      void main() {
        vec2 uv = vUv;
        // Despliegue: primero una pista horizontal crece (uWidth), luego se abre en vertical (uReveal).
        float halfW = uWidth * 0.5;
        float halfH = max(uReveal * 0.5, 0.0);
        float inX = step(abs(uv.x - 0.5), halfW);
        float inY = step(abs(uv.y - 0.5), halfH);
        float seam = line(abs(uv.y - 0.5) - halfH, 0.9) * inX;
        float shape = inX * max(inY, seam);
        if (shape < 0.01) discard;

        vec2 px = vec2(uv.x * uAspect, uv.y);
        float bx = min(uv.x, 1.0 - uv.x) * uAspect;
        float by = min(uv.y, 1.0 - uv.y);
        float border = line(min(bx, by), 0.5);
        // Esquinas de retícula en cobre (más gruesas).
        float cl = 0.08;
        float thick = line(min(bx, by), 1.4);
        float corner = thick * step(min(uv.x, 1.0 - uv.x) * uAspect, cl) * step(min(uv.y, 1.0 - uv.y), cl);

        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
        vec3 c = uGlass * 0.6 + uIvory * (0.018 + 0.05 * fr) + uIvory * 0.03 * (1.0 - uv.y);
        float a = 0.62 + 0.2 * fr;

        vec4 t = texture2D(uMap, uv);
        c = mix(c, t.rgb, t.a * uContent);
        a = max(a, t.a * uContent);

        c = mix(c, uIvory * 0.55, border);
        c = mix(c, uCopper * 1.3, corner);
        a = max(a, corner);
        a = max(a, border);

        // Corriente recorriendo el perímetro.
        float per = 2.0 * (uAspect + 1.0);
        float s;
        if (by <= bx) s = uv.y < 0.5 ? uv.x * uAspect : uAspect + 1.0 + (1.0 - uv.x) * uAspect;
        else s = uv.x > 0.5 ? uAspect + uv.y : 2.0 * uAspect + 1.0 + (1.0 - uv.y);
        float head = fract(uTime * 0.11 + uSeed) * per;
        float behind = mod(head - s + per, per);
        float comet = exp(-behind / 0.5) * max(border, corner) * uCurrent;
        c += uNeon * comet * 3.5;

        // Barrido de escaneo muy tenue.
        float scan = exp(-pow(fract(uv.y - uTime * 0.07 + uSeed) - 0.5, 2.0) * 900.0);
        c += uIvory * scan * 0.05 * uContent;

        // Costura del despliegue: la pista que se abre es neón.
        c += uNeon * seam * 2.2 * (1.0 - smoothstep(0.85, 1.0, uReveal));
        a = max(a, seam);

        float f = fogF(vDepth);
        gl_FragColor = vec4(mix(c, uFogColor, f), a * shape * uOpacity * (1.0 - f));
      }
    `,
  });
}

/** Suelo lógico (escenas 2-3): retícula fina que se desvanece con la distancia. */
export function gridMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared, uIvory: { value: C.ivory }, uPcb: { value: C.pcb }, uOpacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uIvory;
      uniform vec3 uPcb;
      uniform float uOpacity;
      ${fogPars}
      varying vec3 vW;
      varying float vDepth;
      float grid(vec2 p, float s) {
        vec2 g = abs(fract(p / s - 0.5) - 0.5) / fwidth(p / s);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        vec2 p = vW.xz;
        float minor = grid(p, 0.5);
        float major = grid(p, 2.0);
        float dots = 0.0;
        vec2 cell = abs(fract(p / 2.0) - 0.5);
        float r = length(fwidth(p / 2.0));
        dots = 1.0 - smoothstep(0.0, r * 1.5, length(cell - 0.5) - 0.01);
        float fade = 1.0 - smoothstep(4.0, 13.0, length(p - vec2(1.5, 0.0)));
        vec3 c = mix(uIvory, uPcb, 0.25);
        float a = (minor * 0.045 + major * 0.11 + dots * 0.4) * fade;
        float f = fogF(vDepth);
        gl_FragColor = vec4(c, a * uOpacity * (1.0 - f));
      }
    `,
  });
}

/** Partículas: polvo marfil (normal) o chispas neón (aditivas, HDR para el bloom). */
export function pointsMaterial({ spark = false } = {}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: spark ? C.neon : C.ivory },
      uSize: { value: spark ? 26 : 9 },
      uOpacity: { value: 1 },
      uPixelRatio: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: spark ? AdditiveBlending : NormalBlending,
    vertexShader: /* glsl */ `
      attribute float aLife;
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      varying float vLife;
      varying float vDepth;
      void main() {
        vec3 p = position;
        #ifndef SPARK
          p.y += sin(uTime * 0.25 + position.x * 1.7) * 0.08;
          p.x += cos(uTime * 0.21 + position.z * 1.3) * 0.08;
        #endif
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vLife = aLife;
        vDepth = -mv.z;
        gl_PointSize = uSize * uPixelRatio * (0.35 + 0.65 * aLife) / max(vDepth, 0.5);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      ${fogPars}
      varying float vLife;
      varying float vDepth;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q);
        if (d > 0.5) discard;
        #ifdef SPARK
          float k = exp(-d * d * 40.0);
          gl_FragColor = vec4(uColor * k * 6.0 * vLife + vec3(k * k * 2.0 * vLife), k * vLife * uOpacity);
        #else
          float k = 1.0 - smoothstep(0.2, 0.5, d);
          float f = fogF(vDepth);
          gl_FragColor = vec4(uColor, k * 0.22 * vLife * uOpacity * (1.0 - f));
        #endif
      }
    `,
    defines: spark ? { SPARK: '' } : {},
  });
}
