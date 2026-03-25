import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tests = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tests' }),
  schema: z.object({
    title:     z.string(),
    operation: z.string(),
    summary:   z.string(),
    preflight: z.string(),
    sample:    z.string().optional(),
  }),
});

export const collections = { tests };
