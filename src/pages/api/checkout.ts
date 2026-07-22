import type { APIRoute } from 'astro';
import { getCursoById } from '../../lib/cursos';

// Endpoint on-demand (corre en Cloudflare Functions), no se pre-renderiza.
export const prerender = false;

/*
  Crea una preferencia de pago en Mercado Pago y devuelve el init_point
  (URL de Checkout Pro) para redirigir al comprador.

  Seguridad: el PRECIO se toma del contenido del curso en el servidor,
  nunca del body — así nadie puede pagar un precio manipulado. El
  MP_ACCESS_TOKEN vive como secret en Cloudflare y jamás llega al cliente.
*/
export const POST: APIRoute = async ({ request, locals }) => {
  // En Cloudflare, los secrets llegan por locals.runtime.env.
  const env = (locals as any).runtime?.env ?? {};
  const accessToken = env.MP_ACCESS_TOKEN ?? import.meta.env.MP_ACCESS_TOKEN;
  const siteUrl =
    env.PUBLIC_SITE_URL ?? import.meta.env.PUBLIC_SITE_URL ?? new URL(request.url).origin;

  if (!accessToken) {
    return json({ error: 'Mercado Pago no está configurado.' }, 500);
  }

  let body: { cursoId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body inválido.' }, 400);
  }

  const cursoId = body.cursoId;
  if (!cursoId) return json({ error: 'Falta cursoId.' }, 400);

  const curso = await getCursoById(cursoId);
  if (!curso) return json({ error: 'Curso no encontrado.' }, 404);

  // Preferencia de pago. Precio y título tomados del contenido (fuente de verdad).
  const preference = {
    items: [
      {
        id: curso.id,
        title: curso.data.titulo,
        quantity: 1,
        unit_price: curso.data.precio.ars,
        currency_id: 'ARS',
      },
    ],
    back_urls: {
      success: `${siteUrl}/gracias?curso=${curso.id}`,
      failure: `${siteUrl}/cursos/${curso.id}?pago=error`,
      pending: `${siteUrl}/gracias?curso=${curso.id}&estado=pendiente`,
    },
    auto_return: 'approved',
    // Referencia para reconciliar el pago en el webhook.
    external_reference: curso.id,
    metadata: { curso_id: curso.id, curso_titulo: curso.data.titulo },
  };

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preference),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('Error creando preferencia MP:', detail);
    return json({ error: 'No se pudo crear la preferencia de pago.' }, 502);
  }

  const data = (await res.json()) as { init_point?: string; sandbox_init_point?: string };
  const initPoint = data.init_point ?? data.sandbox_init_point;
  if (!initPoint) return json({ error: 'MP no devolvió init_point.' }, 502);

  return json({ initPoint });
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
