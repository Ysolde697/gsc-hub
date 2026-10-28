import { describe, it, expect } from 'vitest';
import { TableSort } from '../src/lib/table-sort.svelte';

type R = { name: string; n: number | null };
const rows: R[] = [{ name: 'б', n: 2 }, { name: 'а', n: null }, { name: 'в', n: 10 }];
const val = (r: R, k: 'name' | 'n') => r[k];

describe('TableSort', () => {
  it('текст по возрастанию, повторный клик — обратно', () => {
    const s = new TableSort<'name' | 'n'>();
    expect(s.apply(rows, val)).toBe(rows);
    s.toggle('name');
    expect(s.apply(rows, val).map((r) => r.name)).toEqual(['а', 'б', 'в']);
    s.toggle('name');
    expect(s.apply(rows, val).map((r) => r.name)).toEqual(['в', 'б', 'а']);
    expect(s.arrow('name')).toBe(' ↓');
  });

  it('числа из descFirst — сначала большие, пустые всегда внизу', () => {
    const s = new TableSort<'name' | 'n'>(null, 1, ['n']);
    s.toggle('n');
    expect(s.apply(rows, val).map((r) => r.n)).toEqual([10, 2, null]);
    s.toggle('n');
    expect(s.apply(rows, val).map((r) => r.n)).toEqual([2, 10, null]);
  });
});
