# Fix del SPF — autorizar a Gmail a enviar por el dominio

**Problema:** el mail de confirmación de compra sale por Gmail (Make lo
manda con la cuenta de Santiago usando "send as"), pero el SPF de
`wellsolutions.com.ar` solo autoriza a Cloudflare. Gmail no está
autorizado → el mail puede caer en spam o mostrar advertencia.

## El cambio

En **dash.cloudflare.com** → zona `wellsolutions.com.ar` → **DNS** →
buscar el registro **TXT** de la raíz (`@`) que empieza con `v=spf1`.

**Valor actual:**
```
v=spf1 include:_spf.mx.cloudflare.net ~all
```

**Reemplazar por:**
```
v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all
```

Es agregar `include:_spf.google.com` antes del `~all`. Nada más.

## Por qué es seguro

- Solo **agrega** un remitente autorizado; no toca la recepción de correo
  (eso lo manejan los registros MX, que no se tocan).
- Verificado: 2 lookups DNS de los 10 que permite el estándar, y ambos
  includes resuelven directo a IPs sin anidarse.
- 66 caracteres, dentro del límite de 255 de un string TXT.
- Reversible: si algo sale mal, se vuelve al valor anterior.

## Verificar que quedó bien

Esperar unos minutos y correr:

```bash
dig +short TXT wellsolutions.com.ar
```

Tiene que devolver el valor nuevo, con los dos `include:`.

## Lo que esto NO resuelve

- **DKIM**: Gmail firma con `gmail.com`, no con el dominio. Para DKIM
  propio hace falta Google Workspace.
- **DMARC**: el dominio no tiene registro `_dmarc`. No es urgente, pero
  conviene sumarlo más adelante (empezando en `p=none` para solo observar).

Con el SPF arreglado el mail ya debería llegar bien a Recibidos. Lo otro
es mejora incremental de reputación.
