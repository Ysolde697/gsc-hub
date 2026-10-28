<script lang="ts">
  // Ячейка «В группу»: + добавляет связку в выбранную группу, ✓ — убирает.
  import { gi, inActive, otherGroups, toggleItem, activeGroup, itemKey, type ItemRow } from '$lib/group-items.svelte';
  let { row }: { row: ItemRow } = $props();
  const on = $derived(inActive(row.page, row.query));
  const others = $derived(otherGroups(row.page, row.query));
  const busy = $derived(gi.busy.has(itemKey(row.page, row.query)));
  const g = $derived(activeGroup());
</script>

<div class="flex items-center justify-end gap-1 whitespace-nowrap">
  {#if others.length === 1}
    <a class="text-[11px] text-warn hover:underline" href="/groups?g={others[0].groupId}" title="Этот ключ уже есть в группе {others[0].name}">{others[0].name}</a>
  {:else if others.length > 1}
    <details class="relative text-[11px]">
      <summary class="cursor-pointer list-none text-warn hover:underline" title="Этот ключ уже есть в {others.length} группах">{others[others.length - 1].name} +{others.length - 1}</summary>
      <ul class="absolute right-0 z-20 mt-1 min-w-[8rem] rounded border border-line bg-pane p-1 text-left shadow-lg">
        {#each others as o (o.groupId)}<li><a class="block rounded px-2 py-0.5 hover:bg-sunk" href="/groups?g={o.groupId}">{o.name}</a></li>{/each}
      </ul>
    </details>
  {/if}
  <button
    type="button"
    class="btn btn-sm {on ? 'bg-acc text-white hover:bg-acc-deep' : 'btn-sec'}"
    disabled={busy || !g || !!g?.fixedAt}
    title={!g ? 'Сначала выберите группу над таблицей' : on ? `Убрать из ${g.name}` : `Добавить в ${g.name}`}
    aria-pressed={on}
    onclick={() => toggleItem(row)}
  >{on ? `✓ ${g?.name}` : '+'}</button>
</div>
