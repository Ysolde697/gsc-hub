import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/lib/utils/intent';

// Правило: зелёный — только ключи, которые ведут к конверсии; бренд в ключе сам
// по себе ничего не значит.
const P = 'https://apuestasdeportivas247.co/review/yajuego/';
const B = 'https://apuestasdeportivas247.co/review/betplay/';
const CI = 'https://1xbet-mobile.ci/';
const CICODE = 'https://1xbet-mobile.ci/fr/code-promo-1xbet/';

describe('classifyIntent: зелёный — ведёт к конверсии', () => {
  it('действие к деньгам', () => {
    expect(classifyIntent('codigo promocional yajuego', P)).toBe('conv');
    expect(classifyIntent('wingaga promo kód')).toBe('conv');
    expect(classifyIntent('wingaga bonus bez vkladu')).toBe('conv');
    expect(classifyIntent('wingaga otočení zdarma')).toBe('conv');
    expect(classifyIntent('1xbet скачать')).toBe('conv');
    expect(classifyIntent('1xbet apk', CI)).toBe('conv');
    expect(classifyIntent('jouer 1xbet en ligne', CI)).toBe('conv');
    expect(classifyIntent('paris en ligne 1xbet', CI)).toBe('conv');
    expect(classifyIntent('code promo 1xbet côte d’ivoire', CICODE)).toBe('conv');
    expect(classifyIntent('inscription 1xbet', CI)).toBe('conv');
    expect(classifyIntent('télécharger 1xbet', CI)).toBe('conv');
  });

  it('чистый бренд + страна', () => {
    expect(classifyIntent('1xbet ci', CI)).toBe('conv');
    expect(classifyIntent("1xbet cote d'ivoire", CI)).toBe('conv');
    expect(classifyIntent("1xbet côte d'ivoire", CI)).toBe('conv');
    expect(classifyIntent("1xbet en côte d'ivoire", CI)).toBe('conv');
    expect(classifyIntent('mostbet uz')).toBe('conv');
    expect(classifyIntent('1xbet узбекистан')).toBe('conv');
    expect(classifyIntent('yajuego colombia', P)).toBe('conv');
    expect(classifyIntent('wingaga česká', 'https://wingagacasino.cz/', ['wingaga'])).toBe('conv');
  });
});

describe('classifyIntent: жёлтый — коммерческий без действия', () => {
  it('чистый бренд и бренд + слово продукта', () => {
    expect(classifyIntent('1xbet', CI)).toBe('brand');
    expect(classifyIntent('yajuego', P)).toBe('brand');
    expect(classifyIntent('ya juego', P)).toBe('brand');
    expect(classifyIntent('yajuego casino', P)).toBe('brand');
    expect(classifyIntent('yajuego movil', P)).toBe('brand');
    expect(classifyIntent('1xbet mobile', CI)).toBe('brand');
    expect(classifyIntent('betplay casino en vivo', B)).toBe('brand');
    expect(classifyIntent('cricket road', 'https://cricket-road.app/')).toBe('brand');
    expect(classifyIntent('cricketroad', 'https://cricket-road.app/')).toBe('brand');
    expect(classifyIntent('mostbet')).toBe('brand');
  });

  it('коммерция без бренда', () => {
    expect(classifyIntent('casino en ligne')).toBe('brand');
    expect(classifyIntent('meilleur bookmaker côte d’ivoire')).toBe('brand');
  });
});

describe('classifyIntent: пусто — инфо и действующие игроки', () => {
  it('примеры со скриншота', () => {
    expect(classifyIntent("coupon 1xbet gratuit aujourd'hui", CICODE)).toBeNull();
    expect(classifyIntent('coupon 1xbet gratuit whatsapp', CICODE)).toBeNull();
    expect(classifyIntent('coupon de demain 1xbet', CICODE)).toBeNull();
    expect(classifyIntent('coupons 1xbet', CICODE)).toBeNull();
    expect(classifyIntent('coupons gratuit 1xbet', CICODE)).toBeNull();
    expect(classifyIntent("se connecter à mon compte 1xbet côte d'ivoire", CI)).toBeNull();
    expect(classifyIntent('vérifier coupon 1xbet 2026', CICODE)).toBeNull();
  });

  it('вход, отзывы, инфо, вывод', () => {
    expect(classifyIntent('betplay inicio casino iniciar sesión', B)).toBeNull();
    expect(classifyIntent('yajuego opiniones', P)).toBeNull();
    expect(classifyIntent('qué es un bono sin depósito')).toBeNull();
    expect(classifyIntent('yajuego es seguro', P)).toBeNull();
    expect(classifyIntent('1xbet retrait orange money', CI)).toBeNull();
    expect(classifyIntent('1xbet ci login', CI)).toBeNull();
  });

  it('бренд + непонятные слова — пусто; прочее — пусто', () => {
    expect(classifyIntent('1xbet orange money', CI)).toBeNull();
    expect(classifyIntent('clima colombia')).toBeNull();
    expect(classifyIntent('clima bogota hoy')).toBeNull();
    expect(classifyIntent('')).toBeNull();
    expect(classifyIntent('hola amigo', 'https://x.co/es/ab/')).toBeNull();
  });
});
