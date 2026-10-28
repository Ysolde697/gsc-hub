<script lang="ts">
  // Текстом, по строке на сайт: сколько ссылок на этот ключ взято для других
  // ваших сайтов и предупреждение, если другой сайт стоит по ключу выше.
  import type { OtherOwner, OtherLink } from '$lib/group-items.svelte';
  let {
    owners = [],
    links = [],
    position = null,
    loading = false
  }: { owners?: OtherOwner[]; links?: OtherLink[]; position?: number | null; loading?: boolean } = $props();

  const rows = $derived.by(() => {
    const m = new Map<string, { host: string; qty: number; groups: string[]; pos: number | null }>();
    for (const l of links) {
      const e = m.get(l.host) ?? { host: l.host, qty: 0, groups: [], pos: null };
      e.qty += l.qty;
      if (!e.groups.includes(l.groupName)) e.groups.push(l.groupName);
      m.set(l.host, e);
    }
    for (const o of owners) {
      const e = m.get(o.host) ?? { host: o.host, qty: 0, groups: [], pos: null };
      e.pos = o.position;
      m.set(o.host, e);
    }
    // Сначала те, где куплены ссылки или кто выше, остальные — только если выше.
    return [...m.values()]
      .filter((e) => e.qty > 0 || (e.pos !== null && position !== null && e.pos < position))
      .sort((a, b) => b.qty - a.qty || (a.pos ?? 999) - (b.pos ?? 999));
  });
  const higher = (pos: number | null) => pos !== null && position !== null && pos < position;
  const SHOW = 5;
</script>

{#if rows.length === 0}
  {#if loading}<span class="text-[11px] text-ink-4">…</span>{:else}<span class="text-ink-4">—</span>{/if}
{:else}
  <div class="space-y-0.5 text-[11px] leading-tight">
    {#each rows.slice(0, SHOW) as r (r.host)}
      <div class="whitespace-nowrap {higher(r.pos) ? 'font-semibold text-bad' : 'text-ink-2'}">
        {higher(r.pos) ? '⚠ ' : ''}<span class="pii">{r.host}</span>
        {#if r.qty}— <b>{r.qty} шт</b> <span class="font-normal text-ink-3">({r.groups.join(', ')})</span>{/if}
        {#if higher(r.pos)}· выше: поз. {r.pos!.toFixed(1)}{/if}
      </div>
    {/each}
    {#if rows.length > SHOW}
      <div class="text-ink-3" title={rows.slice(SHOW).map((r) => r.host).join(', ')}>и ещё {rows.length - SHOW}</div>
    {/if}
  </div>
{/if}
