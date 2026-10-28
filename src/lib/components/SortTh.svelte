<script lang="ts" generics="K extends string">
  // Заголовок колонки с сортировкой по клику.
  import type { TableSort } from '$lib/table-sort.svelte';
  import SortCaret from './SortCaret.svelte';
  let { sort, k, label, num = false, title = undefined }: { sort: TableSort<K>; k: K; label: string; num?: boolean; title?: string } = $props();
  const dir = $derived(sort.key === k ? (sort.dir === 1 ? 'asc' : 'desc') : '');
</script>

<th class="{num ? 'num ' : ''}cursor-pointer select-none whitespace-nowrap hover:text-ink {sort.key === k ? 'text-ink' : ''}" {title} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined} onclick={() => sort.toggle(k)}>{label}<SortCaret {dir} /></th>
