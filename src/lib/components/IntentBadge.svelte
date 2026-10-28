<script lang="ts">
  // Метка типа ключа: зелёная — конверсионный, жёлтая — бренд/коммерция, иначе пусто.
  import { classifyIntent } from '$lib/utils/intent';
  let { query, page = '', brandTerms = [] }: { query: string; page?: string; brandTerms?: string[] } = $props();
  const intent = $derived(classifyIntent(query, page, brandTerms));
</script>

{#if intent === 'conv'}
  <span class="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium" style="background:#dcfce7;color:#166534" title="Конверсионный: бонус, код, регистрация, приложение, игра">конверсия</span>
{:else if intent === 'brand'}
  <span class="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium" style="background:#fef3c7;color:#92400e" title="Брендовый или коммерческий запрос">бренд / комм.</span>
{/if}
