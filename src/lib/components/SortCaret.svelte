<script lang="ts">
  // Значок сортировки в заголовке таблицы: синяя стрелка у выбранной колонки,
  // бледная ↕ у остальных — видно, что по колонке можно сортировать.
  let { dir }: { dir: 'asc' | 'desc' | '' } = $props();
</script>

{#if dir}
  <svg viewBox="0 0 10 10" class="ml-0.5 inline-block h-2.5 w-2.5 align-[-1px] text-acc" aria-label={dir === 'asc' ? 'ascending' : 'descending'} role="img">
    <path d={dir === 'asc' ? 'M2 6.5 5 3.5l3 3' : 'M2 3.5 5 6.5l3-3'} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
{:else}
  <svg viewBox="0 0 10 10" class="ml-0.5 inline-block h-2.5 w-2.5 align-[-1px] text-ink-4 opacity-70" aria-hidden="true">
    <path d="M3 4 5 2l2 2M3 6l2 2 2-2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
{/if}
