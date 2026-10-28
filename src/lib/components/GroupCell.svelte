<script lang="ts">
  // Ячейка «В группу»: + добавляет связку в выбранную группу, ✓ — убирает.
  import { gi, inActive, toggleItem, activeGroup, itemKey, qtyInActive, setQty, type ItemRow } from '$lib/group-items.svelte';
  let { row }: { row: ItemRow } = $props();
  const on = $derived(inActive(row.page, row.query));
  const busy = $derived(gi.busy.has(itemKey(row.page, row.query)));
  const g = $derived(activeGroup());
  const qty = $derived(qtyInActive(row.page, row.query));
</script>

<div class="flex items-center justify-end gap-1 whitespace-nowrap">
  <button
    type="button"
    class="btn btn-sm {on ? 'bg-acc text-white hover:bg-acc-deep' : 'btn-sec'}"
    disabled={busy || !g || !!g?.fixedAt}
    title={!g ? 'Сначала выберите группу над таблицей' : on ? `Убрать из ${g.name}` : `Добавить в ${g.name}`}
    aria-pressed={on}
    onclick={() => toggleItem(row)}
  >{on ? `✓ ${g?.name}` : '+'}</button>
  {#if on}
    <label class="flex items-center gap-0.5 text-[11px] text-ink-3" title="Сколько ссылок поставить на этот ключ">
      <input
        type="number"
        min="1"
        max="1000"
        class="input h-7 w-14 px-1 text-right text-xs"
        value={qty}
        disabled={!!g?.fixedAt}
        aria-label="Количество ссылок"
        onchange={(e) => setQty(row, Number(e.currentTarget.value))}
      />шт
    </label>
  {/if}
</div>
