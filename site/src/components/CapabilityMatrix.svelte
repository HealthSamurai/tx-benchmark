<script lang="ts">
  import type { ServerData } from '../../scripts/lib/loader.ts';

  export let servers: ServerData[];
  export let tests: string[];

  const SYMBOL: Record<string, string> = {
    pass: '✓',
    fail: '✗',
    skip: '~',
  };
</script>

<div class="matrix-wrap">
  <table class="matrix">
    <thead>
      <tr>
        <th class="server-col">Server</th>
        {#each tests as test}
          <th class="test-col" title={test}>{test}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each servers as server}
        <tr>
          <td class="server-name">{server.id}</td>
          {#each tests as test}
            {@const status = server.preflight[test] ?? 'skip'}
            <td class="cell {status}" title="{server.id} / {test}: {status}">
              {SYMBOL[status]}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .matrix-wrap {
    overflow-x: auto;
  }

  .matrix {
    border-collapse: separate;
    border-spacing: 2px;
    font-size: var(--text-base);
    white-space: nowrap;
  }

  thead th {
    padding: var(--space-2) var(--space-2);
    color: var(--text-dim);
    font-weight: 500;
    font-size: var(--text-xs);
    letter-spacing: 0.04em;
    text-align: center;
  }

  th.server-col {
    text-align: left;
    padding-right: var(--space-5);
    min-width: 120px;
  }

  td {
    padding: var(--space-2) var(--space-3);
    text-align: center;
  }

  td.server-name {
    text-align: left;
    font-weight: 500;
    font-size: var(--text-base);
    color: var(--text);
    padding-right: var(--space-5);
  }

  td.cell {
    font-size: 15px;
    font-weight: 700;
    border-radius: var(--radius-sm);
    min-width: 36px;
  }

  td.pass {
    background: linear-gradient(120deg, rgb(77, 172, 73), rgb(115, 191, 105));
    color: rgb(247, 248, 250);
  }

  td.fail {
    background: linear-gradient(120deg, rgb(239, 25, 32), rgb(242, 73, 92));
    color: rgb(247, 248, 250);
  }

  td.skip {
    background: linear-gradient(120deg, rgb(176, 174, 199), rgb(204, 204, 220));
    color: rgb(32, 34, 38);
  }
</style>
