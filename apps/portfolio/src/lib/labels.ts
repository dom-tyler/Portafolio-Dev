import type { Project } from '@portfolio/content-schema';

export const statusLabel: Record<Project['status'], string> = {
  'en-vivo': 'En vivo',
  'en-desarrollo': 'En desarrollo',
  academico: 'Académico',
  'caso-privado': 'Caso privado',
};

export const domainLabel: Record<Project['domains'][number], string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  ia: 'IA aplicada',
  integraciones: 'Integraciones',
  datos: 'Datos',
  arquitectura: 'Arquitectura',
  hardware: 'Hardware',
  juegos: 'Juegos',
  lenguajes: 'Lenguajes',
};
