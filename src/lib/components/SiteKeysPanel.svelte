<script lang="ts">
  // Все ключи сайта со статистикой — внутри раскрывашки на странице группы,
  // чтобы видеть, что ещё можно взять, не уходя в Striking. Поле «шт» + «+»
  // добавляют ключ в ЭТУ группу (а не в выбранную в шапке).
  import { onMount } from 'svelte';
  import IntentBadge from './IntentBadge.svelte';
  import SortTh from './SortTh.svelte';
  import { TableSort } from '$lib/table-sort.svelte';
  import { classifyIntent } from '$lib/utils/intent';
  import { Volumes } from '$lib/volumes.svelte';
  import VolumeCell from './VolumeCell.svelte';

  type Row = { query: string; page: string; position: number; impressions: number; clicks: number; ctr: number; siteUrl: string };
  type Source = { siteUrl: string; accountId: string };
  type Mark = { groupId: number; name: string; qty: number; at: number };
  let {
    sources,
    groupId,
    fixed = false,
    days = 28,
    onadd
  }: {
    /** Все property этого домена во всех консолях — ключи собираются из каждой. */
    sources: Source[];
    groupId: number;
    fixed?: boolean;
    days?: number;
    onadd: (row: Row & { qty: number }) => Promise<unknown> | unknown;
  } = $props();

  // Период по умолчанию — как в Striking этого сайта; можно переключить тут же.
  // svelte-ignore state_referenced_locally
  let period = $state(days);
  const PERIODS: [number, string][] = [[7, '7 дн'], [28, '28 дн'], [90, '3 мес'], [180, '6 мес'], [480, '16 мес']];
  let rows = $state<Row[]>([]);
  let marks = $state<Record<string, Mark[]>>({});
  let loading = $state(true);
  let err = $state<string | null>(null);
  let failed = $state(0);
  let onlyNew = $state(true);
  let drafts = $state<Record<string, number>>({});
  let busy = $state<Set<string>>(new Set());

  const key = (r: { page: string; query: string }) => `${r.page}\n${r.query}`;
  const vols = new Volumes();
  // Отмеченные ключи — для проверки частотности в DataForSEO.
  let picked = $state<Set<string>>(new Set());
  const pickToggle = (q: string) => { const n = new Set(picked); if (n.has(q)) n.delete(q); else n.add(q); picked = n; };
  const site = $derived(sources[0]?.siteUrl ?? '');

  async function load() {
    loading = true;
    err = null;
    failed = 0;
    try {
      // Одна и та же статистика может лежать в разных консолях и property
      // (sc-domain: и https://). Берём из всех, что ответили; одинаковые
      // ключ+страница сливаем, оставляя строку с бо́льшими показами.
      const results = await Promise.all(
        sources.map(async (src) => {
          const r = await fetch(`/properties/${encodeURIComponent(src.siteUrl)}/analytics?acc=${encodeURIComponent(src.accountId)}&days=${period}&posMax=0&minImpr=1`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return ((await r.json()).striking ?? []).map((x: Omit<Row, 'siteUrl'>) => ({ ...x, siteUrl: src.siteUrl }));
        }).map((p) => p.then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, e })))
      );
      const merged = new Map<string, Row>();
      for (const res of results) {
        if (!res.ok) continue;
        for (const r of res.v as Row[]) {
          const prev = merged.get(key(r));
          if (!prev || r.impressions > prev.impressions) merged.set(key(r), r);
        }
      }
      failed = results.filter((x) => !x.ok).length;
      if (failed === results.length && results.length) throw (results[0] as { e: Error }).e;
      rows = [...merged.values()];
      vols.load(site, [...new Set(rows.map((r) => r.query))].sort());
      const sites = [...new Set(sources.map((x) => x.siteUrl))];
      const ms = await Promise.all(
        sites.map((u) => fetch(`/groups/items?site=${encodeURIComponent(u)}`).then((m) => (m.ok ? m.json() : { marks: {} })).catch(() => ({ marks: {} })))
      );
      const all: Record<string, Mark[]> = {};
      for (const m of ms) for (const [k, v] of Object.entries((m.marks ?? {}) as Record<string, Mark[]>)) (all[k] ??= []).push(...v);
      for (const v of Object.values(all)) v.sort((a, b) => a.at - b.at);
      marks = all;
    } catch (e) {
      err = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  onMount(load);

  const inThis = (r: Row) => marks[key(r)]?.find((x) => x.groupId === groupId) ?? null;
  const lastOther = (r: Row) => {
    const l = (marks[key(r)] ?? []).filter((x) => x.groupId !== groupId);
    return l.length ? l[l.length - 1] : null;
  };
  const ago = (at: number) => {
    const d = Math.floor((Date.now() - at) / 864e5);
    return d <= 0 ? 'сегодня' : `${d} дн. назад`;
  };

  type K = 'query' | 'intent' | 'page' | 'position' | 'impressions' | 'volume' | 'clicks' | 'ctr' | 'last';
  const sort = new TableSort<K>('impressions', -1, ['impressions', 'volume', 'clicks', 'ctr', 'last']);
  const shown = $derived(
    sort.apply(
      rows.filter((r) => !onlyNew || !inThis(r)),
      (r, k) =>
        k === 'intent' ? ((t) => (t === 'conv' ? 1 : t === 'brand' ? 2 : null))(classifyIntent(r.query, r.page))
        : k === 'last' ? (lastOther(r)?.at ?? null)
        : k === 'volume' ? vols.sortValue(r.query)
        : r[k]
    )
  );

  async function add(r: Row) {
    const qty = drafts[key(r)];
    if (!qty) return;
    busy = new Set(busy).add(key(r));
    try {
      await onadd({ ...r, qty });
      marks = { ...marks, [key(r)]: [...(marks[key(r)] ?? []), { groupId, name: '', qty, at: Date.now() }] };
      const d = { ...drafts };
      delete d[key(r)];
      drafts = d;
    } finally {
      const b = new Set(busy);
      b.delete(key(r));
      busy = b;
    }
  }
  const fmt = (n: number) => n.toLocaleString('ru-RU');
  const visibleQs = $derived([...new Set(shown.map((r) => r.query))]);
  const pickedQs = $derived(visibleQs.filter((q) => picked.has(q)));
  const allPicked = $derived(visibleQs.length > 0 && pickedQs.length === visibleQs.length);
  // Отмеченные галочками, а если ничего не отмечено — все в таблице.
  function checkShown() {
    const qs = pickedQs.length ? pickedQs : visibleQs;
    if (!qs.length) return;
    if (!confirm(`Проверить частотность ${qs.length} ключей в DataForSEO? Это платно (несколько центов за пачку до 1000 ключей), уже проверенные ключи повторно не оплачиваются.`)) return;
    vols.check(site, qs);
  }
</script>

<div class="mt-3">
  <div class="mb-1 flex flex-wrap items-center gap-3 text-xs">
    <span class="font-semibold text-ink-2">Все ключи сайта</span>
    <span class="inline-flex overflow-hidden rounded border border-line">
      {#each [...PERIODS, ...(PERIODS.some(([d]) => d === days) ? [] : [[days, `${days} дн`] as [number, string]])] as [d, label] (d)}
        <button type="button" class="px-2 py-0.5 {period === d ? 'bg-acc text-white' : 'bg-pane text-ink-2 hover:bg-acc-t'}" disabled={loading} onclick={() => { period = d; load(); }}>{label}</button>
      {/each}
    </span>
    {#if !loading && !err}<span class="text-ink-3">{rows.length} ключей{sources.length > 1 ? ` · из ${sources.length - failed} из ${sources.length} консолей/property` : ''}</span>{/if}
    <label class="flex items-center gap-1 text-ink-2"><input type="checkbox" bind:checked={onlyNew} /> скрыть уже добавленные в эту группу</label>
    {#if !loading && !err && shown.length}
      <button type="button" class="btn btn-sec btn-sm" disabled={vols.checking} title="Точная частотность от Google Ads по ключам в таблице" onclick={checkShown}>{vols.checking ? 'Проверяю…' : pickedQs.length ? `Частотность отмеченных в DataForSEO (${pickedQs.length})` : `Частотность в DataForSEO — все (${visibleQs.length})`}</button>
      {#if pickedQs.length}<button type="button" class="btn btn-ghost btn-sm" onclick={() => (picked = new Set())}>Снять отметки</button>{/if}
    {/if}
  </div>
  {#if vols.error}<p class="mb-1 text-xs text-bad">{vols.error}{#if !vols.configured} — <a class="text-acc underline" href="/settings/integrations">раздел «Сервисы»</a>{/if}</p>{/if}
  {#if vols.note}<p class="mb-1 text-xs text-emerald-700">{vols.note}</p>{/if}
  {#if loading}
    <p class="loading text-xs">Загружаю ключи сайта…</p>
  {:else if err}
    <p class="text-xs text-bad">Не загрузилось: {err} <button type="button" class="btn btn-ghost btn-sm" onclick={load}>Повторить</button></p>
  {:else if shown.length === 0}
    <p class="text-xs text-ink-3">Нет ключей{onlyNew ? ' кроме уже добавленных' : ''}.</p>
  {:else}
    <div class="max-h-[32rem] overflow-auto rounded border border-line bg-pane">
      <table class="app-table">
        <thead>
          <tr>
            <th class="w-8"><input type="checkbox" checked={allPicked} aria-label="Отметить все ключи" onchange={() => (picked = allPicked ? new Set() : new Set(visibleQs))} /></th>
            <SortTh {sort} k="query" label="Ключ" />
            <SortTh {sort} k="intent" label="Тип" />
            <SortTh {sort} k="page" label="Страница" />
            <SortTh {sort} k="position" label="Pos" num />
            <SortTh {sort} k="impressions" label="Impr" num />
            <SortTh {sort} k="volume" label={vols.country ? `Частотность · ${vols.country.toUpperCase()}` : 'Частотность'} num />
            <SortTh {sort} k="clicks" label="Clicks" num />
            <SortTh {sort} k="ctr" label="CTR" num />
            <SortTh {sort} k="last" label="Последняя закупка" />
            <th class="num">В группу</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as r (key(r))}
            {@const mine = inThis(r)}
            {@const last = lastOther(r)}
            <tr class:is-selected={picked.has(r.query)}>
              <td><input type="checkbox" checked={picked.has(r.query)} aria-label="Отметить ключ {r.query}" onchange={() => pickToggle(r.query)} /></td>
              <td class="pii font-medium">{r.query}</td>
              <td><IntentBadge query={r.query} page={r.page} /></td>
              <td class="min-w-[14rem] max-w-sm"><a class="pii break-all text-ink-3 hover:text-acc hover:underline" href={r.page} target="_blank" rel="noopener noreferrer">{r.page}</a></td>
              <td class="num app-num">{r.position.toFixed(1)}</td>
              <td class="num app-num">{fmt(r.impressions)}</td>
              <td class="num"><VolumeCell v={vols.byQuery[r.query]} loading={vols.loading} /></td>
              <td class="num app-num">{fmt(r.clicks)}</td>
              <td class="num app-num">{(r.ctr * 100).toFixed(1)}%</td>
              <td class="whitespace-nowrap text-[12px]">{#if last}<span class="font-medium text-ink">{last.name}</span> <span class="text-ink-3">· {last.qty} шт · {ago(last.at)}</span>{:else}<span class="text-ink-4">—</span>{/if}</td>
              <td class="num whitespace-nowrap">
                {#if mine}
                  <span class="rounded bg-acc-t px-1.5 py-0.5 text-xs text-acc">✓ в группе · {mine.qty} шт</span>
                {:else if !fixed}
                  <span class="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      placeholder="шт"
                      class="input h-7 w-14 border-dashed px-1 text-right text-xs"
                      value={drafts[key(r)] ?? ''}
                      aria-label="Сколько ссылок"
                      oninput={(e) => {
                        const v = e.currentTarget.value.trim();
                        const d = { ...drafts };
                        if (v === '') delete d[key(r)];
                        else d[key(r)] = Math.max(1, Math.min(1000, Math.round(Number(v)) || 1));
                        drafts = d;
                      }}
                    />
                    <button type="button" class="btn btn-sec btn-sm" disabled={!drafts[key(r)] || busy.has(key(r))} title={drafts[key(r)] ? `Добавить ${drafts[key(r)]} шт в эту группу` : 'Сначала впишите количество'} onclick={() => add(r)}>+</button>
                  </span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
