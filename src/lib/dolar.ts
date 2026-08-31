/*
  Cotización del dólar Banco Nación (BNA), usada para calcular el precio
  en pesos de los cursos a partir de su precio de referencia en USD.

  Cómo funciona el sistema de precios:
  ─────────────────────────────────────
  1. Cada curso define `precio.usd` (referencia estable) y `precio.ars`
     (el peso publicado, que queda escrito en el .md).
  2. En cada build se trae el dólar BNA y se calcula el precio sugerido.
  3. Si el sugerido se despegó más de UMBRAL del `ars` guardado, se usa
     el nuevo. Si no, se respeta el guardado (evita que el precio baile
     todos los días por movimientos chicos del dólar).
  4. `scripts/actualizar-precios.mjs` es el que persiste los .md.

  Por qué NO scrapeamos lanacion.com.ar: es una página HTML con ads, se
  rompe con cualquier rediseño. Estas APIs devuelven JSON y publican la
  misma cotización del BNA.
*/

/** Umbral de cambio: por debajo de esto, el precio publicado no se toca. */
export const UMBRAL_CAMBIO = 0.03; // 3%

/** Redondeo de precios en pesos: al múltiplo de $5.000 más cercano. */
export const REDONDEO_ARS = 5000;

/** Cotización del BNA de respaldo, si todas las fuentes fallan. */
const COTIZACION_FALLBACK = 1535;

export interface Cotizacion {
  /** Dólar venta del BNA, en pesos. */
  venta: number;
  /** De dónde salió el dato (para el log del build). */
  fuente: string;
  /** Cuándo lo publicó la fuente. */
  actualizado: string;
}

/*
  Fuentes en orden de preferencia. Ambas publican el BNA:
  - criptoya expone el banco explícitamente (`bna`), que es lo que pidió
    el cliente.
  - dolarapi publica el "oficial", que sigue al BNA (verificado: mismo
    valor de venta).
*/
const FUENTES: { nombre: string; url: string; extraer: (json: any) => number | null }[] = [
  {
    nombre: 'criptoya/bna',
    url: 'https://criptoya.com/api/bancostodos',
    extraer: (j) => numeroValido(j?.bna?.ask),
  },
  {
    nombre: 'dolarapi/oficial',
    url: 'https://dolarapi.com/v1/dolares/oficial',
    extraer: (j) => numeroValido(j?.venta),
  },
];

/*
  Descarta valores absurdos (0, negativos, NaN, o una cotización
  imposible). Sin este chequeo, una API devolviendo basura pondría
  todos los cursos a $0 en producción.
*/
function numeroValido(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 100 || n > 1_000_000) return null;
  return n;
}

/** Trae la cotización del BNA, probando las fuentes en orden. */
export async function getCotizacionBna(): Promise<Cotizacion> {
  for (const fuente of FUENTES) {
    try {
      const res = await fetch(fuente.url, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) continue;

      const json = await res.json();
      const venta = fuente.extraer(json);
      if (venta === null) continue;

      return {
        venta,
        fuente: fuente.nombre,
        actualizado: json?.fechaActualizacion ?? new Date().toISOString(),
      };
    } catch {
      // Fuente caída o timeout: probamos la siguiente.
    }
  }

  return {
    venta: COTIZACION_FALLBACK,
    fuente: 'fallback (todas las fuentes fallaron)',
    actualizado: new Date().toISOString(),
  };
}

/** Redondea al múltiplo de $5.000 más cercano. */
export function redondearArs(monto: number): number {
  return Math.round(monto / REDONDEO_ARS) * REDONDEO_ARS;
}

/** Precio en pesos sugerido para un precio de referencia en USD. */
export function precioSugerido(usd: number, cotizacion: number): number {
  return redondearArs(usd * cotizacion);
}

/*
  Decide el precio final de un curso.

  Devuelve el precio guardado salvo que el sugerido se haya despegado
  más del umbral — así el número publicado se mantiene estable y solo
  se mueve ante saltos reales del dólar.
*/
export function resolverPrecio(
  precioGuardadoArs: number,
  precioUsd: number | undefined,
  cotizacion: number,
): { ars: number; cambio: boolean; sugerido: number | null } {
  // Sin referencia en USD no hay nada que recalcular: manda el .md.
  if (!precioUsd) {
    return { ars: precioGuardadoArs, cambio: false, sugerido: null };
  }

  const sugerido = precioSugerido(precioUsd, cotizacion);
  const desvio = Math.abs(sugerido - precioGuardadoArs) / precioGuardadoArs;

  if (desvio >= UMBRAL_CAMBIO) {
    return { ars: sugerido, cambio: true, sugerido };
  }
  return { ars: precioGuardadoArs, cambio: false, sugerido };
}
