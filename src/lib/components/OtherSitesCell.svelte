<script lang="ts">
  // «Мои другие сайты»: другие ваши сайты с показами по этому ключу и ссылки,
  // уже отобранные на них. Красным — если другой сайт стоит выше этого.
  import { comp } from '$lib/group-items.svelte';
  let { query, position }: { query: string; position: number } = $props();
  const e = $derived(comp.byQuery[query]);
  const owners = $derived(e?.owners ?? []);
  const links = $derived(e?.links ?? []);
  const linkSum = $derived.by(() => {
    const m = new Map<string, number>();
    for (const l of links) m.set(l.host, (m.get(l.host) ?? 0) + l.qty);
    return m;
  });
  const hosts = $derived([...new Set([...owners.map((o) => o.host), ...linkSum.keys()])]);
  const better = $derived(owners.some((o) => o.position < position));
  const sites = (n: number) => {
    const d = n % 10, h = n % 100;
    return d === 1 && h !== 11 ? 'сайт' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'сайта' : 'сайтов';
  };
</script>

{#if hosts.length === 0}
  {#if comp.loading && !comp.ownersLoaded}<span class="text-[11px] text-ink-4">…</span>{:else}<span class="text-ink-4">—</span>{/if}
{:else}
  <details class="relative text-[11px]">
    <summary class="cursor-pointer list-none whitespace-nowrap hover:underline {better ? 'font-semibold text-bad' : 'text-ink-2'}" title={better ? 'Другой ваш сайт стоит по этому ключу выше' : 'Этот ключ есть и у других ваших сайтов'}>
      {better ? '⚠ ' : ''}{hosts.length} {sites(hosts.length)}{linkSum.size ? ` · ${[...linkSum.values()].reduce((a, b) => a + b, 0)} ссыл.` : ''}
    </summary>
    <div class="absolute right-0 z-20 mt-1 min-w-[18rem] rounded border border-line bg-pane p-2 text-left shadow-lg">
      <table class="w-full text-[11px]">
        <thead><tr class="text-ink-3"><th class="text-left font-normal">Сайт</th><th class="text-right font-normal">Поз.</th><th class="text-right font-normal">Показы</th><th class="text-right font-normal">Ссылки</th></tr></thead>
        <tbody>
          {#each hosts as h (h)}
            {@const o = owners.find((x) => x.host === h)}
            <tr>
              <td class="pii pr-2 {o && o.position < position ? 'text-bad' : 'text-ink'}">{h}</td>
              <td class="text-right app-num">{o ? o.position.toFixed(1) : '—'}</td>
              <td class="text-right app-num">{o ? o.impressions.toLocaleString('ru-RU') : '—'}</td>
              <td class="text-right app-num">{linkSum.get(h) ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if links.length}
        <div class="mt-1 border-t border-line pt-1 text-ink-3">
          {#each links as l, i (i)}<div><a class="hover:underline" href="/groups?g={l.groupId}">{l.groupName}</a>: {l.host} · {l.qty} шт</div>{/each}
        </div>
      {/if}
      {#if !comp.ownersLoaded}<div class="mt-1 text-ink-4">Позиции других сайтов ещё загружаются…</div>{/if}
    </div>
  </details>
{/if}
