#!/usr/bin/env node
/*
  Actualiza el precio en pesos de los cursos según el dólar Banco Nación.

  Uso:
    npm run precios          → muestra qué cambiaría, sin tocar nada
    npm run precios:aplicar  → escribe los .md

  Corre automáticamente antes de cada build (ver "prebuild" en
  package.json), así el sitio se publica siempre con precios al día.

  Regla: el precio solo se mueve si el sugerido (USD × dólar BNA,
  redondeado a $5.000) se despegó 3% o más del precio publicado.
  Ver src/lib/dolar.ts para el detalle.
*/

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_CURSOS = join(RAIZ, 'src/content/cursos');

const UMBRAL_CAMBIO = 0.03;
const REDONDEO_ARS = 5000;
const COTIZACION_FALLBACK = 1535;

const aplicar = process.argv.includes('--aplicar');

const FUENTES = [
  {
    nombre: 'criptoya/bna',
    url: 'https://criptoya.com/api/bancostodos',
    extraer: (j) => valido(j?.bna?.ask),
  },
  {
    nombre: 'dolarapi/oficial',
    url: 'https://dolarapi.com/v1/dolares/oficial',
    extraer: (j) => valido(j?.venta),
  },
];

function valido(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 100 || n > 1_000_000) return null;
  return n;
}

async function getCotizacion() {
  for (const f of FUENTES) {
    try {
      const res = await fetch(f.url, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const venta = f.extraer(json);
      if (venta === null) continue;
      return { venta, fuente: f.nombre };
    } catch {
      // siguiente fuente
    }
  }
  return { venta: COTIZACION_FALLBACK, fuente: 'FALLBACK — fuentes caídas' };
}

const redondear = (m) => Math.round(m / REDONDEO_ARS) * REDONDEO_ARS;
const fmt = (n) => '$' + n.toLocaleString('es-AR');

async function main() {
  const { venta, fuente } = await getCotizacion();
  const esFallback = fuente.startsWith('FALLBACK');

  console.log(`\n  Dólar BNA (venta): ${fmt(venta)}   [${fuente}]`);
  console.log(`  Umbral de cambio: ${UMBRAL_CAMBIO * 100}%  ·  Redondeo: ${fmt(REDONDEO_ARS)}\n`);

  /*
    Si ninguna fuente respondió, NO tocamos los precios: preferimos
    publicar el precio de ayer antes que uno calculado con un dólar
    inventado.
  */
  if (esFallback && aplicar) {
    console.log('  ⚠  No se pudo obtener la cotización. Se dejan los precios como están.\n');
    return;
  }

  const archivos = (await readdir(DIR_CURSOS)).filter((f) => f.endsWith('.md'));
  let cambios = 0;

  for (const archivo of archivos.sort()) {
    const ruta = join(DIR_CURSOS, archivo);
    const texto = await readFile(ruta, 'utf8');

    /*
      Leemos el bloque `precio:` del frontmatter. Regex en vez de un
      parser de YAML para no sumar dependencias y para reescribir el
      archivo dejando intacto todo el resto (comentarios, formato).
    */
    const bloque = texto.match(/^precio:\n((?:[ \t]+\w+:.*\n)+)/m);
    if (!bloque) {
      console.log(`  ${archivo.padEnd(42)} sin bloque precio, se omite`);
      continue;
    }

    const ars = Number(bloque[1].match(/^[ \t]+ars:[ \t]*(\d+)/m)?.[1]);
    const usd = Number(bloque[1].match(/^[ \t]+usd:[ \t]*(\d+)/m)?.[1]);

    if (!Number.isFinite(usd) || usd <= 0) {
      console.log(`  ${archivo.padEnd(42)} ${fmt(ars)}  (sin usd de referencia, no se toca)`);
      continue;
    }

    const sugerido = redondear(usd * venta);
    const desvio = Math.abs(sugerido - ars) / ars;
    const nombre = archivo.replace('.md', '');

    if (desvio < UMBRAL_CAMBIO) {
      const pct = (desvio * 100).toFixed(1);
      console.log(`  ${nombre.padEnd(42)} ${fmt(ars)}  =  (sugerido ${fmt(sugerido)}, ${pct}% < umbral)`);
      continue;
    }

    const flecha = sugerido > ars ? '↑' : '↓';
    const pct = (desvio * 100).toFixed(1);
    console.log(`  ${nombre.padEnd(42)} ${fmt(ars)} ${flecha} ${fmt(sugerido)}  (${pct}%)`);
    cambios++;

    if (aplicar) {
      // Reemplazamos solo la línea `ars:` dentro del bloque `precio:`.
      const nuevoBloque = bloque[1].replace(/^([ \t]+ars:[ \t]*)\d+/m, `$1${sugerido}`);
      await writeFile(ruta, texto.replace(bloque[1], nuevoBloque), 'utf8');
    }
  }

  console.log('');
  if (cambios === 0) {
    console.log('  Sin cambios: todos los precios están dentro del umbral.\n');
  } else if (aplicar) {
    console.log(`  ✓ ${cambios} precio(s) actualizado(s) en los .md\n`);
  } else {
    console.log(`  ${cambios} precio(s) cambiarían. Para aplicar: npm run precios:aplicar\n`);
  }
}

main().catch((err) => {
  /*
    Un fallo acá nunca debe romper el deploy: si algo sale mal, el sitio
    se publica con los precios que ya tenía.
  */
  console.error('  ⚠  Error actualizando precios (se publican los actuales):', err.message);
  process.exit(0);
});
