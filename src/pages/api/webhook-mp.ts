import type { APIRoute } from 'astro';

export const prerender = false;

/*
  Webhook de Mercado Pago. MP lo llama cuando cambia el estado de un pago.
  Acá confirmamos el pago contra la API de MP y, si está aprobado, se lo
  pasamos a GoHighLevel (inbound webhook) para que quede el contacto/venta
  en el CRM. Desde GHL se automatiza el aviso a José, que da de alta al
  alumno en Skool (paso manual, como se acordó con el cliente).

  TODO cuando esté GHL definido:
    - Mapear los campos al formato del inbound webhook de GHL.
    - Idealmente validar la firma (x-signature) de MP para seguridad.
*/
export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? {};
  const accessToken = env.MP_ACCESS_TOKEN ?? import.meta.env.MP_ACCESS_TOKEN;
  const ghlWebhookUrl = env.GHL_WEBHOOK_URL ?? import.meta.env.GHL_WEBHOOK_URL;

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    // MP a veces manda datos por querystring; respondemos 200 igual.
    return new Response('ok', { status: 200 });
  }

  // Solo nos interesan las notificaciones de tipo "payment".
  const paymentId = payload?.data?.id;
  const type = payload?.type ?? payload?.topic;
  if (type !== 'payment' || !paymentId) {
    return new Response('ignored', { status: 200 });
  }

  if (!accessToken) {
    console.error('Webhook MP: falta MP_ACCESS_TOKEN');
    return new Response('ok', { status: 200 });
  }

  // Confirmamos el pago consultando a MP (no confiamos en el payload crudo).
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error('Webhook MP: no se pudo consultar el pago', paymentId);
    return new Response('ok', { status: 200 });
  }

  const pago = (await res.json()) as any;

  if (pago.status === 'approved') {
    const contacto = {
      email: pago.payer?.email,
      nombre: pago.payer?.first_name,
      apellido: pago.payer?.last_name,
      cursoId: pago.external_reference,
      cursoTitulo: pago.metadata?.curso_titulo,
      monto: pago.transaction_amount,
      paymentId: pago.id,
      fecha: pago.date_approved,
    };

    if (ghlWebhookUrl) {
      await fetch(ghlWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contacto),
      }).catch((e) => console.error('Error enviando a GHL:', e));
    } else {
      // Sin GHL configurado todavía: al menos lo dejamos en logs.
      console.log('Pago aprobado (GHL no configurado):', contacto);
    }
  }

  return new Response('ok', { status: 200 });
};
