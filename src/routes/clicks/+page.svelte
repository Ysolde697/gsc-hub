<script lang="ts">
  // «Кнопки»: сколько раз на ваших сайтах нажали кнопки и отправили форму
  // заказа, рядом с кликами из Google — видно, как шаблон доводит до заказа.
  import { goto } from '$app/navigation';
  import SortTh from '$lib/components/SortTh.svelte';
  import { TableSort } from '$lib/table-sort.svelte';

  let { data } = $props();
  const PERIODS: [string, string][] = [['today', 'Сегодня'], ['yesterday', 'Вчера'], ['7', '7 дней'], ['28', '28 дней'], ['90', '3 мес'], ['180', '6 мес'], ['480', '16 мес']];
  const KIND: Record<string, string> = { view: 'Просмотр', submit: 'Отправка формы', button: 'Кнопка', out: 'Ссылка на другой сайт', link: 'Обычная ссылка' };
  const snippet = $derived(`<script async src="${data.origin}/c.js"><\/script>`);
  let copied = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* браузер не дал — пусть скопируют руками */
    }
  }

  let open = $state<Set<string>>(new Set());
  let withLinks = $state(false);
  const toggle = (h: string) => {
    const n = new Set(open);
    if (n.has(h)) n.delete(h);
    else n.add(h);
    open = n;
  };

  type Site = { host: string; impr: number; gsc: number; views: number; buttons: number; submits: number; rateSubmit: number | null; rateButton: number | null };
  const sitesRaw = $derived.by(() => {
    const m = new Map<string, Site>();
    const get = (h: string) => m.get(h) ?? (m.set(h, { host: h, impr: data.gscImpr[h] ?? 0, gsc: data.gsc[h] ?? 0, views: 0, buttons: 0, submits: 0, rateSubmit: null, rateButton: null }), m.get(h)!);
    for (const r of data.clicks) {
      const s = get(r.host);
      if (r.kind === 'view') s.views += r.n;
      else if (r.kind === 'submit') s.submits += r.n;
      else if (r.kind === 'button' || r.kind === 'out') s.buttons += r.n;
    }
    for (const h of Object.keys(data.lastSeen)) get(h);
    for (const s of m.values()) {
      s.rateSubmit = s.gsc ? s.submits / s.gsc : null;
      s.rateButton = s.gsc ? s.buttons / s.gsc : null;
    }
    return [...m.values()];
  });
  type K = 'host' | 'impr' | 'gsc' | 'views' | 'buttons' | 'submits' | 'rateButton' | 'rateSubmit';
  const sort = new TableSort<K>('submits', -1, ['impr', 'gsc', 'views', 'buttons', 'submits', 'rateButton', 'rateSubmit']);
  const sites = $derived(sort.apply(sitesRaw, (s, k) => s[k]));

  type DK = 'label' | 'kind' | 'page' | 'target' | 'n';
  const dsort = new TableSort<DK>('n', -1, ['n']);
  const detail = (h: string) => dsort.apply(data.clicks.filter((r) => r.host === h && r.kind !== 'view' && (withLinks || r.kind !== 'link')), (r, k) => r[k]);

  const fmt = (n: number) => n.toLocaleString('ru-RU');
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  const fmtDay = (iso: string) => iso.split('-').reverse().join('.');
  const periodLabel = $derived(data.period.startDate === data.period.endDate ? fmtDay(data.period.startDate) : `${fmtDay(data.period.startDate)} – ${fmtDay(data.period.endDate)}`);
  const totals = $derived(sitesRaw.reduce((a, s) => ({ v: a.v + s.views, b: a.b + s.buttons, s: a.s + s.submits }), { v: 0, b: 0, s: 0 }));
</script>

<svelte:head><title>Кнопки · GSC Hub</title></svelte:head>

<div class="desk">
  <section class="pane">
    <details class="border-b border-line" open={Object.keys(data.lastSeen).length === 0}>
      <summary class="cursor-pointer px-3 py-2 text-sm font-semibold">Как подключить счётчик к сайту</summary>
      <div class="space-y-2 px-3 pb-3 text-sm text-ink-2">
        <p>Вставьте эту строку в шаблон сайта перед <code>&lt;/head&gt;</code> (или перед <code>&lt;/body&gt;</code>) — один раз на каждый сайт:</p>
        <div class="flex flex-wrap items-center gap-2">
          <code class="pii rounded border border-line bg-sunk px-2 py-1 text-xs">{snippet}</code>
          <button type="button" class="btn btn-sec btn-sm" onclick={copy}>{copied ? 'Скопировано ✓' : 'Копировать'}</button>
        </div>
        <ul class="ml-5 list-disc text-xs text-ink-3">
          <li>Считает сам, размечать кнопки не нужно: отправку формы заказа, кнопки, ссылки на другие сайты (и, по галочке, обычные ссылки).</li>
          <li>Чтобы кнопка считалась под своим именем, добавьте ей <code>data-track="Название"</code>.</li>
          <li>Принимаются только ваши сайты из подключённых консолей. Без cookie и личных данных: хранится только «на сайте X нажали Y».</li>
          <li>Проверка: откройте свой сайт, нажмите кнопку — через минуту обновите эту страницу, сайт появится в списке.</li>
        </ul>
        {#if Object.keys(data.lastSeen).length}
          <p class="text-xs">Данные приходят с: {#each Object.entries(data.lastSeen) as [h, d], i (h)}{i ? ', ' : ''}<span class="pii">{h}</span> <span class="text-ink-4">(последнее {fmtDay(d)})</span>{/each}</p>
        {/if}
      </div>
    </details>

    <div class="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
      <h1 class="text-base font-semibold">Кнопки</h1>
      <div class="app-segmented" role="group" aria-label="Период">
        {#each PERIODS as [v, label] (v)}
          <button type="button" class:is-active={data.period.key === v} onclick={() => goto(`?p=${v}`, { keepFocus: true, noScroll: true })}>{label}</button>
        {/each}
      </div>
      <span class="text-xs text-ink-3">{periodLabel}</span>
      <span class="text-xs text-ink-3">· просмотров {fmt(totals.v)} · нажатий кнопок {fmt(totals.b)} · отправок формы {fmt(totals.s)}</span>
      <label class="ml-auto flex items-center gap-1 text-xs text-ink-2"><input type="checkbox" bind:checked={withLinks} /> показывать и обычные ссылки</label>
    </div>

    {#if sites.length === 0}
      <p class="p-3 text-ink-3">Пока нет данных. Подключите счётчик к сайтам — инструкция выше.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="app-table">
          <thead>
            <tr>
              <SortTh {sort} k="host" label="Сайт" />
              <SortTh {sort} k="impr" label="Показы в Google" num title="Search Console за тот же период: сколько раз сайт показали в поиске" />
              <SortTh {sort} k="gsc" label="Клики из Google" num title="Search Console за тот же период" />
              <SortTh {sort} k="views" label="Просмотры страниц" num title="Сколько раз открыли страницы сайта (счётчик; считается с момента обновления скрипта)" />
              <SortTh {sort} k="buttons" label="Нажали кнопку" num title="Кнопки и ссылки на другие сайты" />
              <SortTh {sort} k="rateButton" label="% от кликов" num title="Нажали кнопку / клики из Google" />
              <SortTh {sort} k="submits" label="Отправили форму" num title="Отправка формы заказа (Continue to checkout и т.п.)" />
              <SortTh {sort} k="rateSubmit" label="% от кликов" num title="Отправили форму / клики из Google" />
            </tr>
          </thead>
          <tbody>
            {#each sites as s (s.host)}
              <tr class="cursor-pointer" class:is-selected={open.has(s.host)} onclick={() => toggle(s.host)}>
                <td class="pii font-semibold text-ink">
                  <span class="flex items-center gap-1">
                    <svg viewBox="0 0 16 16" class="h-3 w-3 shrink-0 text-ink-4 transition-transform {open.has(s.host) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>
                    {s.host}
                  </span>
                </td>
                <td class="num app-num">{fmt(s.impr)}</td>
                <td class="num app-num">{fmt(s.gsc)}</td>
                <td class="num app-num">{fmt(s.views)}</td>
                <td class="num app-num">{fmt(s.buttons)}</td>
                <td class="num app-num">{pct(s.rateButton)}</td>
                <td class="num app-num font-semibold">{fmt(s.submits)}</td>
                <td class="num app-num">{pct(s.rateSubmit)}</td>
              </tr>
              {#if open.has(s.host)}
                {@const list = detail(s.host)}
                <tr class="bg-sunk hover:bg-sunk">
                  <td colspan="8" class="px-3 py-2">
                    {#if list.length === 0}
                      <p class="text-xs text-ink-3">За этот период нажатий нет.</p>
                    {:else}
                      <table class="app-table rounded border border-line bg-pane">
                        <thead>
                          <tr>
                            <SortTh sort={dsort} k="label" label="Кнопка / текст" />
                            <SortTh sort={dsort} k="kind" label="Что это" />
                            <SortTh sort={dsort} k="page" label="На какой странице" />
                            <SortTh sort={dsort} k="target" label="Куда ведёт" />
                            <SortTh sort={dsort} k="n" label="Нажатий" num />
                          </tr>
                        </thead>
                        <tbody>
                          {#each list as r (r.page + r.kind + r.label + r.target)}
                            <tr>
                              <td class="font-medium">{r.label}</td>
                              <td class="text-xs {r.kind === 'submit' ? 'font-semibold text-emerald-700' : 'text-ink-3'}">{KIND[r.kind]}</td>
                              <td class="pii text-xs"><a class="hover:text-acc hover:underline" href="https://{s.host}{r.page}" target="_blank" rel="noopener noreferrer">{r.page}</a></td>
                              <td class="pii break-all text-xs text-ink-3">{r.target || '—'}</td>
                              <td class="num app-num">{fmt(r.n)}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
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
