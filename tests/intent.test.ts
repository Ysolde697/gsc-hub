import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/lib/utils/intent';

const P = 'https://apuestasdeportivas247.co/review/yajuego/';
const B = 'https://apuestasdeportivas247.co/review/betplay/';

describe('classifyIntent', () => {
  it('конверсионные — зелёные', () => {
    expect(classifyIntent('codigo promocional yajuego', P)).toBe('conv');
    expect(classifyIntent('código promocional yajuego', P)).toBe('conv');
    expect(classifyIntent('yajuego movil', P)).toBe('conv');
    expect(classifyIntent('betplay casino en vivo', B)).toBe('conv');
    expect(classifyIntent('wingaga promo kód')).toBe('conv');
    expect(classifyIntent('wingaga bonus bez vkladu')).toBe('conv');
    expect(classifyIntent('wingaga otočení zdarma')).toBe('conv');
    expect(classifyIntent('1xbet скачать')).toBe('conv');
  });

  it('бренд и коммерция — жёлтые', () => {
    expect(classifyIntent('yajuego casino', P)).toBe('brand');
    expect(classifyIntent('yajuego colombia', P)).toBe('brand');
    expect(classifyIntent('yajuego', P)).toBe('brand');
    expect(classifyIntent('ya juego', P)).toBe('brand');
    expect(classifyIntent('juego aviator', 'https://x.co/aviator/')).toBe('brand');
    expect(classifyIntent('wingaga česká', 'https://wingagacasino.cz/', ['wingaga'])).toBe('brand');
  });

  it('вход и инфо — пусто, даже с брендом или бонусом', () => {
    expect(classifyIntent('betplay inicio casino iniciar sesión', B)).toBeNull();
    expect(classifyIntent('yajuego opiniones', P)).toBeNull();
    expect(classifyIntent('qué es un bono sin depósito')).toBeNull();
    expect(classifyIntent('yajuego es seguro', P)).toBeNull();
  });

  it('прочее — пусто', () => {
    expect(classifyIntent('clima bogota hoy')).toBeNull();
    expect(classifyIntent('')).toBeNull();
    // Короткие слова из адреса брендом не считаются.
    expect(classifyIntent('hola amigo', 'https://x.co/es/ab/')).toBeNull();
  });
});
