<script lang="ts">
  // «Доступность»: открываются ли сайты и та ли на них страница.
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import SortTh from '$lib/components/SortTh.svelte';
  import { TableSort } from '$lib/table-sort.svelte';

  let { data, form } = $props();
  let busy = $state<string | null>(null);
  let open = $state<Set<string>>(new Set());
  let onlyBad = $state(false);
  const toggle = (h: string) => {
    const n = new Set(open);
    if (n.has(h)) n.delete(h);
    else n.add(h);
    open = n;
  };

  type Check = (typeof data.checks)[number];
  type Row = { host: string; home: Check | null; order: Check | null; level: 'ok' | 'warn' | 'error' | 'none'; checkedAt: number | null; since: number | null };
  const RANK = { error: 0, warn: 1, none: 2, ok: 3 } as const;
  const rowsRaw = $derived.by((): Row[] =>
    data.hosts.map((h) => {
      const home = data.checks.find((c) => c.host === h && c.kind === 'home') ?? null;
      const order = data.checks.find((c) => c.host === h && c.kind === 'order') ?? null;
      const lv = [home?.level, order?.level];
      const level = lv.includes('error') ? 'error' : lv.includes('warn') ? 'warn' : home ? 'ok' : 'none';
      const bad = [home, order].filter((c) => c && c.level === level);
      return { host: h, home, order, level, checkedAt: home?.checkedAt ?? null, since: bad.length ? Math.min(...bad.map((c) => c!.since)) : null };
    })
  );
  type K = 'host' | 'level' | 'ms' | 'checkedAt';
  const sort = new TableSort<K>('level', 1);
  const rows = $derived(
    sort.apply(
      rowsRaw.filter((r) => !onlyBad || r.level === 'error' || r.level === 'warn'),
      (r, k) => (k === 'host' ? r.host : k === 'level' ? RANK[r.level] : k === 'ms' ? (r.home?.data.ms ?? null) : r.checkedAt)
    )
  );
  const counts = $derived(rowsRaw.reduce((a, r) => ({ ...a, [r.level]: (a[r.level] ?? 0) + 1 }), {} as Record<string, number>));
  const ago = (t: number | null) => {
    if (!t) return '—';
    const m = Math.round((Date.now() - t) / 60000);
    return m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн. назад`;
  };
  const when = (t: number) => new Date(t).toLocaleString('ru-RU', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const LABEL = { ok: 'Всё в порядке', warn: 'Есть замечания', error: 'Проблема', none: 'Ещё не проверялся' } as const;
  const CLS = { ok: 'badge-ok', warn: 'badge-warn', error: 'badge-bad', none: 'badge-muted' } as const;
</script>

<svelte:head><title>Доступность · GSC Hub</title></svelte:head>

<div class="desk">
  <section class="pane">
    <div class="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
      <h1 class="text-base font-semibold">Доступность сайтов</h1>
      <span class="text-xs text-ink-3">
        {counts.error ?? 0} с проблемой · {counts.warn ?? 0} с замечаниями · {counts.ok ?? 0} в порядке{counts.none ? ` · ${counts.none} ещё не проверялись` : ''}
      </span>
      <label class="flex items-center gap-1 text-xs text-ink-2"><input type="checkbox" bind:checked={onlyBad} /> только проблемные</label>
      <label class="flex items-center gap-1 text-xs text-ink-2" title="Без галочки — сайты консолей, выбранных в шапке"><input type="checkbox" checked={data.all} onchange={(e) => goto(e.currentTarget.checked ? '?all=1' : '?', { keepFocus: true, noScroll: true })} /> все консоли</label>
      <span class="flex-1"></span>
      <form method="POST" action="?/interval" use:enhance class="flex items-center gap-1 text-xs text-ink-3">
        Проверять каждые
        <select name="h" class="input h-7 text-xs" value={String(data.interval)} onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Частота проверки">
          {#each data.intervals as h (h)}<option value={String(h)}>{h} ч</option>{/each}
        </select>
      </form>
      <form method="POST" action="?/checkAll" use:enhance={() => { busy = 'all'; return async ({ update }) => { await update(); busy = null; }; }}>
        <button class="btn btn-pri btn-sm" disabled={!!busy}>{busy === 'all' ? 'Проверяю все сайты…' : 'Проверить все сейчас'}</button>
      </form>
    </div>
    <p class="border-b border-line px-3 py-2 text-xs text-ink-3">
      Проверяется главная и страница заказа (её панель находит по форме на главной): открывается ли, нет ли ошибки, чужого перенаправления, заглушки «домен продаётся» / «аккаунт приостановлен», ошибки или проверки Cloudflare, не истекает ли SSL. «Та ли страница» — сравнение с первым удачным видом страницы (эталоном); если вы сами поменяли сайт, нажмите «Это нормально». Главную ещё открываем как Googlebot — если Google видит другое, это признак взлома. Сайты консолей, выбранных в шапке (галочка «все консоли» — все сайты).
    </p>
    {#if form?.error}<p class="px-3 py-2 text-xs text-bad">{form.error}</p>{/if}

    {#if data.hosts.length === 0}
      <p class="p-3 text-ink-3">В выбранных консолях нет сайтов.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="app-table">
          <thead>
            <tr>
              <SortTh {sort} k="host" label="Сайт" />
              <SortTh {sort} k="level" label="Состояние" />
              <th>Что не так</th>
              <SortTh {sort} k="ms" label="Скорость" num />
              <SortTh {sort} k="checkedAt" label="Проверен" />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.host)}
              {@const probs = [...(r.home?.data.problems ?? []).map((p) => ({ ...p, where: 'главная' })), ...(r.order?.data.problems ?? []).map((p) => ({ ...p, where: 'заказ' }))].filter((p) => p.level !== 'ok')}
              <tr class="cursor-pointer" class:is-selected={open.has(r.host)} onclick={() => toggle(r.host)}>
                <td class="pii font-semibold text-ink">
                  <span class="flex items-center gap-1">
                    <svg viewBox="0 0 16 16" class="h-3 w-3 shrink-0 text-ink-4 transition-transform {open.has(r.host) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>
                    {r.host}
                  </span>
                </td>
                <td class="whitespace-nowrap"><span class="badge {CLS[r.level]}">{LABEL[r.level]}</span>{#if r.since && r.level !== 'ok' && r.level !== 'none'}<span class="ml-1 text-[11px] text-ink-3">с {when(r.since)}</span>{/if}</td>
                <td class="max-w-xl text-xs">
                  {#if probs.length === 0}<span class="text-ink-4">—</span>{/if}
                  {#each probs as p, i (i)}<div class={p.level === 'error' ? 'text-bad' : 'text-ink-2'}>{p.where === 'заказ' ? 'Заказ: ' : ''}{p.text}</div>{/each}
                </td>
                <td class="num app-num">{r.home ? `${(r.home.data.ms / 1000).toFixed(1)} с` : '—'}</td>
                <td class="whitespace-nowrap text-xs text-ink-3">{ago(r.checkedAt)}</td>
                <td class="whitespace-nowrap text-right" onclick={(e) => e.stopPropagation()}>
                  <form method="POST" action="?/checkOne" class="inline" use:enhance={() => { busy = r.host; return async ({ update }) => { await update(); busy = null; }; }}>
                    <input type="hidden" name="host" value={r.host} />
                    <button class="btn btn-sec btn-sm" disabled={!!busy}>{busy === r.host ? 'Проверяю…' : 'Проверить'}</button>
                  </form>
                  {#if probs.some((p) => /изменил|заголовок|меньше/i.test(p.text))}
                    <form method="POST" action="?/accept" class="inline" use:enhance={({ cancel }) => { if (!confirm(`Запомнить текущий вид ${r.host} как нормальный?`)) cancel(); busy = r.host; return async ({ update }) => { await update(); busy = null; }; }}>
                      <input type="hidden" name="host" value={r.host} />
                      <button class="btn btn-ghost btn-sm" disabled={!!busy} title="Вы сами поменяли сайт — сделать текущий вид эталоном">Это нормально</button>
                    </form>
                  {/if}
                </td>
              </tr>
              {#if open.has(r.host)}
                <tr class="bg-sunk hover:bg-sunk">
                  <td colspan="6" class="px-3 py-2 text-xs">
                    <div class="grid gap-3 md:grid-cols-2">
                      {#each [['Главная', r.home], ['Страница заказа', r.order]] as [name, c] (name)}
                        {@const ch = c as Check | null}
                        <div class="rounded border border-line bg-pane p-2">
                          <div class="mb-1 font-semibold">{name}</div>
                          {#if !ch}
                            <div class="text-ink-3">{name === 'Страница заказа' ? 'Форма заказа на главной не найдена — страницу заказа не проверяем.' : 'Ещё не проверялась.'}</div>
                          {:else}
                            <div><a class="pii text-acc hover:underline" href={ch.url} target="_blank" rel="noopener noreferrer">{ch.url}</a></div>
                            <div>Ответ: <b>{ch.data.status ?? 'нет'}</b> · {(ch.data.ms / 1000).toFixed(1)} с{ch.data.finalUrl !== ch.url ? ` · открылось: ${ch.data.finalUrl}` : ''}</div>
                            <div>Заголовок: {ch.data.title || '—'}</div>
                            <div>Текста: {ch.data.textLen.toLocaleString('ru-RU')} знаков{ch.data.similarity !== null ? ` · совпадает с эталоном на ${Math.round(ch.data.similarity * 100)}%` : ''}</div>
                            {#if ch.data.ssl}<div>SSL: ещё {ch.data.ssl.daysLeft} дн. ({ch.data.ssl.issuer})</div>{/if}
                            {#if ch.data.googlebot}<div>Googlebot: ответ {ch.data.googlebot.status ?? 'нет'} · «{ch.data.googlebot.title || '—'}»</div>{/if}
                          {/if}
                        </div>
                      {/each}
                    </div>
                    {#if data.history[r.host]?.length}
                      <div class="mt-2 font-semibold">История</div>
                      {#each data.history[r.host] as h (h.at + h.url)}
                        <div class={h.level === 'error' ? 'text-bad' : h.level === 'warn' ? 'text-ink-2' : 'text-emerald-700'}>{when(h.at)} · {h.url.endsWith('/') && h.url.split('/').length <= 4 ? 'главная' : 'заказ'} · {h.summary}</div>
                      {/each}
                    {/if}
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
