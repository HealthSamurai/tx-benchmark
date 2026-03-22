import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  integrations: [svelte(), mdx()],
  output: 'static',
  site: 'https://healthsamurai.github.io',
  base: '/tx-benchmark',
  server: { port: 4100 },
  vite: {
    resolve: {
      conditions: ['browser', 'svelte', 'import', 'module', 'default'],
    },
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
