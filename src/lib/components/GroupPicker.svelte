<script lang="ts">
  // Фильтр по группе сайтов. Выбор хранится на сервере, как и выбор консолей.
  type Group = { id: number; name: string; active: boolean; size: number };
  let { groups }: { groups: Group[] } = $props();

  let open = $state(false);
  let saving = $state(false);
  let failed = $state<string | null>(null);

  const active = $derived(groups.find((g) => g.active) ?? null);

  async function choose(id: number | null) {
    saving = true;
    failed = null;
    try {
      const res = await fetch('/groups/active', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      location.reload();
    } catch (e) {
      failed = `Не сохранилось: ${(e as Error).message}`;
      saving = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:window onkeydown={open ? onKey : undefined} />

<div class="relative">
  <button
    type="button"
    class="btn btn-sm {active ? 'bg-acc-t text-acc hover:bg-acc-t' : 'btn-ghost'}"
    title="Показывать в отчётах только сайты выбранной группы"
    aria-expanded={open}
    onclick={() => {
      failed = null;
      open = !open;
    }}
  >
    Сайты: <span class="max-w-[9rem] truncate font-semibold">{active ? active.name : 'все'}</span>
  </button>

  {#if open}
    <button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Закрыть" onclick={() => (open = false)}></button>
    <div class="absolute right-0 z-50 mt-1 w-64 rounded-md border border-line bg-pane p-1 shadow-lg max-sm:fixed max-sm:inset-x-3 max-sm:top-11 max-sm:mt-0 max-sm:w-auto">
      <ul class="max-h-80 overflow-y-auto">
        <li>
          <button type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-sunk" disabled={saving} onclick={() => choose(null)}>
            <span class="w-3 text-acc">{active ? '' : '✓'}</span>
            <span class="flex-1">Все сайты</span>
          </button>
        </li>
        {#each groups as g (g.id)}
          <li>
            <button type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-sunk" disabled={saving} onclick={() => choose(g.id)}>
              <span class="w-3 text-acc">{g.active ? '✓' : ''}</span>
              <span class="min-w-0 flex-1 truncate">{g.name}</span>
              <span class="app-num text-xs text-ink-3">{g.size}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if groups.length === 0}
        <p class="px-2 py-1.5 text-xs text-ink-3">Групп пока нет.</p>
      {/if}
      {#if failed}<p class="px-2 py-1 text-xs text-bad">{failed}</p>{/if}
      <div class="mt-1 border-t border-line pt-1">
        <a href="/groups" class="btn btn-ghost btn-sm w-full justify-start" onclick={() => (open = false)}>Настроить группы…</a>
      </div>
    </div>
  {/if}
</div>
