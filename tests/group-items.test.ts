import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { createSiteGroup, setSiteGroupHosts, setHostDone, listSiteGroups, deleteSiteGroup } from '../src/lib/server/site-groups';
import {
  todayGroupName,
  addGroupItem,
  removeGroupItem,
  listGroupItems,
  setGroupFixed,
  itemMarks,
  groupItemsCsv
} from '../src/lib/server/group-items';

const item = (q: string, page = 'https://a.com/p/', site = 'sc-domain:a.com') => ({
  siteUrl: site, query: q, page, position: 7.3, impressions: 23, clicks: 1, ctr: 0.043
});

describe('ключи группы (закупка)', () => {
  let dir: string;
  let db: Db;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-hub-'));
    db = openDb(join(dir, 't.db'));
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('название на сегодня — ДД-ММ-ГГ', () => {
    expect(todayGroupName(new Date(2026, 9, 28))).toBe('28-10-26');
    expect(todayGroupName(new Date(2027, 0, 5))).toBe('05-01-27');
  });

  it('добавление без повторов и удаление', () => {
    const g = createSiteGroup(db, '28-10-26');
    addGroupItem(db, g, item('wingaga promo kód'));
    addGroupItem(db, g, item('wingaga promo kód'));
    addGroupItem(db, g, item('wingaga bonus'));
    expect(listGroupItems(db, g)).toHaveLength(2);
    expect(listSiteGroups(db)[0].items).toBe(2);
    removeGroupItem(db, g, 'https://a.com/p/', 'wingaga bonus');
    expect(listGroupItems(db, g).map((i) => i.query)).toEqual(['wingaga promo kód']);
  });

  it('зафиксированную группу менять нельзя, после открытия — можно', () => {
    const g = createSiteGroup(db, 'A');
    addGroupItem(db, g, item('k1'));
    setGroupFixed(db, g, true);
    expect(listSiteGroups(db)[0].fixedAt).toBeTypeOf('number');
    expect(() => addGroupItem(db, g, item('k2'))).toThrow(/зафиксирована/);
    expect(() => removeGroupItem(db, g, 'https://a.com/p/', 'k1')).toThrow(/зафиксирована/);
    setGroupFixed(db, g, false);
    addGroupItem(db, g, item('k2'));
    expect(listGroupItems(db, g)).toHaveLength(2);
  });

  it('«Пройден» у сайта и сохранение отметки при смене состава', () => {
    const g = createSiteGroup(db, 'A');
    setSiteGroupHosts(db, g, ['a.com', 'b.com']);
    setHostDone(db, g, 'https://www.a.com/', true);
    expect(listSiteGroups(db)[0].done).toEqual(['a.com']);
    setSiteGroupHosts(db, g, ['a.com', 'c.com']);
    expect(listSiteGroups(db)[0]).toMatchObject({ hosts: ['a.com', 'c.com'], done: ['a.com'] });
    expect(() => setHostDone(db, g, 'zzz.com', true)).toThrow(/нет в группе/);
    setHostDone(db, g, 'a.com', false);
    expect(listSiteGroups(db)[0].done).toEqual([]);
  });

  it('пометки: все группы связки, от старых к новым, с фильтром по сайту', () => {
    const a = createSiteGroup(db, '01-10-26');
    const b = createSiteGroup(db, '28-10-26');
    addGroupItem(db, a, item('k1'));
    addGroupItem(db, b, item('k1'));
    addGroupItem(db, b, item('k9', 'https://b.com/', 'https://b.com/'));
    const marks = itemMarks(db, 'sc-domain:a.com');
    expect(Object.keys(marks)).toEqual(['https://a.com/p/\nk1']);
    expect(marks['https://a.com/p/\nk1'].map((m) => m.name)).toEqual(['01-10-26', '28-10-26']);
    expect(Object.keys(itemMarks(db))).toHaveLength(2);
  });

  it('удаление группы удаляет её ключи', () => {
    const g = createSiteGroup(db, 'A');
    addGroupItem(db, g, item('k1'));
    deleteSiteGroup(db, g);
    expect(itemMarks(db)).toEqual({});
  });

  it('CSV для Excel: BOM, «;», без исполнения формул', () => {
    const g = createSiteGroup(db, '28-10-26');
    addGroupItem(db, g, item('=HYPERLINK("x")'));
    const csv = groupItemsCsv('28-10-26', listGroupItems(db, g));
    expect(csv.startsWith('﻿')).toBe(true);
    const [head, row] = csv.slice(1).split('\r\n');
    expect(head).toBe('Группа;Сайт;Ключ;Страница;Позиция;Показы;Клики;CTR %');
    expect(row).toBe('28-10-26;sc-domain:a.com;"\'=HYPERLINK(""x"")";https://a.com/p/;7,3;23;1;4,3');
  });
});
