<script lang="ts">
  import type { ServerData } from '../../scripts/lib/loader.ts';

  export let servers: ServerData[];
  export let tests: string[];

  const SYMBOL: Record<string, string> = {
    pass: '✓',
    fail: '✗',
    skip: '~',
  };

  const CELL_CLASS: Record<string, string> = {
    pass: 'bg-emerald-950 text-emerald-400',
    fail: 'bg-red-950 text-red-400',
    skip: 'bg-neutral-900 text-neutral-600',
  };
</script>

<div class="overflow-x-auto">
  <table class="border-separate border-spacing-0.5 text-sm whitespace-nowrap">
    <thead>
      <tr>
        <th class="text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 pb-2 pr-8 min-w-32">
          Server
        </th>
        {#each tests as test}
          <th class="text-center text-xs font-semibold text-neutral-500 pb-2 min-w-10">
            {test}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each servers as server}
        <tr>
          <td class="text-left font-medium text-neutral-200 pr-8 py-1.5">
            {server.id}
          </td>
          {#each tests as test}
            {@const status = server.preflight[test] ?? 'skip'}
            <td
              class="text-center font-bold rounded-sm py-1.5 px-2 {CELL_CLASS[status]}"
              title="{server.id} / {test}: {status}"
            >
              {SYMBOL[status]}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
