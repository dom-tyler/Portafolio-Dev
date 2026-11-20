<div align="center">

<img src="docs/readme/banner.svg" width="100%" alt="Daniel Osorio Maturana · Software Engineer · Del silicio a la IA" />

<br />

[![Portafolio](https://img.shields.io/badge/Portafolio-FF2A44?style=for-the-badge&logo=astro&logoColor=white)](https://daniel-dev-portafolio.web.app)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0E1113?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0iI0Q0ODIzRiIgZD0iTTIwLjQ0NyAyMC40NTJoLTMuNTU0di01LjU2OWMwLTEuMzI4LS4wMjctMy4wMzctMS44NTItMy4wMzctMS44NTMgMC0yLjEzNiAxLjQ0NS0yLjEzNiAyLjkzOXY1LjY2N0g5LjM1MVY5aDMuNDE0djEuNTYxaC4wNDZjLjQ3Ny0uOSAxLjYzNy0xLjg1IDMuMzctMS44NSAzLjYwMSAwIDQuMjY3IDIuMzcgNC4yNjcgNS40NTV2Ni4yODZ6TTUuMzM3IDcuNDMzYy0xLjE0NCAwLTIuMDYzLS45MjYtMi4wNjMtMi4wNjUgMC0xLjEzOC45Mi0yLjA2MyAyLjA2My0yLjA2MyAxLjE0IDAgMi4wNjQuOTI1IDIuMDY0IDIuMDYzIDAgMS4xMzktLjkyNSAyLjA2NS0yLjA2NCAyLjA2NXptMS43ODIgMTMuMDE5SDMuNTU1VjloMy41NjR2MTEuNDUyek0yMi4yMjUgMEgxLjc3MUMuNzkyIDAgMCAuNzc0IDAgMS43Mjl2MjAuNTQyQzAgMjMuMjI3Ljc5MiAyNCAxLjc3MSAyNGgyMC40NTFDMjMuMiAyNCAyNCAyMy4yMjcgMjQgMjIuMjcxVjEuNzI5QzI0IC43NzQgMjMuMiAwIDIyLjIyMiAwaC4wMDN6Ii8%2BPC9zdmc%2B)](https://www.linkedin.com/in/dom-tyler-dev)
[![Correo](https://img.shields.io/badge/daniel--dev--osoma%40gmail.com-0E1113?style=for-the-badge&logo=gmail&logoColor=D4823F)](mailto:daniel-dev-osoma@gmail.com)
[![GitHub](https://img.shields.io/badge/dom--tyler-0E1113?style=for-the-badge&logo=github&logoColor=D4823F)](https://github.com/dom-tyler)

<sub><b>MEDELLÍN, COLOMBIA</b> &nbsp;·&nbsp; DISPONIBLE PARA PROYECTOS Y EQUIPOS DE PRODUCTO</sub>

</div>

<br />

## Quién soy

<table>
<tr>
<td width="62%" valign="top">

Diseño y construyo **sistemas de software**, desde la arquitectura hasta el producto en manos de usuarios.

Mi base empezó abajo, en **algoritmos y electrónica digital** con prototipos en Arduino. Hoy trabajo arriba: servicios, **integraciones de pagos y mensajería**, e **IA aplicada** con agentes y RAG.

Estudio Ingeniería Informática en el Politécnico Jaime Isaza Cadavid. He trabajado en equipos de producto (ZETA, DevsCode) y en el semillero LaboratorioZ.

Este repositorio es mi portafolio y, a la vez, una muestra de cómo trabajo.

</td>
<td width="38%" valign="top">

**Enfoque**

- Arquitectura de software
- APIs e integraciones
- IA aplicada: agentes, RAG
- Producto de punta a punta

**Ahora**

- Pagos y mensajería en producción
- Agentes de código en el flujo diario

</td>
</tr>
</table>

## Cómo trabajo

> **Entiendo el problema, trazo los límites y elijo la arquitectura más simple que aguante lo que viene.**

<img src="docs/readme/pipeline.svg" width="100%" alt="Pipeline: Descubrir (brief.md) · Modelar (openapi.yaml) · Decidir (ADR-001) · Construir (ci passing) · Operar (p95 · logs)" />

## Proyectos

Los casos y el stack por capa viven en el portafolio y se actualizan desde el admin, así que siempre están al día.

[![Ver proyectos](https://img.shields.io/badge/Ver%20proyectos%20en%20el%20portafolio-FF2A44?style=for-the-badge&logo=astro&logoColor=white)](https://daniel-dev-portafolio.web.app/proyectos)

## Cómo está hecho este portafolio

No es una plantilla. Es un sistema pequeño, con sus propias decisiones de arquitectura y todo en planes gratuitos.

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#0E1113','primaryTextColor':'#ECE6D9','primaryBorderColor':'#D4823F','lineColor':'#FF2A44','secondaryColor':'#0E1113','tertiaryColor':'#0E1113','fontFamily':'ui-monospace, monospace'}}}%%
flowchart LR
  A["Admin PWA<br/>desde el celular"] -- edita --> F[("Firestore")]
  A -- Publicar --> W["Worker<br/>Cloudflare"]
  W --> G["GitHub Actions"]
  G -- compila leyendo Firestore --> H["Sitio estático<br/>Firebase Hosting"]
  V["Visitante"] -- formulario --> W
  W --> F
  W -- correo con formato --> R["Resend"]
  F -. mensajes en vivo .-> A
```

| Pieza | Decisión |
|:--|:--|
| **Hero WebGL** | Chip QFP procedural con onboarding, latido y reacción al cursor. Una mano robótica lo toma y lo presenta. three.js entra por import dinámico, hay niveles de calidad según los FPS medidos y un póster SVG como respaldo. |
| **Estático primero** | HTML generado en el build, rápido e indexable. El 3D es una mejora progresiva y respeta `prefers-reduced-motion`. |
| **Contenido gestionado** | Proyectos, tecnologías y cómo se integra cada una se editan desde un admin instalable en el teléfono. **Publicar** reconstruye el sitio: nada a medio editar llega al público. |
| **Contacto privado** | Validación, honeypot, Turnstile y límite por IP. Llega un correo con formato y el mensaje queda en la bandeja del admin, sin exponer mi correo de trabajo. |
| **Un solo contrato** | El mismo esquema Zod valida el sitio, el admin y la API. |

<p>
<img src="https://img.shields.io/badge/Astro-0E1113?style=flat-square&logo=astro&logoColor=D4823F" alt="Astro" />
<img src="https://img.shields.io/badge/TypeScript-0E1113?style=flat-square&logo=typescript&logoColor=D4823F" alt="TypeScript" />
<img src="https://img.shields.io/badge/three.js-0E1113?style=flat-square&logo=threedotjs&logoColor=D4823F" alt="three.js" />
<img src="https://img.shields.io/badge/Tailwind%204-0E1113?style=flat-square&logo=tailwindcss&logoColor=D4823F" alt="Tailwind 4" />
<img src="https://img.shields.io/badge/Firebase-0E1113?style=flat-square&logo=firebase&logoColor=D4823F" alt="Firebase" />
<img src="https://img.shields.io/badge/Cloudflare%20Workers-0E1113?style=flat-square&logo=cloudflareworkers&logoColor=D4823F" alt="Cloudflare Workers" />
<img src="https://img.shields.io/badge/Resend-0E1113?style=flat-square&logo=resend&logoColor=D4823F" alt="Resend" />
<img src="https://img.shields.io/badge/pnpm%20workspaces-0E1113?style=flat-square&logo=pnpm&logoColor=D4823F" alt="pnpm workspaces" />
</p>

## Contacto

<div align="center">

**¿Tienes un sistema por construir?** Hablemos.

[![Escríbeme](https://img.shields.io/badge/Escr%C3%ADbeme-FF2A44?style=for-the-badge&logo=gmail&logoColor=white)](mailto:daniel-dev-osoma@gmail.com)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0E1113?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0iI0Q0ODIzRiIgZD0iTTIwLjQ0NyAyMC40NTJoLTMuNTU0di01LjU2OWMwLTEuMzI4LS4wMjctMy4wMzctMS44NTItMy4wMzctMS44NTMgMC0yLjEzNiAxLjQ0NS0yLjEzNiAyLjkzOXY1LjY2N0g5LjM1MVY5aDMuNDE0djEuNTYxaC4wNDZjLjQ3Ny0uOSAxLjYzNy0xLjg1IDMuMzctMS44NSAzLjYwMSAwIDQuMjY3IDIuMzcgNC4yNjcgNS40NTV2Ni4yODZ6TTUuMzM3IDcuNDMzYy0xLjE0NCAwLTIuMDYzLS45MjYtMi4wNjMtMi4wNjUgMC0xLjEzOC45Mi0yLjA2MyAyLjA2My0yLjA2MyAxLjE0IDAgMi4wNjQuOTI1IDIuMDY0IDIuMDYzIDAgMS4xMzktLjkyNSAyLjA2NS0yLjA2NCAyLjA2NXptMS43ODIgMTMuMDE5SDMuNTU1VjloMy41NjR2MTEuNDUyek0yMi4yMjUgMEgxLjc3MUMuNzkyIDAgMCAuNzc0IDAgMS43Mjl2MjAuNTQyQzAgMjMuMjI3Ljc5MiAyNCAxLjc3MSAyNGgyMC40NTFDMjMuMiAyNCAyNCAyMy4yMjcgMjQgMjIuMjcxVjEuNzI5QzI0IC43NzQgMjMuMiAwIDIyLjIyMiAwaC4wMDN6Ii8%2BPC9zdmc%2B)](https://www.linkedin.com/in/dom-tyler-dev)
[![Formulario](https://img.shields.io/badge/Formulario%20del%20portafolio-0E1113?style=for-the-badge&logo=astro&logoColor=D4823F)](https://daniel-dev-portafolio.web.app/#contacto)

<br />

<img src="apps/portfolio/public/favicon.svg" width="22" height="22" alt="" />

<sub>Hecho en Medellín · Guía técnica para correr y desplegar el repo: <a href="docs/DEVELOPMENT.md">docs/DEVELOPMENT.md</a></sub>

</div>
