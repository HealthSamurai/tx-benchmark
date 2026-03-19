import { PUSH_URL } from './constants.ts';

export type Labels = Record<string, string>;
export type Metric = { name: string; help?: string; value: number | string };

export async function pushMetrics(
  labels: Labels,
  metrics: Metric[],
  pushUrl = PUSH_URL,
): Promise<void> {
  const path = Object.entries(labels)
    .map(([k, v]) => `${k}/${v}`)
    .join('/');

  const body = metrics
    .map(m => [
      `# TYPE ${m.name} gauge`,
      m.help ? `# HELP ${m.name} ${m.help}` : '',
      `${m.name} ${m.value}`,
    ].filter(Boolean).join('\n'))
    .join('\n') + '\n';

  const res = await fetch(`${pushUrl}/metrics/${path}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Pushgateway error ${res.status} for ${path}: ${await res.text()}`);
  }
}

export async function checkPushgateway(pushUrl = PUSH_URL): Promise<void> {
  const res = await fetch(`${pushUrl}/-/healthy`).catch(() => null);
  if (!res?.ok) {
    console.error(`ERROR: Pushgateway not reachable at ${pushUrl}`);
    console.error('Start the observability stack: cd observability && docker compose up -d');
    process.exit(1);
  }
}
