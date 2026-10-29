<script lang="ts">
  // Все ключи сайта со статистикой — внутри раскрывашки на странице группы,
  // чтобы видеть, что ещё можно взять, не уходя в Striking. Поле «шт» + «+»
  // добавляют ключ в ЭТУ группу (а не в выбранную в шапке).
  import { onMount } from 'svelte';
  import IntentBadge from './IntentBadge.svelte';
  import SortTh from './SortTh.svelte';
  import { TableSort } from '$lib/table-sort.svelte';
  import { classifyIntent } from '$lib/utils/intent';

  type Row = { query: string; page: string; position: number; impressions: number; clicks: number; ctr: number };
  type Mark = { groupId: number; name: string; qty: number; at: number };
  let {
    siteUrl,
    accountId,
    groupId,
    fixed = false,
    days = 28,
    onadd
  }: {
    siteUrl: string;
    accountId: string;
    groupId: number;
    fixed?: boolean;
    days?: number;
    onadd: (row: Row & { siteUrl: string; qty: number }) => Promise<unknown> | unknown;
  } = $props();

  let rows = $state<Row[]>([]);
  let marks = $state<Record<string, Mark[]>>({});
  let loading = $state(true);
  let err = $state<string | null>(null);
  let onlyNew = $state(true);
  let drafts = $state<Record<string, number>>({});
  let busy = $state<Set<string>>(new Set());

  const key = (r: { page: string; query: string }) => `${r.page}\n${r.query}`;

  async function load() {
    loading = true;
    err = null;
    try {
      const base = `/properties/${encodeURIComponent(siteUrl)}`;
      const [a, m] = await Promise.all([
        fetch(`${base}/analytics?acc=${encodeURIComponent(accountId)}&days=${days}&posMax=0&minImpr=1`),
        fetch(`/groups/items?site=${encodeURIComponent(siteUrl)}`)
      ]);
      if (!a.ok) throw new Error(`HTTP ${a.status}`);
      rows = (await a.json()).striking ?? [];
      marks = m.ok ? ((await m.json()).marks ?? {}) : {};
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

  type K = 'query' | 'intent' | 'page' | 'position' | 'impressions' | 'clicks' | 'ctr' | 'last';
  const sort = new TableSort<K>('impressions', -1, ['impressions', 'clicks', 'ctr', 'last']);
  const shown = $derived(
    sort.apply(
      rows.filter((r) => !onlyNew || !inThis(r)),
      (r, k) =>
        k === 'intent' ? ((t) => (t === 'conv' ? 1 : t === 'brand' ? 2 : null))(classifyIntent(r.query, r.page))
        : k === 'last' ? (lastOther(r)?.at ?? null)
        : r[k]
    )
  );

  async function add(r: Row) {
    const qty = drafts[key(r)];
    if (!qty) return;
    busy = new Set(busy).add(key(r));
    try {
      await onadd({ ...r, siteUrl, qty });
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
</script>

<div class="mt-3">
  <div class="mb-1 flex flex-wrap items-center gap-3 text-xs">
    <span class="font-semibold text-ink-2">Все ключи сайта · {days} дней</span>
    {#if !loading && !err}<span class="text-ink-3">{rows.length} ключей</span>{/if}
    <label class="flex items-center gap-1 text-ink-2"><input type="checkbox" bind:checked={onlyNew} /> скрыть уже добавленные в эту группу</label>
  </div>
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
            <SortTh {sort} k="query" label="Ключ" />
            <SortTh {sort} k="intent" label="Тип" />
            <SortTh {sort} k="page" label="Страница" />
            <SortTh {sort} k="position" label="Pos" num />
            <SortTh {sort} k="impressions" label="Impr" num />
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
            <tr>
              <td class="pii font-medium">{r.query}</td>
              <td><IntentBadge query={r.query} page={r.page} /></td>
              <td class="max-w-sm"><a class="pii break-all text-ink-3 hover:text-acc hover:underline" href={r.page} target="_blank" rel="noopener noreferrer">{r.page}</a></td>
              <td class="num app-num">{r.position.toFixed(1)}</td>
              <td class="num app-num">{fmt(r.impressions)}</td>
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
