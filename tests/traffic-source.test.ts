import { describe, it, expect } from 'vitest';
import { storedSource, sourceOf } from '../src/lib/utils/traffic-source';

describe('traffic source', () => {
  it('хранит домен без www, прямой заход, переход внутри сайта и метку', () => {
    expect(storedSource('www.google.de')).toBe('google.de');
    expect(storedSource('')).toBe('(direct)');
    expect(storedSource('=')).toBe('(internal)');
    expect(storedSource('utm:Newsletter Oct')).toBe('utm:newsletteroct');
    expect(storedSource('?')).toBe('(other)');
  });

  it('узнаёт поисковики, ИИ, соцсети и прочие сайты', () => {
    expect(sourceOf('google.de')).toMatchObject({ key: 'Google', group: 'search' });
    expect(sourceOf('google.co.uk')).toMatchObject({ key: 'Google', group: 'search' });
    expect(sourceOf('com.google.android.googlequicksearchbox')).toMatchObject({ key: 'Google' });
    expect(sourceOf('gemini.google.com')).toMatchObject({ key: 'Gemini', group: 'ai' });
    expect(sourceOf('bing.com')).toMatchObject({ key: 'Bing', group: 'search' });
    expect(sourceOf('yandex.ru')).toMatchObject({ key: 'Яндекс', group: 'search' });
    expect(sourceOf('chatgpt.com')).toMatchObject({ key: 'ChatGPT', group: 'ai' });
    expect(sourceOf('l.facebook.com')).toMatchObject({ key: 'Facebook', group: 'social' });
    expect(sourceOf('t.co')).toMatchObject({ key: 'X (Twitter)', group: 'social' });
    expect(sourceOf('forum.example.org')).toMatchObject({ key: 'forum.example.org', group: 'site' });
    expect(sourceOf('(direct)')).toMatchObject({ group: 'direct' });
    expect(sourceOf('utm:newsletter')).toMatchObject({ group: 'tag', label: 'Метка newsletter' });
  });

  it('переход внутри сайта и старый код — не входы', () => {
    expect(sourceOf('(internal)')).toBeNull();
    expect(sourceOf('')).toBeNull();
  });
});
