import { parseProjects } from '@portfolio/content-schema';

/**
 * Catálogo público. Redacción conservadora: solo afirmaciones respaldadas.
 * Lo pendiente de validar vive en docs/CONTENT_REVIEW.md, nunca aquí.
 * Más adelante este archivo se reemplaza por la proyección pública de Firestore.
 */
export const projects = parseProjects([
  {
    slug: 'excentrix',
    title: 'Excentrix',
    tagline: 'Catálogo digital de perfumería con decants y compra guiada por WhatsApp.',
    tier: 'destacado',
    status: 'en-vivo',
    order: 1,
    period: '2026',
    context: 'Producto comercial',
    role: 'Diseño y desarrollo full stack',
    summary:
      'Excentrix permite explorar fragancias, elegir entre frasco completo y decants de distintos tamaños y continuar la compra por WhatsApp con el producto, la presentación y el precio ya incluidos en el mensaje.',
    problem:
      'Vender perfumería por presentaciones fraccionadas exige que el cliente entienda precio y tamaño antes de escribir, y que el vendedor reciba un pedido sin ambigüedad.',
    contribution: [
      'Identidad visual editorial, portada animada, colecciones y fichas de producto.',
      'Selector de presentación que recalcula precio y mensaje de compra en tiempo real.',
      'Arquitectura de catálogo estático con contenido gestionado y publicación automatizada.',
    ],
    decisions: [
      {
        title: 'Catálogo estático, contenido gestionado',
        body: 'Astro genera páginas estáticas a partir de Firestore. El sitio carga rápido y es indexable, y el contenido se edita sin tocar código.',
      },
      {
        title: 'WhatsApp como checkout',
        body: 'El mensaje de compra se construye con producto, presentación y precio, así el cierre conversacional empieza con un pedido completo.',
      },
    ],
    stack: ['Astro', 'TypeScript', 'Tailwind', 'Firestore', 'Firebase Auth', 'Cloudinary', 'GitHub Actions', 'Firebase Hosting'],
    domains: ['frontend', 'arquitectura', 'integraciones'],
    layers: ['interfaz', 'datos', 'integraciones', 'infraestructura'],
    links: { site: 'https://excentrix.web.app/' },
  },
  {
    slug: 'dayed-inmobiliaria',
    title: 'Dayed Inmobiliaria',
    tagline: 'Descubrimiento de inmuebles con filtros, mapa, favoritos y contacto directo.',
    tier: 'destacado',
    status: 'caso-privado',
    order: 2,
    period: 'DevsCode',
    context: 'Trabajo comercial · DevsCode',
    role: 'Desarrollo full stack y contacto con cliente',
    summary:
      'Catálogo de propiedades para una inmobiliaria: filtros combinables, mapa, favoritos y contacto por WhatsApp, conectado a una API de propiedades y desplegado en Vercel.',
    problem:
      'Quien busca inmueble necesita reducir opciones rápido y ubicar cada propiedad en el territorio antes de contactar a un asesor.',
    contribution: [
      'Interfaz de catálogo con filtros, mapa y favoritos.',
      'Integración del frontend con la API de propiedades.',
      'Coordinación de requerimientos con el cliente.',
    ],
    decisions: [
      {
        title: 'Filtro y mapa como una sola vista',
        body: 'El resultado del filtro y la posición en el mapa se sincronizan para que el usuario no pierda el contexto al refinar la búsqueda.',
      },
    ],
    stack: ['React', 'API REST', 'PostgreSQL', 'Sequelize', 'Supabase', 'Vercel'],
    domains: ['frontend', 'backend', 'datos'],
    layers: ['interfaz', 'api', 'datos', 'integraciones'],
  },
  {
    slug: 'liquilegal',
    title: 'LiquiLegal',
    tagline: 'Pasarela de pagos y recuperación documental con un microservicio RAG.',
    tier: 'destacado',
    status: 'caso-privado',
    order: 3,
    period: 'ZETA',
    context: 'Proyecto comercial · desarrollo en equipo por historias de usuario',
    role: 'Desarrollo de interfaz, integración de pagos e IA aplicada',
    summary:
      'Producto legal en el que se integró la pasarela de pagos desde historias de usuario y se trabajó un microservicio en Python para recuperación documental con RAG, conectado a un backend NestJS.',
    contribution: [
      'Interfaz e integración API de la pasarela de pagos a partir de historias de usuario.',
      'Microservicio RAG en Python con LangChain y LangGraph para recuperación documental.',
      'Conexión del servicio de IA con el backend NestJS.',
    ],
    decisions: [
      {
        title: 'IA como servicio separado',
        body: 'La recuperación documental vive en un microservicio Python. El ecosistema de IA evoluciona sin acoplarse al backend principal.',
      },
    ],
    stack: ['NestJS', 'Python', 'LangChain', 'LangGraph', 'RAG', 'Embeddings'],
    domains: ['ia', 'backend', 'integraciones', 'arquitectura'],
    layers: ['interfaz', 'api', 'integraciones', 'ia'],
  },
  {
    slug: 'easylang',
    title: 'EasyLang Compiler',
    tagline: 'Lenguaje educativo con intérprete propio, interfaz gráfica y CLI.',
    tier: 'destacado',
    status: 'academico',
    order: 4,
    period: 'Ingeniería Informática',
    context: 'Proyecto de fundamentos de lenguajes',
    role: 'Diseño del lenguaje e implementación',
    summary:
      'Un lenguaje pensado para enseñar a programar: análisis del código fuente, intérprete en Python y dos formas de uso, una GUI para aprender y una CLI para ejecutar.',
    contribution: [
      'Diseño de la sintaxis y del flujo de análisis e interpretación.',
      'Implementación del intérprete en Python.',
      'Interfaz gráfica y línea de comandos sobre el mismo núcleo.',
    ],
    decisions: [
      {
        title: 'Un núcleo, dos interfaces',
        body: 'GUI y CLI consumen el mismo intérprete, así el comportamiento del lenguaje no depende de cómo se ejecute.',
      },
    ],
    stack: ['Python', 'Intérpretes', 'GUI', 'CLI'],
    domains: ['lenguajes'],
    layers: ['interfaz', 'api'],
    links: { repo: 'https://github.com/dom-tyler/EasyLang-Compiler' },
  },
  {
    slug: 'nellup',
    title: 'Nellup',
    tagline: 'CRM con mensajería multicanal, plantillas de Meta y agente conversacional.',
    tier: 'laboratorio',
    status: 'caso-privado',
    order: 10,
    period: '2026',
    context: 'CRM comercial',
    role: 'Integraciones de mensajería',
    summary:
      'Integración de plantillas de Meta, flujos de envío y recepción, mensajería masiva y conexión de un agente conversacional dentro de un CRM.',
    contribution: [
      'Integración de plantillas de Meta.',
      'Flujos de envío, recepción y mensajería masiva.',
      'Conexión de un agente conversacional.',
    ],
    stack: ['Meta API', 'WhatsApp', 'Agentes conversacionales'],
    domains: ['integraciones', 'ia'],
    layers: ['api', 'integraciones', 'ia'],
  },
  {
    slug: 'zoe',
    title: 'Zoe',
    tagline: 'Aplicación social full stack con perfiles, matching y chat.',
    tier: 'laboratorio',
    status: 'en-desarrollo',
    order: 11,
    period: 'Personal',
    context: 'Proyecto personal',
    role: 'Desarrollo full stack',
    summary:
      'Frontend en React/Vite y API Express con MongoDB y autenticación JWT. Implementa perfil, matching y chat, y deja la IA planteada como siguiente etapa.',
    contribution: ['API Express con autenticación JWT.', 'Perfil, matching y chat.', 'Modelado de datos en MongoDB.'],
    stack: ['React', 'Vite', 'Express', 'MongoDB', 'JWT'],
    domains: ['frontend', 'backend'],
    layers: ['interfaz', 'api', 'datos'],
    links: { repo: 'https://github.com/dom-tyler/Zoe' },
  },
  {
    slug: 'myc-restaurant',
    title: 'MyC Restaurant',
    tagline: 'Reservas, pedidos y métricas con dos modelos de datos.',
    tier: 'laboratorio',
    status: 'academico',
    order: 12,
    period: '2025-1',
    context: 'Proyecto académico',
    role: 'Desarrollo y modelado de datos',
    summary:
      'Sistema de restaurante con reservas, pedidos y métricas que combina PostgreSQL para lo transaccional con MongoDB para datos de forma flexible.',
    contribution: ['Módulos de reservas y pedidos.', 'Métricas operativas.', 'Persistencia combinada PostgreSQL + MongoDB.'],
    decisions: [
      {
        title: 'Relacional + documental',
        body: 'Las reservas y los pedidos requieren integridad transaccional, y los datos de forma variable encajan mejor en documentos.',
      },
    ],
    stack: ['PostgreSQL', 'MongoDB'],
    domains: ['backend', 'datos'],
    layers: ['api', 'datos'],
    links: { repo: 'https://github.com/dom-tyler/MyC-Restaurant' },
  },
  {
    slug: 'neobit-infinity',
    title: 'NeoBit Infinity',
    tagline: 'Marketplace frontend con visor 3D, catálogo y chat.',
    tier: 'laboratorio',
    status: 'en-desarrollo',
    order: 13,
    period: 'Personal',
    context: 'Proyecto frontend',
    role: 'Desarrollo frontend',
    summary:
      'Marketplace con módulos de catálogo y chat, visor 3D con React Three Fiber y animaciones con Framer Motion.',
    contribution: ['Visor 3D de producto.', 'Módulos de catálogo y chat.', 'Sistema de animación de interfaz.'],
    stack: ['React', 'TypeScript', 'React Three Fiber', 'Framer Motion'],
    domains: ['frontend'],
    layers: ['interfaz'],
    links: { repo: 'https://github.com/dom-tyler/Neobit-Infinity' },
  },
  {
    slug: 'multitenancy-nestjs',
    title: 'Multitenancy NestJS + Prisma',
    tagline: 'Prueba de concepto de aislamiento por tenant y control de acceso por roles.',
    tier: 'laboratorio',
    status: 'en-desarrollo',
    order: 14,
    period: 'Exploración',
    context: 'Prueba de concepto de arquitectura',
    role: 'Diseño e implementación',
    summary:
      'Resolución de tenant, contexto por solicitud, aislamiento de datos y pruebas con SQLite, junto con un modelo de usuarios, roles y permisos.',
    contribution: ['Resolución de tenant por solicitud.', 'Estrategia de aislamiento de datos.', 'Modelo RBAC de usuarios, roles y permisos.'],
    stack: ['NestJS', 'Prisma', 'SQLite', 'RBAC'],
    domains: ['arquitectura', 'backend'],
    layers: ['api', 'datos'],
  },
  {
    slug: 'minnoghram',
    title: 'MinnoGhram',
    tagline: 'Diseño de sistemas de juego en Godot 4: mundo procedural y persistencia.',
    tier: 'laboratorio',
    status: 'en-desarrollo',
    order: 15,
    period: 'Personal',
    context: 'Diseño de juego',
    role: 'Diseño de sistemas y desarrollo',
    summary:
      'Juego en Godot 4 que evoluciona hacia 2.5D, con mundo procedural generado por semilla, persistencia y un vertical slice como hito.',
    contribution: ['Generación procedural por semilla.', 'Sistema de persistencia.', 'Plan de vertical slice.'],
    stack: ['Godot 4', 'GDScript'],
    domains: ['juegos'],
    layers: ['interfaz', 'datos'],
    links: { repo: 'https://github.com/dom-tyler/MinnoGhram' },
  },
]);

export const featured = projects.filter((p) => p.tier === 'destacado');
export const lab = projects.filter((p) => p.tier === 'laboratorio');
