import type { APIRoute } from 'astro';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import runs from '../../../data/runs.json';

export function getStaticPaths() {
  return runs
    .filter(r => existsSync(resolve(`src/data/${r.id}.errors.csv`)))
    .map(r => ({ params: { run: r.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const csv = readFileSync(resolve(`src/data/${params.run}.errors.csv`), 'utf-8');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${params.run}-errors.csv"`,
    },
  });
};
