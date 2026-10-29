<script lang="ts">
  // Частотность ключа: точное число от Google Ads (DataForSEO), если проверяли,
  // и оценка по Search Console ваших сайтов: ≈ — сайт в топ-10, ≥ — только нижняя граница.
  import type { VolumeInfo } from '$lib/volumes.svelte';
  let { v, loading = false }: { v?: VolumeInfo; loading?: boolean } = $props();
  const fmt = (n: number) => n.toLocaleString('ru-RU');
  const estTitle = $derived(
    v?.est
      ? v.est.kind === 'top10'
        ? `Оценка по Search Console: ${v.est.host} на позиции ${v.est.position.toFixed(1)} — показы ≈ число запросов в месяц`
        : `Нижняя граница: ваши сайты ниже 10-го места (лучший ${v.est.host}, поз. ${v.est.position.toFixed(1)}) — запросов больше`
      : ''
  );
</script>

<div class="flex flex-col items-end leading-tight whitespace-nowrap">
  {#if v?.dfs !== undefined}
    <span class="app-num font-semibold text-ink" title="Google Ads через DataForSEO, запросов в месяц">{v.dfs === null ? 'нет данных' : fmt(v.dfs)} <span class="text-[10px] font-normal text-ink-3">Ads</span></span>
  {/if}
  {#if v?.est}
    <span class="app-num text-[11px] {v.dfs !== undefined ? 'text-ink-3' : 'text-ink-2'}" title={estTitle}>{v.est.kind === 'top10' ? '≈' : '≥'} {fmt(v.est.value)} <span class="text-[10px] text-ink-4">GSC</span></span>
  {:else if v?.dfs === undefined}
    <span class="text-ink-4">{loading ? '…' : '—'}</span>
  {/if}
</div>
