<script lang="ts">
  // Подпись вместо переключателя периода: период один на всю панель, в шапке.
  import { page } from '$app/state';
  let { start, end, note = '' }: { start?: string; end?: string; note?: string } = $props();
  const p = $derived(page.data.period as { startDate: string; endDate: string } | null);
  const fd = (iso: string) => iso.split('-').reverse().join('.');
  const a = $derived(start ?? p?.startDate ?? '');
  const b = $derived(end ?? p?.endDate ?? '');
</script>

{#if a && b}
  <span class="whitespace-nowrap text-xs text-ink-3" title="Период меняется в шапке — кнопка «Период»">
    Период: <b class="text-ink-2">{a === b ? fd(a) : `${fd(a)} – ${fd(b)}`}</b>{note ? ` · ${note}` : ''} · <span class="text-ink-4">меняется в шапке</span>
  </span>
{/if}
