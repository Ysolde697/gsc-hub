<script lang="ts">
  // Ячейка «В группу»: сколько ссылок (по умолчанию 2) и кнопка +.
  // + добавляет связку в выбранную группу с этим количеством, ✓ — убирает.
  // Пока ключ в группе, изменение числа сразу сохраняется.
  import { gi, inActive, toggleItem, activeGroup, itemKey, qtyInActive, setQty, type ItemRow } from '$lib/group-items.svelte';
  let { row }: { row: ItemRow } = $props();
  const DEFAULT_QTY = 2;
  const on = $derived(inActive(row.page, row.query));
  const busy = $derived(gi.busy.has(itemKey(row.page, row.query)));
  const g = $derived(activeGroup());
  const saved = $derived(qtyInActive(row.page, row.query));
  let draft = $state(DEFAULT_QTY);
  const value = $derived(on ? saved : draft);

  function onQty(n: number) {
    const v = Math.max(1, Math.min(1000, Math.round(n) || 1));
    if (on) setQty(row, v);
    else draft = v;
  }
</script>

<div class="flex items-center justify-end gap-1 whitespace-nowrap">
  <label class="flex items-center gap-0.5 text-[11px] text-ink-3" title="Сколько ссылок поставить на этот ключ">
    <input
      type="number"
      min="1"
      max="1000"
      class="input h-7 w-14 px-1 text-right text-xs {on ? 'border-acc' : ''}"
      {value}
      disabled={!!g?.fixedAt}
      aria-label="Количество ссылок"
      onchange={(e) => onQty(Number(e.currentTarget.value))}
    />шт
  </label>
  <button
    type="button"
    class="btn btn-sm {on ? 'bg-acc text-white hover:bg-acc-deep' : 'btn-sec'}"
    disabled={busy || !!g?.fixedAt}
    title={!g ? 'Сначала выберите группу над таблицей' : on ? `Убрать из ${g.name}` : `Добавить в ${g.name}`}
    aria-pressed={on}
    onclick={() => toggleItem({ ...row, qty: draft })}
  >{on ? `✓ ${g?.name}` : '+'}</button>
</div>
