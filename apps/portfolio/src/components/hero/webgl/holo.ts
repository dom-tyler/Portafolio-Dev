import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Mesh, PlaneGeometry, type ShaderMaterial } from 'three';
import { panelMaterial } from './materials';
import { C } from './palette';
import { holoTexture } from './textures';

/**
 * Capas holográficas que proyecta el chip (Interfaz · API · Datos · IA).
 * Viven en el espacio local del chip: planos paralelos a su cara superior, escalonados hacia
 * su -Z para que, cuando la mano lo presenta, suban en cascada hacia el espectador.
 */

const LAYERS = [
  { idx: '01', title: 'INTERFAZ', sub: 'React · Astro · Three.js' },
  { idx: '02', title: 'API', sub: 'NestJS · Node.js · REST' },
  { idx: '03', title: 'DATOS', sub: 'PostgreSQL · Firestore · Mongo' },
  { idx: '04', title: 'IA', sub: 'LangGraph · RAG · Embeddings' },
];

export interface Holo {
  group: Group;
  layers: { mesh: Mesh; mat: ShaderMaterial }[];
  beams: LineSegments;
  beamMat: LineBasicMaterial;
  /** t: 0..1 progreso global de aparición (escalonado por capa). */
  set(t: number): void;
}

const W = 1.3;
const H = W / 1.6;

export function buildHolo(aniso: number, dieTop: number): Holo {
  const group = new Group();
  group.name = 'holo';
  const layers = LAYERS.map((l, i) => {
    const mat = panelMaterial(holoTexture(l.idx, l.title, l.sub, aniso), 1.6);
    mat.uniforms.uSeed.value = i * 0.27;
    const mesh = new Mesh(new PlaneGeometry(W, H).rotateX(-Math.PI / 2), mat);
    // Abanico hacia arriba (−Z local) y a la izquierda (−X), un poco hacia la cámara (+Y)
    mesh.position.set(-0.26 * i - 0.2, dieTop + 0.34 + i * 0.14, -2.15 - i * 0.44);
    mesh.renderOrder = 6 + i;
    group.add(mesh);
    return { mesh, mat };
  });

  // Haces: de las esquinas del die a las esquinas de la primera capa, y entre capas.
  const pts: number[] = [];
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const first = layers[0].mesh.position;
  for (const [sx, sz] of corners) {
    pts.push(sx * 0.46, dieTop + 0.01, sz * 0.46, first.x + (sx * W) / 2, first.y, first.z + (sz * H) / 2);
  }
  for (let i = 1; i < layers.length; i++) {
    const a = layers[i - 1].mesh.position;
    const b = layers[i].mesh.position;
    for (const [sx, sz] of corners) pts.push(a.x + (sx * W) / 2, a.y, a.z + (sz * H) / 2, b.x + (sx * W) / 2, b.y, b.z + (sz * H) / 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  const beamMat = new LineBasicMaterial({ color: C.neon.clone().multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false });
  const beams = new LineSegments(g, beamMat);
  group.add(beams);

  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const set = (t: number) => {
    layers.forEach(({ mesh, mat }, i) => {
      const s = i * 0.16;
      const w = sm(s, s + 0.22, t);
      const r = sm(s + 0.12, s + 0.4, t);
      mat.uniforms.uWidth.value = w;
      mat.uniforms.uReveal.value = r;
      mat.uniforms.uOpacity.value = w;
      mesh.visible = w > 0.002;
    });
    beamMat.opacity = sm(0, 0.3, t) * 0.55;
    beams.visible = beamMat.opacity > 0.002;
    group.visible = t > 0.001;
  };
  set(0);
  return { group, layers, beams, beamMat, set };
}
