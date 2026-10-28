<script lang="ts">
  // Ячейка «В группу» на странице Sites: + добавляет сайт в группу, ✓ — убирает.
  import { gi, targetGroup, siteInTarget, toggleSiteInTarget } from '$lib/group-items.svelte';
  let { siteUrl }: { siteUrl: string } = $props();
  const g = $derived(targetGroup());
  const on = $derived(siteInTarget(siteUrl));
  const busy = $derived(gi.busy.has('site:' + siteUrl));
</script>

<button
  type="button"
  class="btn btn-sm whitespace-nowrap {on ? 'bg-acc text-white hover:bg-acc-deep' : 'btn-sec'}"
  disabled={busy || !g}
  title={!g ? 'Сначала создайте группу над таблицей' : on ? `Убрать из ${g.name}` : `Добавить в ${g.name}`}
  aria-pressed={on}
  onclick={(e) => { e.stopPropagation(); toggleSiteInTarget(siteUrl); }}
>{on ? `✓ ${g?.name}` : '+'}</button>
