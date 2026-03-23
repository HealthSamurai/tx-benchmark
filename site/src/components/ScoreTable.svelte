<script lang="ts">
  import type { ServerData } from '../types';

  export let servers: ServerData[];
  export let tests: string[];

  type PreflightStatus = 'pass' | 'fail' | 'skip';

  function meanErrorRate(server: ServerData): number {
    const vals = tests.flatMap(t => {
      const vusData = server.benchmark[t];
      if (!vusData) return [];
      const maxVus = Math.max(...Object.keys(vusData).map(Number).sort((a, b) => a - b));
      return vusData[maxVus]?.errorRate ?? [];
    });
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  function fmtRps(v: number): string {
    if (v >= 1000) return (v / 1000).toFixed(2) + 'K';
    return v.toFixed(1);
  }

  const rows = servers.map((s, i) => ({
    rank: i + 1,
    id: s.id,
    score: s.score,
    rawScore: s.rawScore,
    errRate: meanErrorRate(s),
    preflight: s.preflight,
  }));
</script>

<div class="wrap">
  <table>
    <thead>
      <tr>
        <th class="col-rank">#</th>
        <th class="col-server">Server</th>
        <th class="col-num r">wRPS</th>
        <th class="col-score">Score</th>
        <th class="col-num r">Errors</th>
        <th class="col-tests">Tests</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr>
          <td class="rank">{row.rank}</td>
          <td class="server">{row.id}</td>
          <td class="num r">{row.rawScore.toFixed(0)}</td>
          <td class="score-cell">
            <div class="bar-wrap">
              <div class="bar-track">
                <div class="bar-mask" style="left:{row.score.toFixed(1)}%"></div>
              </div>
              <span class="bar-pct">{Math.round(row.score)}</span>
            </div>
          </td>
          <td class="num r" class:err-bad={row.errRate > 0.005} class:err-ok={row.errRate <= 0.005}>
            {(row.errRate * 100).toFixed(2)}%
          </td>
          <td class="tests-cell">
            <div class="pips">
              {#each tests as test}
                {@const status = (row.preflight[test] ?? 'skip') as PreflightStatus}
                <span class="pip pip-{status}" title="{test}: {status}"></span>
              {/each}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap { overflow-x: auto; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  thead th {
    text-align: left;
    padding: 6px 10px;
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }
  thead th.r { text-align: right; }

  tbody tr { border-bottom: 1px solid #15161c; }
  tbody tr:hover { background: #14151c; }

  td { padding: 8px 10px; vertical-align: middle; }
  td.r { text-align: right; }

  .rank { color: var(--text-muted); font-size: var(--text-xs); width: 32px; }
  .server { font-weight: 500; color: #e4e4e4; }

  .num {
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .unit { color: var(--text-muted); font-size: var(--text-xs); }

  .err-bad { color: #e05252; }
  .err-ok  { color: var(--text-muted); }

  /* Score bar */
  .score-cell { min-width: 220px; }
  .bar-wrap { display: flex; align-items: center; gap: 8px; }
  .bar-track {
    flex: 1;
    height: 16px;
    border-radius: var(--radius-sm);
    position: relative;
    overflow: hidden;
    min-width: 140px;
    background: linear-gradient(90deg, #f2495c 0%, #fade2a 50%, #73bf69 100%);
  }
  .bar-mask {
    position: absolute;
    top: 0; bottom: 0; right: 0;
    background: var(--surface-2);
  }
  .bar-pct {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-size: var(--text-sm);
    min-width: 32px;
    text-align: right;
    color: var(--text-dim);
  }

  /* Preflight pips */
  .pips { display: flex; gap: 2px; align-items: center; }
  .pip {
    width: 7px;
    height: 7px;
    border-radius: 1px;
    flex-shrink: 0;
  }
  .pip-pass { background: var(--pass); }
  .pip-fail { background: var(--fail); }
  .pip-skip { background: var(--skip); opacity: 0.4; }
</style>
