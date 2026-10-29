import { describe, it, expect } from 'vitest';
import { siteCountries, sameGeo } from '../src/lib/utils/site-geo';

describe('siteCountries', () => {
  it('главная страна и страны от 20% показов', () => {
    expect(siteCountries([{ country: 'TUR', impressions: 900 }, { country: 'deu', impressions: 60 }, { country: 'aze', impressions: 40 }])).toEqual(['tur']);
    expect(siteCountries([{ country: 'ind', impressions: 50 }, { country: 'bgd', impressions: 30 }, { country: 'pak', impressions: 20 }])).toEqual(['ind', 'bgd', 'pak']);
    expect(siteCountries([])).toEqual([]);
  });
});

describe('sameGeo', () => {
  it('со скриншота: Турция против Чили и Азербайджана — не конкуренты', () => {
    expect(sameGeo(['tur'], ['chl'])).toBe(false);
    expect(sameGeo(['tur'], ['aze'])).toBe(false);
    expect(sameGeo(['tur'], ['aze', 'tur'])).toBe(true);
  });
  it('ГЕО неизвестно — оставляем', () => {
    expect(sameGeo(['tur'], [])).toBe(true);
    expect(sameGeo(undefined, ['chl'])).toBe(true);
  });
});
