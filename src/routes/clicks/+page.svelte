<script lang="ts">
  // «Кнопки»: сколько раз на ваших сайтах нажали кнопки и отправили форму
  // заказа, рядом с кликами из Google — видно, как шаблон доводит до заказа.
  import { goto } from '$app/navigation';
  import PeriodNote from '$lib/components/PeriodNote.svelte';
  import { enhance } from '$app/forms';
  import SortTh from '$lib/components/SortTh.svelte';
  import { TableSort } from '$lib/table-sort.svelte';

  let { data, form } = $props();
  const KIND: Record<string, string> = { view: 'Просмотр', submit: 'Дошёл до оплаты', button: 'Кнопка', out: 'Ссылка на другой сайт', link: 'Обычная ссылка' };
  let copied = $state<'' | 'code' | 'key'>('');
  let showCode = $state(false);
  async function copy(text: string, what: 'code' | 'key') {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ''), 2000);
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

  type Site = { host: string; impr: number; gsc: number; views: number; seconds: number; avg: number | null; buttons: number; submits: number; rateSubmit: number | null; rateButton: number | null };
  const sitesRaw = $derived.by(() => {
    const m = new Map<string, Site>();
    const get = (h: string) => m.get(h) ?? (m.set(h, { host: h, impr: data.gscImpr[h] ?? 0, gsc: data.gsc[h] ?? 0, views: 0, seconds: 0, avg: null, buttons: 0, submits: 0, rateSubmit: null, rateButton: null }), m.get(h)!);
    for (const r of data.clicks) {
      const s = get(r.host);
      if (r.kind === 'view') s.views += r.n;
      else if (r.kind === 'submit') s.submits += r.n;
      else if (r.kind === 'button' || r.kind === 'out') s.buttons += r.n;
    }
    for (const h of data.hosts) get(h);
    for (const t of data.time) get(t.host).seconds += t.seconds;
    for (const s of m.values()) {
      s.avg = s.views ? s.seconds / s.views : null;
      s.rateSubmit = s.views ? s.submits / s.views : null;
      s.rateButton = s.views ? s.buttons / s.views : null;
    }
    return [...m.values()];
  });
  type K = 'host' | 'impr' | 'gsc' | 'views' | 'avg' | 'buttons' | 'submits' | 'rateButton' | 'rateSubmit';
  const sort = new TableSort<K>('submits', -1, ['impr', 'gsc', 'views', 'avg', 'buttons', 'submits', 'rateButton', 'rateSubmit']);
  const sites = $derived(sort.apply(sitesRaw, (s, k) => s[k]));

  type DK = 'label' | 'kind' | 'page' | 'target' | 'n';
  const dsort = new TableSort<DK>('n', -1, ['n']);
  const detail = (h: string) => dsort.apply(data.clicks.filter((r) => r.host === h && r.kind !== 'view' && (withLinks || r.kind !== 'link')), (r, k) => r[k]);

  // По страницам сайта: просмотры, среднее время, нажатия, заказы.
  type Page = { page: string; views: number; avg: number | null; buttons: number; submits: number };
  type PK = 'page' | 'views' | 'avg' | 'buttons' | 'submits';
  const psort = new TableSort<PK>('views', -1, ['views', 'avg', 'buttons', 'submits']);
  function pagesOf(h: string): Page[] {
    const m = new Map<string, Page & { seconds: number }>();
    const get = (p: string) => m.get(p) ?? (m.set(p, { page: p, views: 0, avg: null, buttons: 0, submits: 0, seconds: 0 }), m.get(p)!);
    for (const r of data.clicks) {
      if (r.host !== h) continue;
      const p = get(r.page);
      if (r.kind === 'view') p.views += r.n;
      else if (r.kind === 'submit') p.submits += r.n;
      else if (r.kind === 'button' || r.kind === 'out') p.buttons += r.n;
    }
    for (const t of data.time) if (t.host === h) get(t.page).seconds += t.seconds;
    for (const p of m.values()) p.avg = p.views ? p.seconds / p.views : null;
    return psort.apply([...m.values()], (p, k) => p[k]);
  }
  /** 75 → «1 мин 15 с» */
  const dur = (sec: number | null) => {
    if (sec === null) return '—';
    const s = Math.round(sec);
    return s < 60 ? `${s} с` : `${Math.floor(s / 60)} мин ${s % 60} с`;
  };
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
      <summary class="cursor-pointer px-3 py-2 text-sm font-semibold">Как подключить счётчик к сайту (Cloudflare)</summary>
      <div class="space-y-2 px-3 pb-3 text-sm text-ink-2">
        <p>Считает Cloudflare Worker: он подключает к страницам маленький файл счётчика <b>с адреса самого сайта</b> (<code>/_e.js</code>) — защита сайта (CSP) его пропускает, в шаблоне ничего не меняется, адреса панели на сайте нет, сайты между собой не связаны. Переход к оплате, который сразу уводит на кассу, Worker засчитывает сам.</p>
        <ol class="ml-5 list-decimal space-y-1">
          <li>Cloudflare → <b>Workers &amp; Pages</b> → <b>Create</b> → <b>Create Worker</b> (Hello World) → назовите, например, <code>site-stats</code> → <b>Deploy</b>.</li>
          <li><b>Edit code</b> → удалите всё, вставьте код ниже («Копировать код Worker») → <b>Deploy</b>.</li>
          <li>Worker → <b>Settings</b> → <b>Variables and Secrets</b> → <b>Add</b> → тип <b>Secret</b>, имя <code>COUNTER_KEY</code>, значение — ключ («Копировать ключ») → <b>Deploy</b>. Ключа в коде нет — только здесь.</li>
          <li>Worker → <b>Settings</b> → <b>Domains &amp; Routes</b> → <b>Add</b> → <b>Route</b>: зона — ваш сайт, маршрут <code>fccoins.fr/*</code> (и <code>www.fccoins.fr/*</code>, если сайт открывается с www).</li>
          <li>Новые сайты — только шаг 4: маршрут в тот же Worker. Сайт должен быть в подключённой консоли Search Console, иначе панель его не примет.</li>
          <li>Проверка: откройте сайт в обычном браузере, нажмите кнопку заказа — через минуту обновите эту страницу.</li>
        </ol>
        <p class="text-xs text-ink-3">Старый подсчёт (другой Worker, Zaraz, правило) уберите, чтобы не считалось дважды. Новый ключ не ломает сайты: старые ключи принимаются, пока вы их не отзовёте. Отзывайте только утёкший ключ — и только после того, как поставили сайтам текущий. Бесплатный тариф Cloudflare — 100 000 запросов к Worker в день на аккаунт.</p>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn btn-pri btn-sm" onclick={() => copy(data.workerCode, 'code')}>{copied === 'code' ? 'Скопировано ✓' : 'Копировать код Worker'}</button>
          <button type="button" class="btn btn-sec btn-sm" onclick={() => copy(data.counterKey, 'key')}>{copied === 'key' ? 'Скопировано ✓' : 'Копировать ключ'}</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => (showCode = !showCode)}>{showCode ? 'Скрыть код' : 'Показать код'}</button>
          <form method="POST" action="?/rotateKey" use:enhance={({ cancel }) => { if (!confirm('Выдать новый ключ? Старые ключи продолжат работать, пока вы их не отзовёте — сайты не сломаются.')) cancel(); }}>
            <button class="btn btn-ghost btn-sm">Новый ключ</button>
          </form>
        </div>
        {#if form?.rotated}<p class="text-xs text-emerald-700">Новый ключ выдан — ставьте его на новые сайты. Старые ключи продолжают работать.</p>{/if}
        {#if form?.keyError}<p class="text-xs text-bad">{form.keyError}</p>{/if}
        {#if data.keys.length}
          <div class="text-xs">
            <div class="mb-1 font-semibold text-ink-2">Ключи (принимается любой не отозванный)</div>
            <table class="app-table rounded border border-line bg-pane">
              <thead><tr><th>Ключ</th><th>Выдан</th><th>Последний раз</th><th>С каких сайтов приходит</th><th></th></tr></thead>
              <tbody>
                {#each data.keys as k (k.hash)}
                  <tr class={k.revokedAt ? 'opacity-50' : ''}>
                    <td class="whitespace-nowrap font-mono">{k.prefix}…{#if k.current} <span class="badge badge-ok">текущий</span>{/if}{#if k.revokedAt} <span class="badge badge-bad">отозван</span>{/if}</td>
                    <td class="whitespace-nowrap">{new Date(k.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td class="whitespace-nowrap">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td class="pii">{k.hosts.join(', ') || '—'}</td>
                    <td class="text-right">
                      {#if !k.current && !k.revokedAt}
                        <form method="POST" action="?/revokeKey" use:enhance={({ cancel }) => { if (!confirm(k.hosts.length ? `Отозвать ключ ${k.prefix}…? Перестанут считать: ${k.hosts.join(', ')} — им нужно будет поставить текущий ключ.` : `Отозвать ключ ${k.prefix}…?`)) cancel(); }}>
                          <input type="hidden" name="hash" value={k.hash} />
                          <button class="btn btn-ghost btn-sm text-bad" title="Если ключ утёк">Отозвать</button>
                        </form>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
        <ul class="ml-5 list-disc text-xs text-ink-3">
          <li>Просмотры и время считаются только у настоящих браузеров; боты и проверялки отсеиваются. Время — только пока страница видна на экране.</li>
          <li>«Дошли до оплаты» — только когда после формы реально открылась страница оплаты. Нажатие, после которого сайт не пустил дальше (например, сумма меньше минимума), не считается.</li>
          <li>Чтобы кнопка считалась под своим именем, можно добавить ей <code>data-track="Название"</code>. Без cookie и личных данных.</li>
        </ul>
        {#if Object.keys(data.lastSeen).length}
          <p class="text-xs">Данные приходят с: {#each Object.entries(data.lastSeen) as [h, d], i (h)}{i ? ', ' : ''}<span class="pii">{h}</span> <span class="text-ink-4">(последнее {fmtDay(d)})</span>{/each}</p>
        {/if}
      </div>
    </details>

    <div class="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
      <h1 class="text-base font-semibold">Кнопки</h1>
      <PeriodNote start={data.period.startDate} end={data.period.endDate} />
      <span class="text-xs text-ink-3">{periodLabel}</span>
      <span class="text-xs text-ink-3">· просмотров {fmt(totals.v)} · нажатий кнопок {fmt(totals.b)} · дошли до оплаты {fmt(totals.s)}</span>
      <label class="ml-auto flex items-center gap-1 text-xs text-ink-2"><input type="checkbox" bind:checked={withLinks} /> показывать и обычные ссылки</label>
    </div>

    {#if sites.length === 0}
      <p class="p-3 text-ink-3">В выбранных консолях нет сайтов. Отметьте консоль в шапке («Консоли»).</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="app-table">
          <thead>
            <tr>
              <SortTh {sort} k="host" label="Сайт" />
              <SortTh {sort} k="impr" label="Показы в Google" num title="Search Console за тот же период: сколько раз сайт показали в поиске" />
              <SortTh {sort} k="gsc" label="Клики из Google" num title="Search Console за тот же период" />
              <SortTh {sort} k="views" label="Просмотры страниц" num title="Сколько раз открыли страницы сайта (счётчик; считается с момента обновления скрипта)" />
              <SortTh {sort} k="avg" label="Среднее время" num title="Сколько в среднем страница была открыта на экране (свёрнутая вкладка не считается)" />
              <SortTh {sort} k="buttons" label="Нажали кнопку" num title="Кнопки и ссылки на другие сайты" />
              <SortTh {sort} k="rateButton" label="% от просмотров" num title="Нажали кнопку / просмотры страниц" />
              <SortTh {sort} k="submits" label="Дошли до оплаты" num title="После формы заказа реально открылась страница оплаты" />
              <SortTh {sort} k="rateSubmit" label="% от просмотров" num title="Дошли до оплаты / просмотры страниц" />
            </tr>
          </thead>
          <tbody>
            {#each sites as s (s.host)}
              <tr class="cursor-pointer" class:is-selected={open.has(s.host)} onclick={() => toggle(s.host)}>
                <td class="pii font-semibold text-ink">
                  <span class="flex items-center gap-1">
                    <svg viewBox="0 0 16 16" class="h-3 w-3 shrink-0 text-ink-4 transition-transform {open.has(s.host) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>
                    {s.host}
                    {#if !data.lastSeen[s.host]}<span class="badge badge-muted ml-1 font-normal" title="С этого сайта ещё не пришло ни одного события — маршрут Worker в Cloudflare не добавлен">счётчик не стоит</span>{/if}
                  </span>
                </td>
                <td class="num app-num">{fmt(s.impr)}</td>
                <td class="num app-num">{fmt(s.gsc)}</td>
                <td class="num app-num">{fmt(s.views)}</td>
                <td class="num app-num">{dur(s.avg)}</td>
                <td class="num app-num">{fmt(s.buttons)}</td>
                <td class="num app-num">{pct(s.rateButton)}</td>
                <td class="num app-num font-semibold">{fmt(s.submits)}</td>
                <td class="num app-num">{pct(s.rateSubmit)}</td>
              </tr>
              {#if open.has(s.host)}
                {@const list = detail(s.host)}
                {@const pages = pagesOf(s.host)}
                <tr class="bg-sunk hover:bg-sunk">
                  <td colspan="9" class="px-3 py-2">
                    {#if pages.length}
                      <div class="mb-1 text-xs font-semibold text-ink-2">Страницы</div>
                      <table class="app-table mb-3 rounded border border-line bg-pane">
                        <thead>
                          <tr>
                            <SortTh sort={psort} k="page" label="Страница" />
                            <SortTh sort={psort} k="views" label="Просмотры" num />
                            <SortTh sort={psort} k="avg" label="Среднее время" num />
                            <SortTh sort={psort} k="buttons" label="Нажали кнопку" num />
                            <SortTh sort={psort} k="submits" label="Дошли до оплаты" num />
                          </tr>
                        </thead>
                        <tbody>
                          {#each pages as pg (pg.page)}
                            <tr>
                              <td class="pii text-xs"><a class="hover:text-acc hover:underline" href="https://{s.host}{pg.page}" target="_blank" rel="noopener noreferrer">{pg.page}</a></td>
                              <td class="num app-num">{fmt(pg.views)}</td>
                              <td class="num app-num">{dur(pg.avg)}</td>
                              <td class="num app-num">{fmt(pg.buttons)}</td>
                              <td class="num app-num font-semibold">{fmt(pg.submits)}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                      <div class="mb-1 text-xs font-semibold text-ink-2">Кнопки и ссылки</div>
                    {/if}
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
