import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  // Dominio final (ajustar cuando esté definido con el cliente).
  site: 'https://wellsolutions.com.ar',

  // La landing es estática; solo los endpoints de /api (Mercado Pago)
  // corren on-demand. output: 'static' + adapter deja las páginas
  // pre-renderizadas y renderiza bajo demanda solo lo que marque
  // `export const prerender = false`.
  output: 'static',

  // Desplegamos en Cloudflare Pages. El adapter habilita las
  // Functions (Workers) para los endpoints de checkout/webhook.
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),

  vite: {
    // cast: astro y @tailwindcss/vite resuelven copias distintas de los
    // tipos de Vite; el plugin funciona en runtime (falso positivo de TS).
    plugins: [tailwindcss() as any],
  },
});
