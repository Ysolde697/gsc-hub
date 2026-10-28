<script lang="ts">
  // История ссылок по сайту: всё, что отбиралось в группы (анкорные и безанкорные).
  import { gi } from '$lib/group-items.svelte';
  const total = $derived(gi.history.reduce((a, h) => a + h.qty, 0));
  let open = $state(false);
</script>

<details class="rounded border border-line" bind:open>
  <summary class="cursor-pointer px-2 py-1.5 text-xs font-medium text-ink-2">
    История ссылок по сайту · {gi.history.length} строк · {total} ссылок
  </summary>
  {#if gi.history.length === 0}
    <p class="px-2 pb-2 text-xs text-ink-3">Пока ничего не отбиралось.</p>
  {:else}
    <div class="max-h-80 overflow-auto">
      <table class="app-table">
        <thead><tr><th>Группа</th><th>Тип</th><th>Анкор</th><th>Страница</th><th class="num">Ссылок</th><th class="num">Pos</th></tr></thead>
        <tbody>
          {#each gi.history as h (h.id)}
            <tr>
              <td class="whitespace-nowrap"><a class="text-acc hover:underline" href="/groups?g={h.groupId}">{h.groupName}</a>{#if h.fixedAt}<span class="ml-1 text-[10px] text-ink-3">зафикс.</span>{/if}</td>
              <td class="text-xs text-ink-3">{h.kind === 'naked' ? 'Безанкор' : 'Анкор'}</td>
              <td class="pii font-medium">{h.kind === 'naked' ? '—' : h.query}</td>
              <td class="max-w-md"><a class="pii break-all text-ink-3 hover:text-acc hover:underline" href={h.page} target="_blank" rel="noopener noreferrer">{h.page}</a></td>
              <td class="num app-num">{h.qty}</td>
              <td class="num app-num">{h.position === null ? '—' : h.position.toFixed(1)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</details>
