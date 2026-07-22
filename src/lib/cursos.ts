import { getCollection } from 'astro:content';

/*
  Busca un curso publicado por su id (slug). Se usa del lado servidor
  en /api/checkout para tomar el PRECIO desde el contenido y NO confiar
  en el precio que manda el navegador (evita que alguien lo manipule).
*/
export async function getCursoById(id: string) {
  const cursos = await getCollection('cursos', ({ data }) => data.publicado);
  return cursos.find((c) => c.id === id) ?? null;
}
