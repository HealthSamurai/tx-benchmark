import { PROM_URL } from './constants.ts';

export async function queryProm(q: string, prom = PROM_URL): Promise<number | null> {
  const url = `${prom}/api/v1/query?query=${encodeURIComponent(q)}`;
  const res  = await fetch(url);
  const json = await res.json() as any;
  const val  = json?.data?.result?.[0]?.value?.[1];
  if (val == null || val === 'NaN') return null;
  const n = parseFloat(val);
  return isFinite(n) ? n : null;
}
