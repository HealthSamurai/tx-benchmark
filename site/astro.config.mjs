import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
export default defineConfig({
  integrations: [svelte(), mdx()],
  output: 'static',
  server: { port: 4100 },
});
