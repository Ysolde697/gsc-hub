<script lang="ts">
  // Над таблицей Sites: в какую группу добавляются сайты кнопкой +.
  import { gi, targetGroup, chooseTarget, createTarget } from '$lib/group-items.svelte';
  const g = $derived(targetGroup());
  const hasToday = $derived(gi.groups.some((x) => x.name === gi.today));
</script>

<div class="flex flex-wrap items-center gap-2 border-b border-line bg-sunk px-3 py-1.5 text-xs">
  <span class="font-medium text-ink-2">Сайты в группу:</span>
  <select class="input h-7 text-xs" aria-label="Группа для сайтов" value={g?.id ?? ''} onchange={(e) => chooseTarget(Number(e.currentTarget.value) || null)}>
    {#if gi.groups.length === 0}<option value="">— нет групп —</option>{/if}
    {#each gi.groups as x (x.id)}<option value={x.id}>{x.name} · {x.hosts.length} сайт.</option>{/each}
  </select>
  {#if !hasToday}
    <button type="button" class="btn btn-sec btn-sm" onclick={() => createTarget()}>+ Группа на {gi.today || 'сегодня'}</button>
  {/if}
  {#if g}
    <a class="btn btn-ghost btn-sm" href="/groups?g={g.id}">Открыть группу ({g.hosts.length})</a>
    <span class="text-ink-3">Нажмите <b>+</b> у сайта, чтобы добавить его в «{g.name}».</span>
  {/if}
  {#if gi.error}<span class="text-bad" role="alert">{gi.error}</span>{/if}
</div>
