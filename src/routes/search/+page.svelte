<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import IntentBadge from '$lib/components/IntentBadge.svelte';

  type Row = {
    query: string; page: string; siteUrl: string; host: string; accountId: string; accountEmail: string;
    position: number; impressions: number; clicks: number; ctr: number; links: number; linkGroups: string[];
  };

  let q = $state(page.url.searchParams.get('q') ?? '');
  let mode = $state(page.url.searchParams.get('mode') === 'equals' ? 'equals' : 'contains');
  let days = $state(Number(page.url.searchParams.get('days')) || 28);
  let rows = $state<Row[]>([]);
  let info = $state<{ total: number; sites: number; errors: number; noAccess: number; errorList: { site: string; reason: string }[] } | null>(null);
  let loading = $state(false);
  let err = $state<string | null>(null);
  let sort = $state<'position' | 'impressions' | 'clicks' | 'host'>('position');

  async function run() {
    const text = q.trim();
    if (text.length < 2) {
      err = 'Введите хотя бы 2 символа';
      return;
    }
    goto(`?q=${encodeURIComponent(text)}&mode=${mode}&days=${days}`, { replaceState: true, keepFocus: true, noScroll: true });
    loading = true;
    err = null;
    try {
      const res = await fetch(`/search/api?q=${encodeURIComponent(text)}&mode=${mode}&days=${days}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
      rows = data.rows;
      info = { total: data.total, sites: data.sites, errors: data.errors, noAccess: data.noAccess ?? 0, errorList: data.errorList ?? [] };
    } catch (e) {
      err = (e as Error).message;
      rows = [];
      info = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (page.url.searchParams.get('q') && !info && !loading) run();
  });

  const sorted = $derived.by(() => {
    const r = [...rows];
    if (sort === 'position') r.sort((a, b) => a.position - b.position);
    else if (sort === 'impressions') r.sort((a, b) => b.impressions - a.impressions);
    else if (sort === 'clicks') r.sort((a, b) => b.clicks - a.clicks);
    else r.sort((a, b) => a.host.localeCompare(b.host) || a.position - b.position);
    return r;
  });
  const siteCount = $derived(new Set(rows.map((r) => r.host)).size);
  const fmt = (n: number) => n.toLocaleString('ru-RU');
  const siteHref = (r: Row) => `/properties/${encodeURIComponent(r.siteUrl)}?acc=${encodeURIComponent(r.accountId)}&tab=keywords`;
</script>

<svelte:head><title>Поиск ключа — gsc-hub</title></svelte:head>

<main class="page">
  <header class="app-toolbar">
    <div class="app-toolbar-left">
      <nav class="app-breadcrumbs"><span>gsc-hub</span><span aria-hidden="true">/</span><span class="text-ink-2">Поиск ключа</span></nav>
      <h1 class="app-pagetitle">Поиск ключа по всем сайтам</h1>
    </div>
  </header>

  <form class="mb-3 flex flex-wrap items-center gap-2" onsubmit={(e) => { e.preventDefault(); run(); }}>
    <input class="input h-9 w-full max-w-md text-sm" placeholder="Ключ или его часть, например: cricket road" bind:value={q} maxlength="200" aria-label="Ключ" />
    <select class="input h-9 text-sm" bind:value={mode} aria-label="Как искать">
      <option value="contains">содержит</option>
      <option value="equals">точно</option>
    </select>
    <select class="input h-9 text-sm" bind:value={days} aria-label="Период">
      <option value={7}>7 дней</option>
      <option value={28}>28 дней</option>
      <option value={90}>90 дней</option>
      <option value={180}>180 дней</option>
    </select>
    <button class="btn btn-pri h-9" disabled={loading}>{loading ? 'Ищу по всем сайтам…' : 'Найти'}</button>
  </form>

  <p class="mb-3 text-xs text-ink-3">
    Ищет по всем сайтам всех консолей (без фильтров шапки). Первый поиск по новому ключу — 10–30 секунд, повтор — мгновенно.
  </p>

  {#if err}<p class="mb-3 text-sm text-bad">{err}</p>{/if}

  {#if info}
    <section class="pane">
      <div class="pane-head flex flex-wrap items-center gap-3">
        <span>Найдено: {fmt(info.total)} строк на {siteCount} сайтах</span>
        {#if info.noAccess}<span class="text-xs font-normal normal-case text-ink-3" title="Сайт есть в консоли, но доступ не подтверждён (неподтверждённый пользователь) — Google не отдаёт по нему данных">{info.noAccess} сайтов без доступа в Search Console</span>{/if}
        {#if info.errors}<span class="text-xs font-normal normal-case text-warn" title={info.errorList.map((e) => `${e.site}: ${e.reason}`).join('\n')}>{info.errors} сайтов не ответили (наведите — причина)</span>{/if}
        <span class="ml-auto flex items-center gap-1 text-xs font-normal normal-case">
          Сортировка:
          {#each [['position', 'позиция'], ['impressions', 'показы'], ['clicks', 'клики'], ['host', 'сайт']] as [k, label] (k)}
            <button type="button" class="btn btn-sm {sort === k ? 'bg-acc-t text-acc' : 'btn-ghost'}" onclick={() => (sort = k as typeof sort)}>{label}</button>
          {/each}
        </span>
      </div>
      {#if rows.length === 0}
        <p class="p-3 text-sm text-ink-3">Ни один ваш сайт не получал показов по этому ключу за период.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="app-table">
            <thead><tr><th>Ключ</th><th>Тип</th><th>Сайт</th><th>Страница</th><th class="num">Поз.</th><th class="num">Показы</th><th class="num">Клики</th><th class="num">CTR</th><th>Ссылки в группах</th><th></th></tr></thead>
            <tbody>
              {#each sorted as r (r.host + r.query + r.page)}
                <tr>
                  <td class="pii font-medium">{r.query}</td>
                  <td><IntentBadge query={r.query} page={r.page} /></td>
                  <td class="pii whitespace-nowrap">{r.host}</td>
                  <td class="max-w-md"><a class="pii break-all text-ink-3 hover:text-acc hover:underline" href={r.page} target="_blank" rel="noopener noreferrer">{r.page}</a></td>
                  <td class="num app-num font-semibold">{r.position.toFixed(1)}</td>
                  <td class="num app-num">{fmt(r.impressions)}</td>
                  <td class="num app-num">{fmt(r.clicks)}</td>
                  <td class="num app-num">{(r.ctr * 100).toFixed(1)}%</td>
                  <td class="text-xs">{#if r.links}<b>{r.links} шт</b> <span class="text-ink-3">({r.linkGroups.join(', ')})</span>{:else}<span class="text-ink-4">—</span>{/if}</td>
                  <td class="text-right"><a class="btn btn-ghost btn-sm" href={siteHref(r)}>Открыть</a></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</main>
