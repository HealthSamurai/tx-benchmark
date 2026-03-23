<script>
  import { onMount } from 'svelte';

  let { option = {}, width = '100%', height = '200px' } = $props();

  let el;

  onMount(() => {
    let chart;
    let ro;

    import('echarts').then(echarts => {
      chart = echarts.init(el, null, { renderer: 'svg' });
      const cs = getComputedStyle(document.documentElement);
      const fontFamily = cs.getPropertyValue('--font-sans').trim();
      const fontSize = parseInt(cs.getPropertyValue('--text-xs')) || 12;
      const color = cs.getPropertyValue('--text-dim').trim() || '#999';
      const tooltipDefaults = {
        backgroundColor: 'rgba(16,16,24,0.95)',
        borderColor: '#2a2b3d',
        textStyle: { color: '#c0c0d0' },
        valueFormatter: (v) => {
          if (typeof v !== 'number') return v;
          if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
          return v.toFixed(0);
        },
      };
      chart.setOption({
        ...option,
        tooltip: option.tooltip ? { ...tooltipDefaults, ...option.tooltip } : undefined,
        textStyle: { fontFamily, fontSize, color, ...option.textStyle },
      });
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(el);
    });

    return () => {
      ro?.disconnect();
      chart?.dispose();
    };
  });
</script>

<div bind:this={el} style="width:{width};height:{height}"></div>
