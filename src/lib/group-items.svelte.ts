// Колонка «В группу» в Striking Distance: ключи добавляются в группу,
// выбранную в шапке («Сайты: …»).

export interface GroupSummary {
  id: number;
  name: string;
  active: boolean;
  fixedAt: number | null;
  items: number;
  hosts: string[];
  done: string[];
}
export interface ItemRow {
  siteUrl: string;
  query: string;
  page: string;
  position?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
}

export const gi = $state({
  groups: [] as GroupSummary[],
  marks: {} as Record<string, { groupId: number; name: string }[]>,
  today: '',
  busy: new Set<string>(),
  error: null as string | null
});

export const itemKey = (page: string, query: string) => `${page}\n${query}`;
export const activeGroup = () => gi.groups.find((g) => g.active) ?? null;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
  return data;
}

export async function loadGroupItems(site?: string) {
  try {
    const res = await fetch('/groups/items' + (site ? `?site=${encodeURIComponent(site)}` : ''));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    gi.groups = data.groups;
    gi.marks = data.marks;
    gi.today = data.today;
    gi.error = null;
  } catch (e) {
    gi.error = `Группы не загрузились: ${(e as Error).message}`;
  }
}

/** Сменить группу в шапке: отчёты перестраиваются, поэтому страница перезагружается. */
export async function switchGroup(id: number | null) {
  try {
    await post('/groups/active', { id });
    location.reload();
  } catch (e) {
    gi.error = (e as Error).message;
  }
}

/** Группа на сегодня (28-10-26) с этим сайтом, сразу выбранная в шапке. */
export async function startToday(site?: string) {
  try {
    await post('/groups/items', { action: 'today', site });
    location.reload();
  } catch (e) {
    gi.error = (e as Error).message;
  }
}

export async function setDone(host: string, done: boolean) {
  const g = activeGroup();
  if (!g) return;
  try {
    const data = await post('/groups/items', { action: 'done', groupId: g.id, host, done });
    gi.groups = data.groups;
  } catch (e) {
    gi.error = (e as Error).message;
  }
}

export const inActive = (page: string, query: string) => {
  const g = activeGroup();
  return !!g && !!gi.marks[itemKey(page, query)]?.some((m) => m.groupId === g.id);
};

/** Другие группы с этой связкой, от старых к новым. */
export const otherGroups = (page: string, query: string) => {
  const g = activeGroup();
  return (gi.marks[itemKey(page, query)] ?? []).filter((m) => m.groupId !== g?.id);
};

export async function toggleItem(r: ItemRow) {
  const g = activeGroup();
  if (!g) {
    gi.error = 'Сначала выберите группу над таблицей';
    return;
  }
  const k = itemKey(r.page, r.query);
  if (gi.busy.has(k)) return;
  gi.busy = new Set(gi.busy).add(k);
  const had = inActive(r.page, r.query);
  try {
    const data = had
      ? await post('/groups/items', { action: 'remove', groupId: g.id, page: r.page, query: r.query })
      : await post('/groups/items', { action: 'add', groupId: g.id, item: r });
    const rest = (gi.marks[k] ?? []).filter((m) => m.groupId !== g.id);
    gi.marks = { ...gi.marks, [k]: had ? rest : [...rest, { groupId: g.id, name: g.name }] };
    gi.groups = data.groups;
    gi.error = null;
  } catch (e) {
    gi.error = (e as Error).message;
  } finally {
    const next = new Set(gi.busy);
    next.delete(k);
    gi.busy = next;
  }
}
