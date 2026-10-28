<script lang="ts">
  // Над таблицей Striking Distance: в какую группу летят ключи по кнопке +.
  import { gi, activeGroup, switchGroup, startToday, setDone } from '$lib/group-items.svelte';
  import { siteHostname } from '$lib/utils/url-filters';
  let { site }: { site?: string } = $props();

  const g = $derived(activeGroup());
  const host = $derived.by(() => {
    try {
      return site ? siteHostname(site) : null;
    } catch {
      return null;
    }
  });
  const inGroup = $derived(!!g && !!host && g.hosts.includes(host));
  const done = $derived(!!g && !!host && g.done.includes(host));
  const hasToday = $derived(gi.groups.some((x) => x.name === gi.today));
</script>

<div class="flex flex-wrap items-center gap-2 rounded border border-line bg-sunk px-2 py-1.5 text-xs">
  <span class="font-medium text-ink-2">Ключи в группу:</span>
  <select
    class="input h-7 text-xs"
    aria-label="Группа"
    value={g?.id ?? ''}
    onchange={(e) => switchGroup(Number(e.currentTarget.value) || null)}
  >
    <option value="">— не выбрана —</option>
    {#each gi.groups as x (x.id)}
      <option value={x.id}>{x.name} · {x.items} ключ.{x.fixedAt ? ' · зафиксирована' : ''}</option>
    {/each}
  </select>
  {#if !hasToday}
    <button type="button" class="btn btn-sec btn-sm" onclick={() => startToday(site)}>
      + Группа на {gi.today || 'сегодня'}{site ? ' с этим сайтом' : ''}
    </button>
  {/if}
  {#if g}
    <a class="btn btn-ghost btn-sm" href="/groups?g={g.id}">Открыть группу ({g.items})</a>
    {#if g.fixedAt}<span class="text-ink-3">Зафиксирована — добавлять нельзя.</span>{/if}
    {#if inGroup}
      <label class="ml-auto flex cursor-pointer items-center gap-1 font-medium {done ? 'text-up' : 'text-ink-2'}">
        <input type="checkbox" checked={done} onchange={(e) => setDone(host!, e.currentTarget.checked)} />
        Сайт пройден
      </label>
    {:else if host}
      <span class="ml-auto text-ink-3">Этого сайта нет в группе «{g.name}» — ключи всё равно можно добавлять.</span>
    {/if}
  {:else}
    <span class="text-ink-3">Выберите группу, чтобы отбирать ключи кнопкой +.</span>
  {/if}
  {#if gi.error}<span class="text-bad" role="alert">{gi.error}</span>{/if}
</div>
