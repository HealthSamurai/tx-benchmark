export function fmtMs(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1000)  return (v / 1000).toFixed(2) + 's';
  if (v >= 10)    return Math.round(v) + 'ms';
  if (v >= 1)     return v.toFixed(1) + 'ms';
  return v.toFixed(2) + 'ms';
}

export function fmtBytes(b: number | null): string {
  if (!b) return '—';
  if (b >= 1e12) return (b / 1e12).toFixed(1) + ' TB';
  if (b >= 1e9)  return (b / 1e9).toFixed(1)  + ' GB';
  if (b >= 1e6)  return Math.round(b / 1e6)    + ' MB';
  if (b >= 1e3)  return Math.round(b / 1e3)    + ' KB';
  return b + ' B';
}

export function fmtRps(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return v.toFixed(0);
}

export function latencyColor(ms: number | null): string {
  if (ms === null) return 'var(--text-muted)';
  if (ms < 50)   return '#96D98D';
  if (ms < 100)  return '#73BF69';
  if (ms < 200)  return '#37872D';
  if (ms < 400)  return '#FFEE52';
  if (ms < 800)  return '#E0B400';
  if (ms < 1000) return '#FF9830';
  if (ms < 2000) return '#F2495C';
  if (ms < 3000) return '#E02F44';
  return '#C4162A';
}
