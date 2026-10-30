<script lang="ts">
  // Период: готовые варианты (Сегодня, Вчера, 7 дней…) и свои даты «с … по …».
  // value — ключ периода: 'today' | 'yesterday' | '7' | … | '2026-10-01_2026-10-15'.
  let {
    value,
    onchange,
    presets = [['today', 'Сегодня'], ['yesterday', 'Вчера'], ['7', '7 дней'], ['28', '28 дней'], ['90', '3 мес'], ['180', '6 мес'], ['480', '16 мес']],
    disabled = false
  }: { value: string; onchange: (key: string) => void; presets?: [string, string][]; disabled?: boolean } = $props();

  const CUSTOM = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;
  const isCustom = $derived(CUSTOM.test(value));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let open = $state(false);
  let from = $state('');
  let to = $state('');
  $effect(() => {
    const m = CUSTOM.exec(value);
    if (m) {
      from = m[1];
      to = m[2];
    }
  });
  const fd = (iso: string) => iso.split('-').reverse().join('.');
  function apply() {
    if (!from || !to) return;
    const [a, b] = from <= to ? [from, to] : [to, from];
    open = false;
    onchange(`${a}_${b}`);
  }
</script>

<div class="relative inline-flex flex-wrap items-center gap-2">
  <div class="app-segmented" role="group" aria-label="Период">
    {#each presets as [v, label] (v)}
      <button type="button" class:is-active={value === v} {disabled} onclick={() => onchange(v)}>{label}</button>
    {/each}
    <button type="button" class:is-active={isCustom} {disabled} aria-expanded={open} title="Свой период: с какого по какое число" onclick={() => (open = !open)}>
      {isCustom ? `${fd(from)} – ${fd(to)}` : 'Даты…'}
    </button>
  </div>
  {#if open}
    <div class="absolute left-0 top-full z-30 mt-1 flex flex-wrap items-end gap-2 rounded border border-line bg-pane p-2 text-xs shadow-[0_6px_20px_-6px_rgb(19_23_34/0.25)]">
      <label class="flex flex-col gap-0.5 text-ink-3">с <input class="input h-7 text-xs" type="date" max={today} bind:value={from} /></label>
      <label class="flex flex-col gap-0.5 text-ink-3">по <input class="input h-7 text-xs" type="date" max={today} bind:value={to} /></label>
      <button type="button" class="btn btn-pri btn-sm" disabled={!from || !to} onclick={apply}>Показать</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (open = false)}>Отмена</button>
    </div>
  {/if}
</div>
