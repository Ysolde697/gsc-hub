// GSC возвращает country как ISO 3166-1 alpha-3 (lowercase): 'rus', 'usa', 'deu'.
// Google SERP принимает alpha-2 в параметре `gl`. Маппинг закрывает все ISO-страны.

const ALPHA3_TO_ALPHA2: Record<string, string> = {
  afg: 'AF', ala: 'AX', alb: 'AL', dza: 'DZ', asm: 'AS', and: 'AD', ago: 'AO', aia: 'AI', ata: 'AQ', atg: 'AG',
  arg: 'AR', arm: 'AM', abw: 'AW', aus: 'AU', aut: 'AT', aze: 'AZ', bhs: 'BS', bhr: 'BH', bgd: 'BD', brb: 'BB',
  blr: 'BY', bel: 'BE', blz: 'BZ', ben: 'BJ', bmu: 'BM', btn: 'BT', bol: 'BO', bes: 'BQ', bih: 'BA', bwa: 'BW',
  bvt: 'BV', bra: 'BR', iot: 'IO', brn: 'BN', bgr: 'BG', bfa: 'BF', bdi: 'BI', cpv: 'CV', khm: 'KH', cmr: 'CM',
  can: 'CA', cym: 'KY', caf: 'CF', tcd: 'TD', chl: 'CL', chn: 'CN', cxr: 'CX', cck: 'CC', col: 'CO', com: 'KM',
  cog: 'CG', cod: 'CD', cok: 'CK', cri: 'CR', civ: 'CI', hrv: 'HR', cub: 'CU', cuw: 'CW', cyp: 'CY', cze: 'CZ',
  dnk: 'DK', dji: 'DJ', dma: 'DM', dom: 'DO', ecu: 'EC', egy: 'EG', slv: 'SV', gnq: 'GQ', eri: 'ER', est: 'EE',
  swz: 'SZ', eth: 'ET', flk: 'FK', fro: 'FO', fji: 'FJ', fin: 'FI', fra: 'FR', guf: 'GF', pyf: 'PF', atf: 'TF',
  gab: 'GA', gmb: 'GM', geo: 'GE', deu: 'DE', gha: 'GH', gib: 'GI', grc: 'GR', grl: 'GL', grd: 'GD', glp: 'GP',
  gum: 'GU', gtm: 'GT', ggy: 'GG', gin: 'GN', gnb: 'GW', guy: 'GY', hti: 'HT', hmd: 'HM', vat: 'VA', hnd: 'HN',
  hkg: 'HK', hun: 'HU', isl: 'IS', ind: 'IN', idn: 'ID', irn: 'IR', irq: 'IQ', irl: 'IE', imn: 'IM', isr: 'IL',
  ita: 'IT', jam: 'JM', jpn: 'JP', jey: 'JE', jor: 'JO', kaz: 'KZ', ken: 'KE', kir: 'KI', prk: 'KP', kor: 'KR',
  kwt: 'KW', kgz: 'KG', lao: 'LA', lva: 'LV', lbn: 'LB', lso: 'LS', lbr: 'LR', lby: 'LY', lie: 'LI', ltu: 'LT',
  lux: 'LU', mac: 'MO', mdg: 'MG', mwi: 'MW', mys: 'MY', mdv: 'MV', mli: 'ML', mlt: 'MT', mhl: 'MH', mtq: 'MQ',
  mrt: 'MR', mus: 'MU', myt: 'YT', mex: 'MX', fsm: 'FM', mda: 'MD', mco: 'MC', mng: 'MN', mne: 'ME', msr: 'MS',
  mar: 'MA', moz: 'MZ', mmr: 'MM', nam: 'NA', nru: 'NR', npl: 'NP', nld: 'NL', ncl: 'NC', nzl: 'NZ', nic: 'NI',
  ner: 'NE', nga: 'NG', niu: 'NU', nfk: 'NF', mkd: 'MK', mnp: 'MP', nor: 'NO', omn: 'OM', pak: 'PK', plw: 'PW',
  pse: 'PS', pan: 'PA', png: 'PG', pry: 'PY', per: 'PE', phl: 'PH', pcn: 'PN', pol: 'PL', prt: 'PT', pri: 'PR',
  qat: 'QA', reu: 'RE', rou: 'RO', rus: 'RU', rwa: 'RW', blm: 'BL', shn: 'SH', kna: 'KN', lca: 'LC', maf: 'MF',
  spm: 'PM', vct: 'VC', wsm: 'WS', smr: 'SM', stp: 'ST', sau: 'SA', sen: 'SN', srb: 'RS', syc: 'SC', sle: 'SL',
  sgp: 'SG', sxm: 'SX', svk: 'SK', svn: 'SI', slb: 'SB', som: 'SO', zaf: 'ZA', sgs: 'GS', ssd: 'SS', esp: 'ES',
  lka: 'LK', sdn: 'SD', sur: 'SR', sjm: 'SJ', swe: 'SE', che: 'CH', syr: 'SY', twn: 'TW', tjk: 'TJ', tza: 'TZ',
  tha: 'TH', tls: 'TL', tgo: 'TG', tkl: 'TK', ton: 'TO', tto: 'TT', tun: 'TN', tur: 'TR', tkm: 'TM', tca: 'TC',
  tuv: 'TV', uga: 'UG', ukr: 'UA', are: 'AE', gbr: 'GB', usa: 'US', umi: 'UM', ury: 'UY', uzb: 'UZ', vut: 'VU',
  ven: 'VE', vnm: 'VN', vgb: 'VG', vir: 'VI', wlf: 'WF', esh: 'EH', yem: 'YE', zmb: 'ZM', zwe: 'ZW'
};

// Дефолтный SERP-язык по стране. Покрываем основные; остальные — 'en'.
const ALPHA2_TO_HL: Record<string, string> = {
  RU: 'ru', UA: 'uk', BY: 'be', KZ: 'kk', UZ: 'uz', KG: 'ky', TJ: 'tg', TM: 'tk', AZ: 'az', AM: 'hy', GE: 'ka', MD: 'ro',
  DE: 'de', AT: 'de', CH: 'de', LI: 'de',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
  IT: 'it', SM: 'it', VA: 'it',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', UY: 'es', PY: 'es', BO: 'es', EC: 'es', CR: 'es', CU: 'es', DO: 'es', GT: 'es', HN: 'es', NI: 'es', PA: 'es', SV: 'es', PR: 'es',
  PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt',
  NL: 'nl', PL: 'pl', CZ: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', BG: 'bg', GR: 'el', HR: 'hr', RS: 'sr', SI: 'sl', MK: 'mk', AL: 'sq', BA: 'bs',
  SE: 'sv', NO: 'no', DK: 'da', FI: 'fi', IS: 'is', EE: 'et', LV: 'lv', LT: 'lt',
  TR: 'tr', IL: 'he', IR: 'fa', SA: 'ar', AE: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', LY: 'ar', JO: 'ar', LB: 'ar', SY: 'ar', IQ: 'ar', YE: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', SD: 'ar',
  JP: 'ja', KR: 'ko', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK', TH: 'th', VN: 'vi', ID: 'id', MY: 'ms', PH: 'fil',
  IN: 'en', PK: 'en', BD: 'bn', LK: 'si', NP: 'ne'
};

// Обратная карта строится из прямой, а не пишется руками: две независимые
// таблицы на 249 стран разъезжаются на первой же правке.
const ALPHA2_TO_ALPHA3: Record<string, string> = Object.fromEntries(
  Object.entries(ALPHA3_TO_ALPHA2).map(([a3, a2]) => [a2, a3])
);

/** 'esp' -> 'ES'. Неизвестный код -> null, без догадок. */
export function alpha3ToAlpha2(code: string): string | null {
  return ALPHA3_TO_ALPHA2[(code ?? '').toLowerCase()] ?? null;
}

/** 'es' -> 'esp'. Search Analytics фильтрует страну именно alpha-3. */
export function alpha2ToAlpha3(code: string): string | null {
  return ALPHA2_TO_ALPHA3[(code ?? '').toUpperCase()] ?? null;
}

export function googleSerpUrl(query: string, alpha3: string): string | null {
  if (!query) return null;
  const code = alpha3.toLowerCase();
  const gl = ALPHA3_TO_ALPHA2[code];
  if (!gl) return null; // unknown / 'zzz' / empty — no link
  const hl = ALPHA2_TO_HL[gl] ?? 'en';
  const params = new URLSearchParams({ q: query, gl, hl });
  return `https://www.google.com/search?${params.toString()}`;
}

// ISO 3166-1 numeric — из официальной таблицы iso-codes. Google Ads (и DataForSEO)
// кодирует страну как 2000 + этот номер: Аргентина 2032, Турция 2792.
const ALPHA3_TO_NUMERIC: Record<string, number> = {
  abw: 533, afg: 4, ago: 24, aia: 660, ala: 248, alb: 8, and: 20, are: 784, arg: 32, arm: 51, asm: 16, ata: 10,
  atf: 260, atg: 28, aus: 36, aut: 40, aze: 31, bdi: 108, bel: 56, ben: 204, bes: 535, bfa: 854, bgd: 50, bgr: 100,
  bhr: 48, bhs: 44, bih: 70, blm: 652, blr: 112, blz: 84, bmu: 60, bol: 68, bra: 76, brb: 52, brn: 96, btn: 64,
  bvt: 74, bwa: 72, caf: 140, can: 124, cck: 166, che: 756, chl: 152, chn: 156, civ: 384, cmr: 120, cod: 180, cog: 178,
  cok: 184, col: 170, com: 174, cpv: 132, cri: 188, cub: 192, cuw: 531, cxr: 162, cym: 136, cyp: 196, cze: 203, deu: 276,
  dji: 262, dma: 212, dnk: 208, dom: 214, dza: 12, ecu: 218, egy: 818, eri: 232, esh: 732, esp: 724, est: 233, eth: 231,
  fin: 246, fji: 242, flk: 238, fra: 250, fro: 234, fsm: 583, gab: 266, gbr: 826, geo: 268, ggy: 831, gha: 288, gib: 292,
  gin: 324, glp: 312, gmb: 270, gnb: 624, gnq: 226, grc: 300, grd: 308, grl: 304, gtm: 320, guf: 254, gum: 316, guy: 328,
  hkg: 344, hmd: 334, hnd: 340, hrv: 191, hti: 332, hun: 348, idn: 360, imn: 833, ind: 356, iot: 86, irl: 372, irn: 364,
  irq: 368, isl: 352, isr: 376, ita: 380, jam: 388, jey: 832, jor: 400, jpn: 392, kaz: 398, ken: 404, kgz: 417, khm: 116,
  kir: 296, kna: 659, kor: 410, kwt: 414, lao: 418, lbn: 422, lbr: 430, lby: 434, lca: 662, lie: 438, lka: 144, lso: 426,
  ltu: 440, lux: 442, lva: 428, mac: 446, maf: 663, mar: 504, mco: 492, mda: 498, mdg: 450, mdv: 462, mex: 484, mhl: 584,
  mkd: 807, mli: 466, mlt: 470, mmr: 104, mne: 499, mng: 496, mnp: 580, moz: 508, mrt: 478, msr: 500, mtq: 474, mus: 480,
  mwi: 454, mys: 458, myt: 175, nam: 516, ncl: 540, ner: 562, nfk: 574, nga: 566, nic: 558, niu: 570, nld: 528, nor: 578,
  npl: 524, nru: 520, nzl: 554, omn: 512, pak: 586, pan: 591, pcn: 612, per: 604, phl: 608, plw: 585, png: 598, pol: 616,
  pri: 630, prk: 408, prt: 620, pry: 600, pse: 275, pyf: 258, qat: 634, reu: 638, rou: 642, rus: 643, rwa: 646, sau: 682,
  sdn: 729, sen: 686, sgp: 702, sgs: 239, shn: 654, sjm: 744, slb: 90, sle: 694, slv: 222, smr: 674, som: 706, spm: 666,
  srb: 688, ssd: 728, stp: 678, sur: 740, svk: 703, svn: 705, swe: 752, swz: 748, sxm: 534, syc: 690, syr: 760, tca: 796,
  tcd: 148, tgo: 768, tha: 764, tjk: 762, tkl: 772, tkm: 795, tls: 626, ton: 776, tto: 780, tun: 788, tur: 792, tuv: 798,
  twn: 158, tza: 834, uga: 800, ukr: 804, umi: 581, ury: 858, usa: 840, uzb: 860, vat: 336, vct: 670, ven: 862, vgb: 92,
  vir: 850, vnm: 704, vut: 548, wlf: 876, wsm: 882, yem: 887, zaf: 710, zmb: 894, zwe: 716
};

/** 'arg' -> 2032 (location_code Google Ads / DataForSEO). Неизвестный код -> null. */
export function googleAdsLocationCode(alpha3: string): number | null {
  const n = ALPHA3_TO_NUMERIC[alpha3.toLowerCase()];
  return n ? 2000 + n : null;
}
