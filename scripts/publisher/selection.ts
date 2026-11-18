export type Report = { 'package-id': string; repo: string; dateISO8601: string; version: string };
export function select(reports: Report[], endDay: string) {
  const end = Date.parse(endDay + 'T00:00:00Z');
  if (!Number.isFinite(end) || new Date(end).toISOString().slice(0, 10) !== endDay)
    throw new Error('Invalid end date');
  const start = end - 7 * 86400_000;
  const candidates = reports.filter(
    (r) => r['package-id'] && r.repo && Date.parse(r.dateISO8601) >= start && Date.parse(r.dateISO8601) < end
  );
  candidates.sort(
    (a, b) => Date.parse(b.dateISO8601) - Date.parse(a.dateISO8601) || a.repo.localeCompare(b.repo, 'en')
  );
  const chosen = new Map<string, Report>();
  for (const r of candidates) if (!chosen.has(r['package-id'])) chosen.set(r['package-id'], r);
  const rows = [...chosen.values()].sort((a, b) => a['package-id'].localeCompare(b['package-id'], 'en'));
  return { start, end, candidates, rows };
}
