<script lang="ts">
  // Страница «Ключи сайтов»: все ключи одного сайта за выбранный период со
  // всеми колонками Striking. «В группу» — в группу, выбранную над списком.
  import { onMount } from 'svelte';
  import IntentBadge from './IntentBadge.svelte';
  import SortTh from './SortTh.svelte';
  import GroupCell from './GroupCell.svelte';
  import LastPlanCell from './LastPlanCell.svelte';
  import OtherSitesInline from './OtherSitesInline.svelte';
  import VolumeCell from './VolumeCell.svelte';
  import { TableSort } from '$lib/table-sort.svelte';
  import { classifyIntent } from '$lib/utils/intent';
  import { Volumes } from '$lib/volumes.svelte';
  import { otherGroups, gi, activeGroup, itemKey, type OtherOwner, type OtherLink } from '$lib/group-items.svelte';

  type Row = { query: string; page: string; position: number; impressions: number; clicks: number; ctr: number };
  let { siteUrl, accountId, period }: { siteUrl: string; accountId: string; period: string } = $props();

  let rows = $state<Row[]>([]);
  let loading = $state(true);
  let err = $state<string | null>(null);
  let other = $state<Record<string, { owners: OtherOwner[]; links: OtherLink[] }>>({});
  let otherLoading = $state(false);
  let search = $state('');
  let kind = $state<'all' | 'conv' | 'brand' | 'any'>('all');
  let limit = $state(300);
  const vols = new Volumes();
  // Отмеченные ключи — для проверки частотности в DataForSEO.
  let picked = $state<Set<string>>(new Set());
  const pickToggle = (q: string) => { const n = new Set(picked); if (n.has(q)) n.delete(q); else n.add(q); picked = n; };

  async function load() {
    loading = true;
    err = null;
    try {
      const r = await fetch(`/keywords/rows?site=${encodeURIComponent(siteUrl)}&acc=${encodeURIComponent(accountId)}&p=${period}`);
      if (!r.ok) throw new Error((await r.text()).slice(0, 200) || `HTTP ${r.status}`);
      rows = (await r.json()).rows ?? [];
    } catch (e) {
      err = (e as Error).message;
      return;
    } finally {
      loading = false;
    }
    const queries = [...new Set(rows.map((r) => r.query))].sort();
    vols.load(siteUrl, queries);
    otherLoading = true;
    fetch('/groups/competition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site: siteUrl, queries }) })
      .then((r) => (r.ok ? r.json() : { byQuery: {} }))
      .then((j) => (other = j.byQuery ?? {}))
      .catch(() => {})
      .finally(() => (otherLoading = false));
  }
  onMount(load);

  const intentOf = (r: Row) => classifyIntent(r.query, r.page);
  type K = 'query' | 'intent' | 'page' | 'position' | 'impressions' | 'volume' | 'clicks' | 'ctr' | 'others' | 'last' | 'group';
  const sort = new TableSort<K>('impressions', -1, ['impressions', 'volume', 'clicks', 'ctr', 'others', 'last', 'group']);
  const filtered = $derived.by(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (s && !r.query.toLowerCase().includes(s) && !r.page.toLowerCase().includes(s)) return false;
      if (kind === 'all') return true;
      const t = intentOf(r);
      return kind === 'any' ? t !== null : t === kind;
    });
  });
  const shown = $derived(
    sort.apply(filtered, (r, k) => {
      if (k === 'intent') return ((t) => (t === 'conv' ? 1 : t === 'brand' ? 2 : null))(intentOf(r));
      if (k === 'volume') return vols.sortValue(r.query);
      if (k === 'others') {
        const e = other[r.query];
        if (!e) return null;
        const n = new Set([...e.owners.map((o) => o.host), ...e.links.map((l) => l.host)]).size;
        return n ? (e.owners.some((o) => o.position < r.position) ? 1000 : 0) + n : null;
      }
      if (k === 'last') {
        const l = otherGroups(r.page, r.query);
        return l.length ? l[l.length - 1].at : null;
      }
      if (k === 'group') {
        const g = activeGroup();
        return g ? (gi.marks[itemKey(r.page, r.query)]?.find((m) => m.groupId === g.id)?.qty ?? null) : null;
      }
      return r[k];
    })
  );
  const totals = $derived(filtered.reduce((a, r) => ({ impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks }), { impressions: 0, clicks: 0 }));

  const visibleQs = $derived([...new Set(filtered.map((r) => r.query))]);
  const pickedQs = $derived(visibleQs.filter((q) => picked.has(q)));
  const allPicked = $derived(visibleQs.length > 0 && pickedQs.length === visibleQs.length);
  // Отмеченные галочками, а если ничего не отмечено — все в таблице.
  function checkVolumes() {
    const qs = pickedQs.length ? pickedQs : visibleQs;
    if (!qs.length) return;
    if (!confirm(`Проверить частотность ${qs.length} ключей в DataForSEO? Это платно (несколько центов за пачку до 1000 ключей), уже проверенные ключи повторно не оплачиваются.`)) return;
    vols.check(siteUrl, qs);
  }
  const fmt = (n: number) => n.toLocaleString('ru-RU');
</script>

<div class="py-2">
  <div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
    <input class="input h-7 w-64 text-xs" placeholder="Ключ или страница содержит…" bind:value={search} aria-label="Поиск по ключам" />
    <div class="app-segmented" role="group" aria-label="Тип ключа">
      {#each [['all', 'все'], ['any', 'зелёные + жёлтые'], ['conv', 'конверсия'], ['brand', 'бренд / комм.']] as [v, label] (v)}
        <button type="button" class:is-active={kind === v} onclick={() => (kind = v as typeof kind)}>{label}</button>
      {/each}
    </div>
    {#if !loading && !err}
      <span class="text-ink-3">{fmt(filtered.length)} строк · {fmt(totals.impressions)} показов · {fmt(totals.clicks)} кликов</span>
      <span class="flex-1"></span>
      <button type="button" class="btn btn-sec btn-sm" disabled={vols.checking || !filtered.length} title="Точная частотность от Google Ads по ключам в таблице (с учётом фильтра)" onclick={checkVolumes}>{vols.checking ? 'Проверяю…' : pickedQs.length ? `Частотность отмеченных в DataForSEO (${pickedQs.length})` : `Частотность в DataForSEO — все (${visibleQs.length})`}</button>
      {#if pickedQs.length}<button type="button" class="btn btn-ghost btn-sm" onclick={() => (picked = new Set())}>Снять отметки</button>{/if}
    {/if}
  </div>
  {#if vols.error}<p class="mb-1 text-xs text-bad">{vols.error}{#if !vols.configured} — <a class="text-acc underline" href="/settings/integrations">раздел «Сервисы»</a>{/if}</p>{/if}
  {#if vols.note}<p class="mb-1 text-xs text-emerald-700">{vols.note}</p>{/if}

  {#if loading}
    <p class="loading text-xs">Загружаю ключи…</p>
  {:else if err}
    <p class="text-xs text-bad">Не загрузилось: {err} <button type="button" class="btn btn-ghost btn-sm" onclick={load}>Повторить</button></p>
  {:else if shown.length === 0}
    <p class="text-xs text-ink-3">Нет ключей за этот период{search || kind !== 'all' ? ' с этим фильтром' : ''}.</p>
  {:else}
    <div class="max-h-[40rem] overflow-auto rounded border border-line bg-pane">
      <table class="app-table">
        <thead class="sticky top-0 z-10 bg-pane">
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
            <SortTh {sort} k="others" label="Мои другие сайты" title="Другие ваши сайты той же страны по этому ключу и ссылки на них. Красным — стоит выше" />
            <SortTh {sort} k="last" label="Последняя закупка" />
            <SortTh {sort} k="group" label="В группу" num />
          </tr>
        </thead>
        <tbody>
          {#each shown.slice(0, limit) as r (r.page + '\n' + r.query)}
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
              <td class="min-w-[10rem]"><OtherSitesInline owners={other[r.query]?.owners ?? []} links={other[r.query]?.links ?? []} position={r.position} loading={otherLoading} query={r.query} /></td>
              <td><LastPlanCell page={r.page} query={r.query} /></td>
              <td class="num"><GroupCell row={{ siteUrl, query: r.query, page: r.page, position: r.position, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr }} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if shown.length > limit}
      <button type="button" class="btn btn-ghost btn-sm mt-1" onclick={() => (limit += 500)}>Показать ещё ({fmt(shown.length - limit)})</button>
    {/if}
  {/if}
</div>
