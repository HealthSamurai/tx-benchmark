<script>
  let { option = {}, width = '100%', height = '200px' } = $props();

  let el = $state(null);
  let chart;

  $effect(() => {
    if (!el) return;

    let ro;
    import('echarts').then(echarts => {
      chart = echarts.init(el, null, { renderer: 'svg' });
      const cs = getComputedStyle(document.documentElement);
      const fontFamily = cs.getPropertyValue('--font-sans').trim();
      const fontSize = parseInt(cs.getPropertyValue('--text-xs')) || 12;
      const color = cs.getPropertyValue('--text-dim').trim() || '#999';
      chart.setOption({
        ...option,
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
