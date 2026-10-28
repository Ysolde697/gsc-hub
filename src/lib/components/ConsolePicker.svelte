<script lang="ts">
  // Выбор консолей (Google-аккаунтов) для отчётов. Выбор хранится на сервере,
  // поэтому он одинаков во всех вкладках и действует и на MCP для Claude.
  type Console = { id: string; email: string; label: string | null; status: string; inUse: boolean };
  let { consoles, overridden = false }: { consoles: Console[]; overridden?: boolean } = $props();

  let open = $state(false);
  let saving = $state(false);
  let failed = $state<string | null>(null);
  let query = $state('');
  // Черновик галочек: применяется кнопкой, чтобы не перезагружать отчёты
  // после каждого клика, когда отмечаешь пять консолей из двадцати.
  let draft = $state<Set<string>>(new Set());

  const inUseCount = $derived(consoles.filter((c) => c.inUse).length);
  const label = $derived(
    inUseCount === consoles.length ? 'все' : `${inUseCount} из ${consoles.length}`
  );
  const shown = $derived(
    query.trim()
      ? consoles.filter((c) =>
          `${c.email} ${c.label ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
        )
      : consoles
  );
  const dirty = $derived(
    consoles.some((c) => c.inUse !== draft.has(c.id))
  );

  function openMenu() {
    draft = new Set(consoles.filter((c) => c.inUse).map((c) => c.id));
    failed = null;
    query = '';
    open = true;
  }

  function toggle(id: string) {
    const next = new Set(draft);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    draft = next;
  }

  async function apply(ids: string[]) {
    saving = true;
    failed = null;
    try {
      const res = await fetch('/accounts/in-use', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Часть страниц грузит данные из браузера уже после открытия, поэтому
      // надёжнее перечитать страницу целиком, чем перезапускать только load.
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

{#if consoles.length > 0}
  <div class="relative">
    <button
      type="button"
      class="btn btn-sm {overridden ? 'btn-ghost text-ink-4 line-through' : inUseCount < consoles.length ? 'bg-acc-t text-acc hover:bg-acc-t' : 'btn-ghost'}"
      title={overridden ? 'Не действует, пока выбрана группа сайтов: видны все её сайты из любых консолей' : 'Какие Google-консоли участвуют в отчётах и в MCP'}
      aria-expanded={open}
      onclick={() => (open ? (open = false) : openMenu())}
    >
      Консоли: <span class="app-num font-semibold">{label}</span>
    </button>

    {#if open}
      <button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Закрыть" onclick={() => (open = false)}></button>
      <div class="absolute right-0 z-50 mt-1 w-[22rem] max-sm:fixed max-sm:inset-x-3 max-sm:top-11 max-sm:mt-0 max-sm:w-auto rounded-md border border-line bg-pane p-2 shadow-lg">
        {#if overridden}
          <p class="mb-2 rounded bg-warn-t px-2 py-1 text-xs text-ink-2">Сейчас выбрана группа сайтов — она главнее: видны все её сайты из любых консолей. Галочки ниже заработают, когда снимете группу («Сайты: все»).</p>
        {/if}
        <div class="mb-2 flex flex-wrap items-center gap-1">
          <button type="button" class="btn btn-sec btn-sm" onclick={() => (draft = new Set(consoles.map((c) => c.id)))}>Все</button>
          <button type="button" class="btn btn-sec btn-sm" onclick={() => (draft = new Set())}>Ни одной</button>
          <span class="ml-auto text-xs text-ink-3">отмечено {draft.size}</span>
        </div>
        {#if consoles.length > 8}
          <input class="input mb-2 h-7 w-full text-xs" placeholder="Поиск по почте или метке" bind:value={query} />
        {/if}
        <ul class="max-h-80 overflow-y-auto">
          {#each shown as c (c.id)}
            <li class="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-sunk">
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={draft.has(c.id)} onchange={() => toggle(c.id)} />
                <span class="min-w-0 flex-1">
                  <span class="pii block truncate text-[13px] text-ink">{c.label || c.email}</span>
                  {#if c.label}<span class="pii block truncate text-[11px] text-ink-3">{c.email}</span>{/if}
                </span>
                {#if c.status !== 'active'}
                  <span class="badge {c.status === 'revoked' ? 'badge-bad' : 'badge-warn'}" title="Консоль не отвечает и в отчёты не попадёт, пока её не переподключат">{c.status}</span>
                {/if}
              </label>
              <button
                type="button"
                class="btn btn-ghost btn-sm invisible text-xs group-hover:visible group-focus-within:visible max-sm:visible"
                title="Оставить только эту консоль и применить"
                disabled={saving}
                onclick={() => apply([c.id])}
              >только эта</button>
            </li>
          {:else}
            <li class="px-1.5 py-2 text-xs text-ink-3">Ничего не найдено</li>
          {/each}
        </ul>
        {#if draft.size === 0}
          <p class="mt-2 text-xs text-ink-3">Ни одной консоли: отчёты будут пустыми.</p>
        {/if}
        {#if failed}<p class="mt-2 text-xs text-bad">{failed}</p>{/if}
        <div class="mt-2 flex items-center justify-end gap-1 border-t border-line pt-2">
          <a href="/" class="btn btn-ghost btn-sm mr-auto">Все консоли</a>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => (open = false)}>Отмена</button>
          <button type="button" class="btn btn-pri btn-sm" disabled={!dirty || saving} onclick={() => apply([...draft])}>
            {saving ? 'Применяю…' : 'Применить'}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}
