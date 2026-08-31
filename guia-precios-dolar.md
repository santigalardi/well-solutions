# Precios atados al dólar Banco Nación

Cómo se actualiza solo el precio en pesos de los cursos.

## La idea

Cada curso tiene dos precios en su archivo:

```yaml
precio:
  ars: 125000   # el que se publica y se cobra
  usd: 80       # la referencia estable
```

El de **USD es la referencia** (lo que "vale" el curso). El de **pesos es
el que se muestra y se cobra**, y se recalcula solo:

```
precio en pesos = USD × dólar BNA (venta), redondeado a $5.000
```

## Las tres reglas

1. **Redondeo a $5.000.** Nunca se publica un $123.487. Siempre números
   limpios: $125.000, $140.000, $185.000.

2. **Umbral del 3%.** El precio solo cambia si el cálculo se despegó 3% o
   más del publicado. Si el dólar se mueve poco, el precio no se toca.
   En la práctica cambia **una o dos veces por mes**, no todos los días.

3. **Si falla, no rompe.** Si las APIs del dólar no responden, el sitio se
   publica con los precios que ya tenía. Nunca queda un curso a $0.

## De dónde sale la cotización

| Orden | Fuente | Qué devuelve |
|---|---|---|
| 1ª | `criptoya.com/api/bancostodos` → campo `bna` | Banco Nación, explícito |
| 2ª | `dolarapi.com/v1/dolares/oficial` | Dólar oficial (sigue al BNA) |
| 3ª | Valor de respaldo en el código | Solo si las dos fallan |

> No usamos la página de La Nación: es HTML con publicidad y se rompe con
> cualquier rediseño del sitio. Estas dos APIs publican la misma
> cotización del BNA en formato estable.

## Cuándo corre

Todos los días a las **9:00 de la mañana** (hora Argentina), automático.
Trae el dólar, recalcula, y si algún precio cambió republica el sitio.

También se puede disparar a mano desde GitHub → pestaña **Actions** →
*Precios diarios* → **Run workflow**.

## Comandos

```bash
npm run precios          # muestra qué cambiaría, sin tocar nada
npm run precios:aplicar  # aplica los cambios a los archivos
npm run build            # aplica precios y compila (lo hace solo)
```

`npm run precios` es el que conviene correr para espiar: no modifica nada,
solo lista curso por curso el precio actual, el sugerido y el desvío.

## Cambiar el precio de un curso

Se toca **el USD**, no los pesos:

```yaml
precio:
  ars: 125000
  usd: 90       # ← acá
```

En el próximo build los pesos se recalculan solos. (Si se edita el `ars`
a mano también funciona, pero al día siguiente el sistema lo va a volver
a alinear con el USD si la diferencia supera el 3%.)

## Ajustar las reglas

En `src/lib/dolar.ts` y `scripts/actualizar-precios.mjs`:

- `UMBRAL_CAMBIO = 0.03` → subir a `0.05` para que el precio se mueva
  menos seguido; bajar a `0.01` para que siga más de cerca al dólar.
- `REDONDEO_ARS = 5000` → cambiar a `10000` para números más redondos.

## Setup pendiente (una sola vez)

Para que el deploy automático funcione, cargar en GitHub →
**Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — token con permiso *Edit Cloudflare Workers*
- `CLOUDFLARE_ACCOUNT_ID` — ID de la cuenta de Cloudflare

Sin esos secrets el cálculo de precios igual funciona en cada build
manual; lo único que falta es que se publique solo.
