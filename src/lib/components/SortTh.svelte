<script lang="ts" generics="K extends string">
  // Заголовок колонки с сортировкой по клику.
  import type { TableSort } from '$lib/table-sort.svelte';
  let { sort, k, label, num = false, title = undefined }: { sort: TableSort<K>; k: K; label: string; num?: boolean; title?: string } = $props();
</script>

<th class="{num ? 'num ' : ''}cursor-pointer select-none whitespace-nowrap hover:text-ink {sort.key === k ? 'text-ink' : ''}" {title} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined} onclick={() => sort.toggle(k)}>{label}{sort.arrow(k)}</th>
