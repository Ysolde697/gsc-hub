<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import IntentBadge from '$lib/components/IntentBadge.svelte';
  import GroupBar from '$lib/components/GroupBar.svelte';
  import GroupCell from '$lib/components/GroupCell.svelte';
  import { loadGroupItems } from '$lib/group-items.svelte';
  import { alpha3ToAlpha2 } from '$lib/utils/country';

  type Row = {
    query: string; page: string; country: string; siteUrl: string; host: string; accountId: string;
    position: number; impressions: number; clicks: number; ctr: number;
    intent: 'conv' | 'brand' | null; sitesForQuery: number; links: number; linkGroups: string[];
  };

  const sp = page.url.searchParams;
  // Поиск
  let q = $state(sp.get('q') ?? '');
  let all = $state(sp.get('all') === '1');
  let mode = $state(sp.get('mode') === 'equals' ? 'equals' : 'contains');
  let days = $state(Number(sp.get('days')) || 28);
  // Фильтры
  let country = $state(sp.get('country') ?? '');
  let byCountry = $state(sp.get('byCountry') === '1');
  let posMin = $state(sp.get('posMin') ?? '');
  let posMax = $state(sp.get('posMax') ?? '');
  let minImpr = $state(sp.get('minImpr') ?? '');
  let intent = $state(sp.get('intent') ?? 'any');
  let site = $state(sp.get('site') ?? '');
  let multi = $state(sp.get('multi') === '1');
  let nolinks = $state(sp.get('nolinks') === '1');

  let rows = $state<Row[]>([]);
  let info = $state<{
    total: number; limit: number; sites: number; errors: number; noAccess: number;
    errorList: { site: string; reason: string }[]; countries: { code: string; impressions: number }[]; sitesList: string[];
  } | null>(null);
  let loading = $state(false);
  let err = $state<string | null>(null);
  let sort = $state<'impressions' | 'position' | 'clicks' | 'host' | 'sites'>('impressions');

  onMount(() => {
    loadGroupItems();
    if (sp.get('q') || sp.get('all') === '1') run();
  });

  const regionNames = (() => {
    try {
      return new Intl.DisplayNames(['ru'], { type: 'region' });
    } catch {
      return null;
    }
  })();
  function countryName(code: string): string {
    if (!code) return '—';
    const a2 = alpha3ToAlpha2(code);
    try {
      return (a2 && regionNames?.of(a2.toUpperCase())) || code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  }

  function params(): URLSearchParams {
    const u = new URLSearchParams();
    if (all) u.set('all', '1');
    if (q.trim()) u.set('q', q.trim());
    u.set('mode', mode);
    u.set('days', String(days));
    if (country) u.set('country', country);
    if (byCountry) u.set('byCountry', '1');
    if (posMin !== '') u.set('posMin', posMin);
    if (posMax !== '') u.set('posMax', posMax);
    if (minImpr !== '') u.set('minImpr', minImpr);
    if (intent !== 'any') u.set('intent', intent);
    if (site) u.set('site', site);
    if (multi) u.set('multi', '1');
    if (nolinks) u.set('nolinks', '1');
    return u;
  }

  async function run() {
    if (!all && q.trim().length < 2) {
      err = 'Введите хотя бы 2 символа или нажмите «Все ключи»';
      return;
    }
    const u = params();
    goto(`?${u}`, { replaceState: true, keepFocus: true, noScroll: true });
    loading = true;
    err = null;
    try {
      const res = await fetch(`/search/api?${u}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
      rows = data.rows;
      info = {
        total: data.total, limit: data.limit, sites: data.sites, errors: data.errors, noAccess: data.noAccess ?? 0,
        errorList: data.errorList ?? [], countries: data.countries ?? [], sitesList: data.sitesList ?? []
      };
    } catch (e) {
      err = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function searchKey() {
    all = false;
    run();
  }
  function allKeys() {
    all = true;
    q = '';
    run();
  }
  function preset(min: string, max: string) {
    posMin = min;
    posMax = max;
    run();
  }
  function resetFilters() {
    country = ''; byCountry = false; posMin = ''; posMax = ''; minImpr = ''; intent = 'any'; site = ''; multi = false; nolinks = false;
    run();
  }

  const sorted = $derived.by(() => {
    const r = [...rows];
    if (sort === 'position') r.sort((a, b) => a.position - b.position);
    else if (sort === 'impressions') r.sort((a, b) => b.impressions - a.impressions);
    else if (sort === 'clicks') r.sort((a, b) => b.clicks - a.clicks);
    else if (sort === 'sites') r.sort((a, b) => b.sitesForQuery - a.sitesForQuery || b.impressions - a.impressions);
    else r.sort((a, b) => a.host.localeCompare(b.host) || a.position - b.position);
    return r;
  });
  const siteCount = $derived(new Set(rows.map((r) => r.host)).size);
  const showCountry = $derived(byCountry || !!country);
  const fmt = (n: number) => n.toLocaleString('ru-RU');
  const siteHref = (r: Row) => `/properties/${encodeURIComponent(r.siteUrl)}?acc=${encodeURIComponent(r.accountId)}&tab=keywords`;

  function downloadCsv() {
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const head = ['Ключ', 'Тип', 'Сайт', 'Страница', 'Страна', 'Позиция', 'Показы', 'Клики', 'CTR %', 'Сайтов по ключу', 'Ссылок в группах'];
    const lines = sorted.map((r) =>
      [r.query, r.intent === 'conv' ? 'конверсия' : r.intent === 'brand' ? 'бренд/комм.' : '', r.host, r.page,
        r.country ? countryName(r.country) : '', r.position.toFixed(1).replace('.', ','), r.impressions, r.clicks,
        (r.ctr * 100).toFixed(1).replace('.', ','), r.sitesForQuery, r.links || ''].map(cell).join(';')
    );
    const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `keys-${all ? 'all' : q.trim().replace(/[^\p{L}\p{N}]+/gu, '_')}-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<svelte:head><title>Поиск ключа — gsc-hub</title></svelte:head>

<main class="page">
  <header class="app-toolbar">
    <div class="app-toolbar-left">
      <nav class="app-breadcrumbs"><span>gsc-hub</span><span aria-hidden="true">/</span><span class="text-ink-2">Поиск ключа</span></nav>
      <h1 class="app-pagetitle">Поиск ключа по всем сайтам</h1>
    </div>
  </header>

  <form class="mb-2 flex flex-wrap items-center gap-2" onsubmit={(e) => { e.preventDefault(); searchKey(); }}>
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
    <button class="btn btn-pri h-9" disabled={loading}>{loading && !all ? 'Ищу…' : 'Найти'}</button>
    <span class="text-xs text-ink-3">или</span>
    <button type="button" class="btn btn-sec h-9" disabled={loading} onclick={allKeys}>{loading && all ? 'Собираю все ключи…' : 'Все ключи'}</button>
  </form>
  <p class="mb-3 text-xs text-ink-3">
    Все сайты всех консолей, без фильтров шапки. Первый поиск — 10–30 секунд («Все ключи» — до минуты), повтор и смена фильтров — мгновенно.
  </p>

  {#if info}
    <form class="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded border border-line bg-sunk p-2 text-xs" onsubmit={(e) => { e.preventDefault(); run(); }}>
      <label class="flex flex-col gap-0.5">Страна
        <select class="input h-7 text-xs" bind:value={country} onchange={run}>
          <option value="">все страны</option>
          {#each info.countries.slice(0, 80) as c (c.code)}<option value={c.code}>{countryName(c.code)} · {fmt(c.impressions)}</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-1 pb-1"><input type="checkbox" bind:checked={byCountry} onchange={run} /> по странам</label>
      <div class="flex flex-col gap-0.5">Позиция
        <span class="flex items-center gap-1">
          <input class="input h-7 w-14 text-xs" type="number" min="1" step="0.1" placeholder="от" bind:value={posMin} />
          <input class="input h-7 w-14 text-xs" type="number" min="1" step="0.1" placeholder="до" bind:value={posMax} />
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => preset('1', '3')}>1–3</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => preset('4', '20')} title="Striking distance">4–20</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => preset('11', '30')}>11–30</button>
        </span>
      </div>
      <label class="flex flex-col gap-0.5">Показов от
        <input class="input h-7 w-20 text-xs" type="number" min="0" bind:value={minImpr} />
      </label>
      <label class="flex flex-col gap-0.5">Тип
        <select class="input h-7 text-xs" bind:value={intent} onchange={run}>
          <option value="any">любой</option>
          <option value="conv">🟢 конверсия</option>
          <option value="brand">🟡 бренд / комм.</option>
        </select>
      </label>
      <label class="flex flex-col gap-0.5">Сайт
        <select class="input h-7 max-w-[12rem] text-xs" bind:value={site} onchange={run}>
          <option value="">все сайты</option>
          {#each info.sitesList as h (h)}<option value={h}>{h}</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-1 pb-1" title="Ключ есть сразу на нескольких ваших сайтах — они конкурируют"><input type="checkbox" bind:checked={multi} onchange={run} /> на 2+ моих сайтах</label>
      <label class="flex items-center gap-1 pb-1"><input type="checkbox" bind:checked={nolinks} onchange={run} /> без ссылок</label>
      <button class="btn btn-pri btn-sm">Применить</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick={resetFilters}>Сбросить</button>
    </form>
    <div class="mb-3"><GroupBar /></div>
  {/if}

  {#if err}<p class="mb-3 text-sm text-bad">{err}</p>{/if}

  {#if info}
    <section class="pane">
      <div class="pane-head flex flex-wrap items-center gap-3">
        <span>{all && !q.trim() ? 'Все ключи' : 'Найдено'}: {fmt(info.total)} строк на {siteCount} сайтах{info.total > info.limit ? ` · показаны ${fmt(info.limit)} с бо́льшими показами` : ''}</span>
        {#if info.noAccess}<span class="text-xs font-normal normal-case text-ink-3" title="Сайт есть в консоли, но доступ не подтверждён — Google не отдаёт по нему данных">{info.noAccess} сайтов без доступа</span>{/if}
        {#if info.errors}<span class="text-xs font-normal normal-case text-warn" title={info.errorList.map((e) => `${e.site}: ${e.reason}`).join('\n')}>{info.errors} сайтов не ответили</span>{/if}
        <span class="ml-auto flex flex-wrap items-center gap-1 text-xs font-normal normal-case">
          Сортировка:
          {#each [['impressions', 'показы'], ['position', 'позиция'], ['clicks', 'клики'], ['sites', 'сайтов'], ['host', 'сайт']] as [k, label] (k)}
            <button type="button" class="btn btn-sm {sort === k ? 'bg-acc-t text-acc' : 'btn-ghost'}" onclick={() => (sort = k as typeof sort)}>{label}</button>
          {/each}
          <button type="button" class="btn btn-sec btn-sm ml-2" onclick={downloadCsv} disabled={!rows.length}>Скачать CSV</button>
        </span>
      </div>
      {#if rows.length === 0}
        <p class="p-3 text-sm text-ink-3">Ничего не найдено с такими фильтрами.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="app-table">
            <thead>
              <tr>
                <th>Ключ</th><th>Тип</th><th>Сайт</th><th>Страница</th>{#if showCountry}<th>Страна</th>{/if}
                <th class="num">Поз.</th><th class="num">Показы</th><th class="num">Клики</th><th class="num">CTR</th>
                <th class="num" title="На скольких ваших сайтах есть этот ключ">Сайтов</th><th>Ссылки в группах</th><th class="num">В группу</th><th></th>
              </tr>
            </thead>
            <tbody>
              {#each sorted as r (r.host + '\n' + r.query + '\n' + r.page + '\n' + r.country)}
                <tr>
                  <td class="pii font-medium">{r.query}</td>
                  <td><IntentBadge query={r.query} page={r.page} /></td>
                  <td class="pii whitespace-nowrap">{r.host}</td>
                  <td class="max-w-md"><a class="pii break-all text-ink-3 hover:text-acc hover:underline" href={r.page} target="_blank" rel="noopener noreferrer">{r.page}</a></td>
                  {#if showCountry}<td class="whitespace-nowrap text-xs">{countryName(r.country)}</td>{/if}
                  <td class="num app-num font-semibold">{r.position.toFixed(1)}</td>
                  <td class="num app-num">{fmt(r.impressions)}</td>
                  <td class="num app-num">{fmt(r.clicks)}</td>
                  <td class="num app-num">{(r.ctr * 100).toFixed(1)}%</td>
                  <td class="num app-num {r.sitesForQuery > 1 ? 'font-semibold text-warn' : 'text-ink-3'}">{r.sitesForQuery}</td>
                  <td class="text-xs">{#if r.links}<b>{r.links} шт</b> <span class="text-ink-3">({r.linkGroups.join(', ')})</span>{:else}<span class="text-ink-4">—</span>{/if}</td>
                  <td class="num"><GroupCell row={{ siteUrl: r.siteUrl, query: r.query, page: r.page, position: r.position, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr }} /></td>
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
