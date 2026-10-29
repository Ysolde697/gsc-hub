// Частотность ключей одного сайта: оценка по Search Console и точное число
// из DataForSEO (если уже проверяли). Экземпляр на таблицу.
export type VolumeInfo = {
  est: { value: number; kind: 'top10' | 'min'; host: string; position: number } | null;
  dfs?: number | null;
};

export class Volumes {
  byQuery = $state<Record<string, VolumeInfo>>({});
  country = $state<string | null>(null);
  configured = $state(false);
  loading = $state(false);
  checking = $state(false);
  error = $state<string | null>(null);
  note = $state<string | null>(null);
  #lastKey = '';

  async #post(site: string, queries: string[], check: boolean) {
    const r = await fetch('/keywords/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site, queries, check })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    this.byQuery = { ...this.byQuery, ...j.byQuery };
    this.country = j.country;
    this.configured = j.configured;
    return j;
  }

  /** Подгрузить для ключей таблицы (без DataForSEO, бесплатно). */
  async load(site: string, queries: string[]) {
    const key = site + '\n' + queries.join('\n');
    if (!queries.length || key === this.#lastKey) return;
    this.#lastKey = key;
    this.loading = true;
    try {
      await this.#post(site, queries, false);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
    }
  }

  /** Точная частотность в DataForSEO — только по кнопке. */
  async check(site: string, queries: string[]) {
    this.checking = true;
    this.error = null;
    this.note = null;
    try {
      const j = await this.#post(site, queries, true);
      if (j.checkError) this.error = j.checkError;
      else if (j.checked) {
        const c = j.checked as { requested: number; skipped: number; cost: number };
        this.note = c.requested
          ? `Проверено ${c.requested} ключей · списано $${c.cost.toFixed(3)}${c.skipped ? ` · ${c.skipped} пропущено (не подходят для Google Ads)` : ''}`
          : `Новых ключей нет — все уже проверены${c.skipped ? `, ${c.skipped} не подходят для Google Ads` : ''}`;
      }
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.checking = false;
    }
  }

  /** Для сортировки: точное число, иначе оценка. */
  sortValue(q: string): number | null {
    const v = this.byQuery[q];
    if (!v) return null;
    if (v.dfs !== undefined && v.dfs !== null) return v.dfs;
    return v.est?.value ?? null;
  }
}
