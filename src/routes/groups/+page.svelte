<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const selectedId = $derived.by(() => {
    const raw = Number(page.url.searchParams.get('g'));
    if (data.groups.some((g) => g.id === raw)) return raw;
    return data.groups[0]?.id ?? null;
  });
  const group = $derived(data.groups.find((g) => g.id === selectedId) ?? null);

  // Галочки редактора. Сбрасываются при смене группы и после сохранения.
  let picked = $state<Set<string>>(new Set());
  let paste = $state('');
  let query = $state('');
  let onlyPicked = $state(false);
  let lastKey = '';
  $effect(() => {
    const key = `${group?.id}:${group?.hosts.join(',')}`;
    if (key !== lastKey) {
      lastKey = key;
      picked = new Set(group?.hosts ?? []);
      paste = '';
    }
  });

  // Сайты консолей плюс домены группы, которых в консолях нет: их тоже видно,
  // чтобы можно было снять галочку.
  const rows = $derived.by(() => {
    const known = new Map(data.knownSites.map((s) => [s.host, s.accounts]));
    for (const h of group?.hosts ?? []) if (!known.has(h)) known.set(h, []);
    return [...known.entries()]
      .map(([host, accounts]) => ({ host, accounts }))
      .sort((a, b) => a.host.localeCompare(b.host));
  });
  const shown = $derived(
    rows.filter(
      (r) =>
        (!onlyPicked || picked.has(r.host)) &&
        (!query.trim() || r.host.includes(query.trim().toLowerCase()) || r.accounts.some((a) => a.toLowerCase().includes(query.trim().toLowerCase())))
    )
  );
  const dirty = $derived(
    !!paste.trim() ||
      picked.size !== (group?.hosts.length ?? 0) ||
      (group?.hosts ?? []).some((h) => !picked.has(h))
  );

  function toggle(host: string) {
    const next = new Set(picked);
    if (next.has(host)) next.delete(host);
    else next.add(host);
    picked = next;
  }
  function pickShown(on: boolean) {
    const next = new Set(picked);
    for (const r of shown) {
      if (on) next.add(r.host);
      else next.delete(r.host);
    }
    picked = next;
  }
</script>

<svelte:head><title>Группы сайтов — gsc-hub</title></svelte:head>

<main class="page">
  <header class="app-toolbar">
    <div class="app-toolbar-left">
      <nav class="app-breadcrumbs">
        <span>gsc-hub</span>
        <span aria-hidden="true">/</span>
        <span class="text-ink-2">Группы</span>
      </nav>
      <h1 class="app-pagetitle">Группы сайтов</h1>
    </div>
  </header>

  <p class="mb-3 max-w-3xl text-sm text-ink-3">
    Группа — это список доменов, например «Приоритет». Выберите её в шапке («Сайты: …»), и все общие
    отчёты и Claude через MCP будут видеть только эти сайты. Фильтр работает вместе с выбором консолей.
  </p>

  {#if form && 'error' in form && form.error}
    <p class="mb-3 rounded border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{form.error}</p>
  {/if}
  {#if data.siteErrors.length}
    <p class="mb-3 text-xs text-ink-3">
      Не удалось получить сайты из консолей: {data.siteErrors.map((e) => e.account).join(', ')}. Их сайты можно добавить списком.
    </p>
  {/if}

  <div class="grid gap-3 lg:grid-cols-[16rem_1fr]">
    <section class="pane self-start">
      <div class="pane-head">Группы <span class="aside app-num">{data.groups.length}</span></div>
      <ul class="p-1">
        {#each data.groups as g (g.id)}
          <li>
            <a
              href="?g={g.id}"
              class="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-sunk {g.id === selectedId ? 'bg-sunk font-semibold text-ink' : 'text-ink-2'}"
            >
              <span class="min-w-0 flex-1 truncate">{g.name}</span>
              {#if g.active}<span class="badge badge-ok" title="Выбрана фильтром в шапке">фильтр</span>{/if}
              <span class="app-num text-xs text-ink-3">{g.hosts.length}</span>
            </a>
          </li>
        {:else}
          <li class="px-2 py-1.5 text-xs text-ink-3">Пока ни одной.</li>
        {/each}
      </ul>
      <form
        method="POST"
        action="?/create"
        class="flex gap-1 border-t border-line p-2"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success' && result.data?.created) goto(`?g=${result.data.created}`, { invalidateAll: true });
        }}
      >
        <input name="name" class="input h-7 min-w-0 flex-1 text-xs" placeholder="Новая группа" maxlength="60" required />
        <button class="btn btn-pri btn-sm">Создать</button>
      </form>
    </section>

    {#if group}
      <section class="pane">
        <div class="pane-head flex flex-wrap items-center gap-2">
          <form method="POST" action="?/rename" use:enhance class="flex items-center gap-1">
            <input type="hidden" name="id" value={group.id} />
            <input name="name" value={group.name} class="input h-7 w-48 text-xs normal-case" maxlength="60" required />
            <button class="btn btn-sec btn-sm">Переименовать</button>
          </form>
          <form
            method="POST"
            action="?/delete"
            class="ml-auto"
            use:enhance={({ cancel }) => {
              if (!confirm(`Удалить группу «${group.name}»? Сайты и консоли не пострадают.`)) cancel();
              return async ({ update }) => {
                await update();
                goto('/groups', { invalidateAll: true });
              };
            }}
          >
            <input type="hidden" name="id" value={group.id} />
            <button class="btn btn-danger btn-sm">Удалить группу</button>
          </form>
        </div>

        <form method="POST" action="?/hosts" use:enhance={() => async ({ update }) => { await update({ reset: false }); lastKey = ''; }} class="p-3">
          <input type="hidden" name="id" value={group.id} />
          {#each [...picked] as h (h)}<input type="hidden" name="host" value={h} />{/each}

          <label class="mb-1 block text-xs font-medium text-ink-2" for="paste">Добавить списком (домены или адреса, по одному на строку)</label>
          <textarea
            id="paste"
            name="paste"
            bind:value={paste}
            rows="3"
            class="input mb-3 w-full py-1.5 font-mono text-xs"
            placeholder={'example.com\nhttps://www.other-site.ru/\nsc-domain:third.com'}
          ></textarea>

          <div class="mb-2 flex flex-wrap items-center gap-2">
            <input class="input h-7 w-56 text-xs" placeholder="Поиск по домену или консоли" bind:value={query} />
            <label class="flex items-center gap-1 text-xs text-ink-2"><input type="checkbox" bind:checked={onlyPicked} /> только отмеченные</label>
            <button type="button" class="btn btn-ghost btn-sm" onclick={() => pickShown(true)}>Отметить показанные</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick={() => pickShown(false)}>Снять показанные</button>
            <span class="ml-auto text-xs text-ink-3">в группе {picked.size}</span>
          </div>

          <div class="max-h-[28rem] overflow-y-auto rounded border border-line">
            <table class="app-table">
              <tbody>
                {#each shown as r (r.host)}
                  <tr class="cursor-pointer" onclick={() => toggle(r.host)}>
                    <td class="w-px"><input type="checkbox" checked={picked.has(r.host)} aria-label={r.host} onclick={(e) => e.stopPropagation()} onchange={() => toggle(r.host)} /></td>
                    <td class="pii break-all text-ink">{r.host}</td>
                    <td class="pii text-xs text-ink-3">{r.accounts.length ? r.accounts.join(', ') : 'нет ни в одной консоли'}</td>
                  </tr>
                {:else}
                  <tr><td class="text-xs text-ink-3">Ничего не найдено</td></tr>
                {/each}
              </tbody>
            </table>
          </div>

          {#if form && 'saved' in form && form.saved === group.id}
            <p class="mt-2 text-xs text-ink-3">
              Сохранено.{#if form.rejected?.length}&nbsp;Не похожи на домены и пропущены: {form.rejected.join(', ')}{/if}
            </p>
          {/if}
          <div class="mt-3 flex justify-end">
            <button class="btn btn-pri" disabled={!dirty}>Сохранить состав</button>
          </div>
        </form>
      </section>
    {:else}
      <div class="app-empty">
        <div class="app-empty-title">Создайте первую группу</div>
        <p class="app-empty-sub">Например «Приоритет» — сайты, которые сейчас продвигаете.</p>
      </div>
    {/if}
  </div>
</main>
