// Сортировка таблиц по клику на заголовок: первый клик — сортировать
// (числа — от больших к меньшим, текст и позиция — по возрастанию),
// повторный — обратный порядок. Пустые значения всегда внизу.

export type SortValue = string | number | null | undefined;

export class TableSort<K extends string> {
  key = $state<K | null>(null);
  dir = $state<1 | -1>(1);
  #descFirst: Set<K>;

  constructor(initial: K | null = null, initialDir: 1 | -1 = 1, descFirst: K[] = []) {
    this.key = initial;
    this.dir = initialDir;
    this.#descFirst = new Set(descFirst);
  }

  toggle(k: K) {
    if (this.key === k) this.dir = this.dir === 1 ? -1 : 1;
    else {
      this.key = k;
      this.dir = this.#descFirst.has(k) ? -1 : 1;
    }
  }

  arrow(k: K): string {
    return this.key === k ? (this.dir === 1 ? ' ↑' : ' ↓') : '';
  }

  apply<T>(rows: T[], value: (row: T, k: K) => SortValue): T[] {
    const k = this.key;
    if (!k) return rows;
    const dir = this.dir;
    return [...rows].sort((a, b) => {
      const x = value(a, k), y = value(b, k);
      const xe = x === null || x === undefined || x === '', ye = y === null || y === undefined || y === '';
      if (xe && ye) return 0;
      if (xe) return 1;
      if (ye) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ru');
      return c * dir;
    });
  }
}
