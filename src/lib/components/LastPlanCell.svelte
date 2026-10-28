<script lang="ts">
  // «Последняя закупка»: когда на этот ключ в последний раз брали ссылки
  // (кроме выбранной сейчас группы), сколько и как давно. Клик — вся история.
  import { otherGroups } from '$lib/group-items.svelte';
  let { page, query }: { page: string; query: string } = $props();
  const list = $derived(otherGroups(page, query));
  const last = $derived(list[list.length - 1] ?? null);
  const ago = (at: number) => {
    const d = Math.floor((Date.now() - at) / 864e5);
    return d <= 0 ? 'сегодня' : `${d} дн. назад`;
  };
</script>

{#if !last}
  <span class="text-ink-4">—</span>
{:else if list.length === 1}
  <a class="whitespace-nowrap text-[12px] hover:underline" href="/groups?g={last.groupId}" title="Ссылки на этот ключ брали в группе {last.name}">
    <span class="font-medium text-ink">{last.name}</span> <span class="text-ink-3">· {last.qty} шт · {ago(last.at)}</span>
  </a>
{:else}
  <details class="relative text-[12px]">
    <summary class="cursor-pointer list-none whitespace-nowrap hover:underline" title="Ссылки на этот ключ брали {list.length} раз">
      <span class="font-medium text-ink">{last.name}</span> <span class="text-ink-3">· {last.qty} шт · {ago(last.at)}</span>
      <span class="ml-1 rounded bg-sunk px-1 text-[10px] text-ink-2">ещё {list.length - 1}</span>
    </summary>
    <ul class="absolute right-0 z-20 mt-1 min-w-[14rem] rounded border border-line bg-pane p-1 text-left shadow-lg">
      {#each [...list].reverse() as o (o.groupId)}
        <li><a class="block whitespace-nowrap rounded px-2 py-0.5 hover:bg-sunk" href="/groups?g={o.groupId}">{o.name} · {o.qty} шт · {ago(o.at)}</a></li>
      {/each}
    </ul>
  </details>
{/if}
