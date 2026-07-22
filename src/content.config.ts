import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/*
  Colección de cursos. Cada curso es un archivo Markdown en
  src/content/cursos/. Para sumar un curso: copiar uno existente y
  cambiar los campos. No hace falta tocar código.

  Los precios están en un objeto para poder mostrar ARS y/o USD.
  Dejar `precioArs` provisorio hasta cerrar la investigación de mercado.
*/
const cursos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cursos' }),
  schema: ({ image }) =>
    z.object({
      titulo: z.string(),
      // Nivel dentro de la academia.
      nivel: z.enum(['principiante', 'intermedio', 'avanzado']),
      // Resumen corto para las cards del catálogo.
      resumen: z.string(),
      // Temario / lo que incluye el curso.
      temario: z.array(z.string()),
      // Duración estimada, para mostrar en la ficha.
      duracion: z.string().optional(),
      precio: z.object({
        ars: z.number(),
        usd: z.number().optional(),
      }),
      // ID de la preferencia/producto en Mercado Pago (opcional por ahora).
      mpProductId: z.string().optional(),
      // Imagen de portada (usar fotos de campo reales cuando lleguen).
      portada: image().optional(),
      // Orden en el catálogo y visibilidad.
      orden: z.number().default(0),
      publicado: z.boolean().default(true),
      destacado: z.boolean().default(false),
    }),
});

export const collections = { cursos };
