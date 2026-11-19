import {
  BoxGeometry,
  EdgesGeometry,
  Euler,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Texture,
} from 'three';
import { buildRibbons, pathLength, route45, type RibbonPath } from './geometry';
import { dieMaterial, gridMaterial, litMaterial, panelMaterial, traceMaterial } from './materials';
import { C, HEX, mix } from './palette';
import { labelTexture, panelTexture, type PanelKind } from './textures';

export const FLOOR_Y = -7.5;

interface PanelSpec {
  kind: PanelKind;
  w: number;
  aspect: number;
  pos: Vector3;
  rotY: number;
  node: string;
}

interface NodeSpec {
  id: string;
  sub: string;
  x: number;
  z: number;
  size: number;
  accent: 'neon' | 'pcb';
}

// Racimo de paneles a la derecha, en dos columnas (encuadre resuelto con proyección).
const PANELS: PanelSpec[] = [
  { kind: 'catalog', w: 2.55, aspect: 1.6, pos: new Vector3(2.05, -4.4, -0.5), rotY: -0.08, node: 'UI' },
  { kind: 'map', w: 2.4, aspect: 1.6, pos: new Vector3(4.7, -4.1, -1.25), rotY: -0.32, node: 'API' },
  { kind: 'order', w: 1.35, aspect: 1.45, pos: new Vector3(2.35, -6.05, 0.65), rotY: -0.04, node: 'COLA' },
  { kind: 'telemetry', w: 1.5, aspect: 1.6, pos: new Vector3(4.35, -5.95, 0.4), rotY: -0.24, node: 'DB' },
];

// Dos filas: el flujo principal (UI -> API -> RAG -> LLM) y los servicios de soporte (cola, base de datos).
const NODES: NodeSpec[] = [
  { id: 'UI', sub: 'INTERFAZ', x: 1.2, z: -1.0, size: 0.8, accent: 'pcb' },
  { id: 'API', sub: 'REST · AUTH', x: 2.85, z: -1.0, size: 0.9, accent: 'pcb' },
  { id: 'COLA', sub: 'EVENTOS', x: 2.85, z: 2.3, size: 0.75, accent: 'pcb' },
  { id: 'DB', sub: 'POSTGRES', x: 4.5, z: 2.3, size: 0.8, accent: 'pcb' },
  { id: 'RAG', sub: 'RECUPERACIÓN', x: 4.5, z: -1.0, size: 0.85, accent: 'neon' },
  { id: 'LLM', sub: 'MODELO', x: 6.3, z: -1.0, size: 1.15, accent: 'neon' },
];

const EDGES: [string, string][] = [
  ['UI', 'API'],
  ['API', 'RAG'],
  ['RAG', 'LLM'],
  ['API', 'COLA'],
  ['COLA', 'DB'],
  ['DB', 'RAG'],
];

export interface PanelRuntime {
  mesh: Mesh;
  mat: ShaderMaterial;
  from: { pos: Vector3; quat: Quaternion; scale: Vector3 };
  to: { pos: Vector3; quat: Quaternion; scale: Vector3 };
  nodeIndex: number;
}

export interface NodeRuntime {
  group: Group;
  label: Sprite;
  labelMat: SpriteMaterial;
  spec: NodeSpec;
  fresh: boolean;
}

export interface Services {
  group: Group;
  panels: PanelRuntime[];
  nodes: NodeRuntime[];
  risers: Mesh;
  riserMat: ShaderMaterial;
  riserLen: number;
  edges: Mesh;
  edgeMat: ShaderMaterial;
  edgeLen: number;
  grid: Mesh;
  gridMat: ShaderMaterial;
  outlineMat: LineBasicMaterial;
  llmDie: ShaderMaterial;
}

export function buildServices(aniso: number, dieMap: Texture, dieGlow: Texture): Services {
  const group = new Group();

  /* ---------------- Suelo lógico ---------------- */
  const gridMat = gridMaterial();
  const grid = new Mesh(new PlaneGeometry(44, 44).rotateX(-Math.PI / 2).translate(2, FLOOR_Y, 0), gridMat);
  grid.renderOrder = -1;
  group.add(grid);

  /* ---------------- Nodos (mini chips) ---------------- */
  const nodes: NodeRuntime[] = [];
  const bodyMat = litMaterial({ color: C.chipBody, spec: C.ivory, shininess: 24, specK: 0.2, rim: 0.2 });
  const pinMat = litMaterial({ color: mix(HEX.copper, HEX.ivory, 0.45), spec: C.ivory, shininess: 80, specK: 1.1, rim: 0.35 });
  const ledGreen = litMaterial({ color: C.pcb, emissive: C.pcb.clone().multiplyScalar(3.5) });
  const ledNeon = litMaterial({ color: C.neon, emissive: C.neon.clone().multiplyScalar(4.5) });
  const outlineMat = new LineBasicMaterial({ color: C.ivory.clone().multiplyScalar(0.55), transparent: true, opacity: 0.85 });
  const unitBox = new BoxGeometry(1, 1, 1);
  const edgeGeo = new EdgesGeometry(new BoxGeometry(1, 1, 1));
  const llmDie = dieMaterial(dieMap, dieGlow);

  const H = 0.24;
  for (const spec of NODES) {
    const g = new Group();
    g.position.set(spec.x, FLOOR_Y, spec.z);
    const body = new Mesh(unitBox, bodyMat);
    body.scale.set(spec.size, H, spec.size);
    body.position.y = H / 2 + 0.03;
    const outline = new LineSegments(edgeGeo, outlineMat);
    outline.scale.copy(body.scale);
    outline.position.copy(body.position);
    const led = new Mesh(unitBox, spec.accent === 'neon' ? ledNeon : ledGreen);
    led.scale.set(0.07, 0.03, 0.07);
    led.position.set(-spec.size / 2 + 0.14, H + 0.045, -spec.size / 2 + 0.14);
    g.add(body, outline, led);
    if (spec.id === 'LLM' || spec.id === 'RAG') {
      const d = new Mesh(new PlaneGeometry(spec.size * 0.5, spec.size * 0.5).rotateX(-Math.PI / 2), llmDie);
      d.position.y = H + 0.034;
      g.add(d);
    }
    // Patas (coordenadas locales del nodo: escalan con él al crecer)
    const pinMats: Matrix4[] = [];
    const n = 5;
    for (const [ax, az] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      for (let i = 0; i < n; i++) {
        const o = (-0.5 + (i + 1) / (n + 1)) * spec.size;
        const x = ax * (spec.size / 2 + 0.07) + (az !== 0 ? o : 0);
        const z = az * (spec.size / 2 + 0.07) + (ax !== 0 ? o : 0);
        const m = new Matrix4().compose(
          new Vector3(x, 0.03, z),
          new Quaternion().setFromEuler(new Euler(0, ax !== 0 ? 0 : Math.PI / 2, 0)),
          new Vector3(0.16, 0.03, 0.05),
        );
        pinMats.push(m);
      }
    }
    const pins = new InstancedMesh(unitBox, pinMat, pinMats.length);
    pinMats.forEach((m, k) => pins.setMatrixAt(k, m));
    pins.computeBoundingSphere();
    g.add(pins);
    const labelMat = new SpriteMaterial({ map: labelTexture(spec.id, spec.sub, spec.accent, aniso), transparent: true, depthWrite: false, opacity: 0 });
    const label = new Sprite(labelMat);
    label.scale.set(1.7, 1.7 * (136 / 512), 1);
    label.position.set(spec.x, FLOOR_Y + H + 0.62, spec.z);
    label.renderOrder = 5;
    group.add(g, label);
    nodes.push({ group: g, label, labelMat, spec, fresh: !PANELS.some((p) => p.node === spec.id) });
  }

  /* ---------------- Aristas: pistas con paquetes de datos ---------------- */
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const edgePaths: RibbonPath[] = EDGES.map(([a, b], i) => {
    const A = byId.get(a)!;
    const B = byId.get(b)!;
    const pa = new Vector3(A.x, FLOOR_Y + 0.006, A.z);
    const pb = new Vector3(B.x, FLOOR_Y + 0.006, B.z);
    return { pts: route45(pa, pb, 0.5), width: 0.05, speed: 1.3 + (i % 3) * 0.35, seed: i * 0.37, live: 1 };
  });
  const edgeLen = Math.max(...edgePaths.map((p) => pathLength(p.pts)));
  const edgeMat = traceMaterial({ periodic: true });
  edgeMat.uniforms.uGlow.value = 0.8;
  const edges = new Mesh(buildRibbons(edgePaths, new Vector3(0, 1, 0), 0.014), edgeMat);
  group.add(edges);

  /* ---------------- Paneles de interfaz ---------------- */
  const panels: PanelRuntime[] = PANELS.map((sp, i) => {
    const h = sp.w / sp.aspect;
    const mat = panelMaterial(panelTexture(sp.kind, sp.aspect, aniso), sp.aspect);
    mat.uniforms.uSeed.value = i * 0.29;
    const mesh = new Mesh(new PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 4;
    const nodeIndex = NODES.findIndex((n) => n.id === sp.node);
    const node = NODES[nodeIndex];
    const from = {
      pos: sp.pos.clone(),
      quat: new Quaternion().setFromEuler(new Euler(0, sp.rotY, 0)),
      scale: new Vector3(sp.w, h, 1),
    };
    const to = {
      pos: new Vector3(node.x, FLOOR_Y + H + 0.04, node.z),
      quat: new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0)),
      scale: new Vector3(node.size * 0.98, node.size * 0.98, 1),
    };
    mesh.position.copy(from.pos);
    mesh.quaternion.copy(from.quat);
    mesh.scale.copy(from.scale);
    group.add(mesh);
    return { mesh, mat, from, to, nodeIndex };
  });

  /* ---------------- Risers: la corriente baja del die y alimenta los paneles ---------------- */
  // Buses horizontales escalonados (como pistas) hacia los paneles superiores; los inferiores
  // se alimentan desde el borde inferior del panel que tienen encima.
  const top = (sp: PanelSpec) => new Vector3(sp.pos.x, sp.pos.y + sp.w / sp.aspect / 2, sp.pos.z);
  const bottom = (sp: PanelSpec) => new Vector3(sp.pos.x, sp.pos.y - sp.w / sp.aspect / 2, sp.pos.z);
  const [pCat, pMap, pOrd, pTel] = PANELS;
  const busA = -2.35;
  const busB = -2.75;
  const riserPaths: RibbonPath[] = [
    [new Vector3(0, -1.5, 0), new Vector3(0, busA + 0.4, 0), new Vector3(0.4, busA, pMap.pos.z * 0.3), new Vector3(pMap.pos.x, busA, pMap.pos.z), top(pMap)],
    [new Vector3(0.12, -1.5, 0), new Vector3(0.12, busB + 0.4, 0), new Vector3(0.52, busB, pCat.pos.z * 0.3), new Vector3(pCat.pos.x, busB, pCat.pos.z), top(pCat)],
    [bottom(pCat).add(new Vector3(0.3, 0, 0)), top(pOrd).add(new Vector3(0.0, 0, 0))],
    [bottom(pMap).add(new Vector3(-0.2, 0, 0)), top(pTel)],
  ].map((pts, i) => ({ pts, width: 0.014, speed: 3.2, seed: 0, live: 1 }));
  // Los tramos inferiores continúan la distancia del bus que alimenta su panel superior.
  riserPaths[2].offset = pathLength(riserPaths[1].pts);
  riserPaths[3].offset = pathLength(riserPaths[0].pts);
  const riserLen = Math.max(...riserPaths.map((p) => pathLength(p.pts) + (p.offset ?? 0)));
  const riserMat = traceMaterial({ periodic: true });
  riserMat.uniforms.uBase.value = 0.55;
  riserMat.uniforms.uGlow.value = 0.7;
  riserMat.uniforms.uFadeIn.value = 0.9;
  const risers = new Mesh(buildRibbons(riserPaths, new Vector3(0, 0, 1), 0), riserMat);
  risers.frustumCulled = false;
  group.add(risers);

  return { group, panels, nodes, risers, riserMat, riserLen, edges, edgeMat, edgeLen, grid, gridMat, outlineMat, llmDie };
}
