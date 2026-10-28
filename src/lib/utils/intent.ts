// Тип ключа для колонки «Тип», по словарю, без внешних сервисов.
//
// ПРАВИЛО (от владельца панели, держать его):
//   Отбираем ключи, которые ВЕДУТ К КОНВЕРСИИ — к регистрации, депозиту, игре, заработку.
//   Наличие бренда в ключе само по себе ничего не значит: «coupon de demain 1xbet»
//   (прогнозы), «vérifier coupon 1xbet» (проверка ставки), «se connecter à mon compte
//   1xbet» (вход) — не коммерция.
//
//   conv  — зелёный: явное действие к деньгам (регистрация, бонус/промокод, скачать,
//           играть/ставить, депозит) или чистый «бренд + страна» («1xbet ci»).
//   brand — жёлтый: коммерческий без явного действия — чистый бренд («1xbet») или
//           бренд + слово продукта («1xbet casino», «1xbet mobile»), «casino en ligne».
//   null  — пусто: вход, проверка, прогнозы/купоны-подсказки, мессенджеры, «как…»,
//           отзывы, вывод денег, и бренд с любыми другими словами без коммерции.
// Языки ниши: испанский, португальский, французский, английский, чешский, русский.

export type Intent = 'conv' | 'brand' | null;

/** Нижний регистр без диакритики и знаков: «código» = «codigo», «d'ivoire» = «d ivoire». */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const list = (words: string[]) => words.map(foldText);

// Инфо и действующие игроки: всегда пусто, даже с брендом, бонусом и страной.
const EMPTY = list([
  // вход и аккаунт
  'iniciar sesion', 'inicio de sesion', 'login', 'log in', 'sign in', 'entrar', 'acceso', 'acessar', 'prihlaseni', 'prihlasit',
  'se connecter', 'connexion', 'mon compte', 'mi cuenta', 'minha conta', 'my account', 'вход', 'войти', 'личный кабинет',
  'mot de passe', 'password', 'contrasena', 'senha', 'пароль',
  // проверка, история, вывод — уже игроки
  'verifier', 'verification', 'verificar', 'check', 'проверить', 'проверка',
  'retrait', 'retirer', 'retiro', 'retirar', 'withdraw', 'withdrawal', 'saque', 'sacar', 'вывод', 'вывести',
  // прогнозы, подсказки, «купоны на завтра», мессенджеры
  'coupon', 'coupons', 'coupon de demain', 'pronostic', 'pronostics', 'prono', 'prediction', 'predictions', 'pronostico',
  'pronosticos', 'tips', 'tipster', 'prognoz', 'прогноз', 'прогнозы', 'whatsapp', 'telegram', 'groupe', 'grupo', 'group', 'canal',
  // информационные
  'que es', 'what is', 'qu est ce', 'c est quoi', 'como funciona', 'comment', 'how to', 'como', 'jak', 'что такое', 'как',
  'opiniones', 'opinion', 'avis', 'resena', 'resenas', 'review', 'reviews', 'recenze', 'avaliacao', 'отзывы', 'обзор',
  'es seguro', 'e seguro', 'fiable', 'confiavel', 'es confiable', 'is it safe', 'legal', 'es legal', 'licencia', 'licence',
  'scam', 'arnaque', 'estafa', 'fraude', 'podvod', 'requisitos', 'telefono', 'numero', 'contact', 'contacto', 'service client',
  'atencion al cliente', 'soporte', 'support', 'kontakt', 'resultat', 'resultats', 'resultado', 'resultados', 'score', 'match'
]);

// Явное действие к деньгам — зелёный.
const CONV = list([
  'bono', 'bonos', 'bonus', 'bonusy', 'bonusovy', 'bonusove', 'bonus code', 'bonus de bienvenue', 'bônus', 'бонус', 'бонусы',
  'promo', 'promocion', 'promociones', 'promocional', 'promocao', 'promotion', 'promo code', 'code promo', 'промокод',
  'codigo promocional', 'codigo', 'kod', 'promo kod', 'cupom', 'cupon', 'voucher', 'free bet', 'freebet', 'pari gratuit',
  'free spins', 'freespins', 'giros gratis', 'tiradas gratis', 'rodadas gratis', 'tours gratuits', 'otoceni', 'zatoceni', 'фриспины',
  'bez vkladu', 'no deposit', 'sin deposito', 'sem deposito', 'sans depot', 'бездепозитный',
  'registro', 'registrarse', 'registrate', 'register', 'registration', 'registrace', 'cadastro', 'sign up', 'inscription',
  's inscrire', 'inscrire', 'creer un compte', 'crear cuenta', 'ouvrir un compte', 'регистрация', 'зарегистрироваться',
  'descargar', 'descarga', 'download', 'baixar', 'stahnout', 'telecharger', 'telechargement', 'apk', 'скачать',
  'deposito', 'deposit', 'depot', 'vklad', 'recharger', 'депозит', 'пополнить',
  'jugar', 'jogar', 'play', 'hrat', 'jouer', 'apostar', 'parier', 'paris en ligne', 'paris sportif', 'paris sportifs',
  'pari en ligne', 'apuestas en linea', 'apostas online', 'bet now', 'играть', 'сделать ставку', 'ставки онлайн'
]);

// Слова продукта/коммерции без явного действия — жёлтый.
const COMMERCIAL = list([
  'casino', 'casinos', 'cassino', 'kasino', 'kasina', 'online casino', 'casino en ligne', 'casino en linea', 'казино',
  'apuestas', 'apuesta', 'apostas', 'aposta', 'paris', 'pari', 'bet', 'bets', 'betting', 'sazky', 'sazkova', 'ставки', 'букмекер',
  'bookmaker', 'bookmakers', 'casa de apuestas', 'casa de apostas', 'site de paris', 'sportsbook',
  'slots', 'slot', 'tragamonedas', 'tragaperras', 'machines a sous', 'caca niqueis', 'automaty', 'слоты',
  'ruleta', 'roleta', 'roulette', 'blackjack', 'poker', 'aviator', 'crash', 'plinko', 'bingo', 'loteria',
  'app', 'apps', 'application', 'aplicacion', 'aplicativo', 'aplikace', 'приложение', 'mobile', 'movil', 'mobil', 'celular',
  'en ligne', 'en linea', 'online', 'live', 'en vivo', 'ao vivo', 'officiel', 'oficial', 'official', 'site', 'sitio', 'site officiel',
  'meilleur', 'mejor', 'melhor', 'best', 'top', 'лучший'
]);

// Известные бренды ниши.
const KNOWN_BRANDS = list([
  '1xbet', '1x bet', 'melbet', 'mostbet', '1win', 'betwinner', 'pin up', 'pinup', 'parimatch', 'betway', 'bet365',
  '22bet', 'linebet', 'megapari', 'paripesa', 'betano', 'betplay', 'yajuego', 'aquijuego', 'codere', 'rushbet', 'wplay',
  'stake', 'roobet', 'bc game', 'bcgame', 'vavada', 'joycasino', 'fonbet', 'winline', 'betboom', 'olimpbet',
  'wingaga', 'jetx', 'spribe', 'sweet bonanza', 'gates of olympus', 'chicken road', 'cricket road', 'lucky jet',
  'dafabet', 'fun88', 'betfair', 'sportybet', 'betika', 'premierbet', 'bangbet', 'premier bet'
]);

// Части домена, которые не бренд: 1xbet-mobile.ci → «1xbet».
const DOMAIN_GENERIC = new Set(list([
  'app', 'apps', 'apk', 'mobile', 'mobi', 'casino', 'casinos', 'online', 'game', 'games', 'official', 'site', 'web',
  'login', 'download', 'bonus', 'promo', 'code', 'review', 'reviews', 'bet', 'bets', 'betting', 'sport', 'sports',
  'play', 'win', 'get', 'best', 'top', 'new', 'pro', 'hub', 'info', 'zone', 'club', 'world', 'live', 'apuestas',
  'deportivas', 'aposta', 'apostas', 'kasino', 'cassino', 'uz', 'ci', 'pk', 'bd', 'in', 'br', 'co', 'cl', 'mx', 'ar', 'pe'
]));

// Страны: «бренд + страна» — зелёный.
const GEO = list([
  "cote d'ivoire", 'cote divoire', 'ivory coast', 'civ', 'abidjan',
  'colombia', 'chile', 'mexico', 'argentina', 'peru', 'ecuador', 'bolivia', 'paraguay', 'uruguay', 'venezuela',
  'brasil', 'brazil', 'portugal', 'espana', 'spain',
  'uzbekistan', 'ozbekiston', 'o zbekiston', 'uzb', 'узбекистан', 'tashkent', 'ташкент',
  'kazakhstan', 'казахстан', 'kyrgyzstan', 'кыргызстан', 'tajikistan', 'azerbaijan', 'azerbaycan', 'азербайджан',
  'russia', 'россия', 'рф', 'ukraine', 'украина', 'украiна', 'belarus', 'беларусь', 'georgia', 'armenia',
  'pakistan', 'bangladesh', 'india', 'nepal', 'sri lanka', 'myanmar',
  'nigeria', 'kenya', 'ghana', 'senegal', 'cameroun', 'cameroon', 'benin', 'togo', 'burkina faso', 'mali', 'guinee', 'guinea',
  'congo', 'rdc', 'gabon', 'maroc', 'morocco', 'tunisie', 'tunisia', 'algerie', 'algeria', 'egypt', 'egypte',
  'tanzania', 'uganda', 'zambia', 'zimbabwe', 'malawi', 'mozambique', 'south africa', 'ethiopia', 'somalia',
  'turkey', 'turkiye', 'philippines', 'indonesia', 'malaysia', 'vietnam', 'thailand', 'cambodia',
  'cesko', 'ceska', 'ceske', 'czech', 'slovensko', 'slovakia', 'polska', 'poland', 'romania', 'moldova',
  'canada', 'usa', 'uk', 'australia', 'deutschland', 'germany', 'france', 'italia', 'italy'
]);
// Короткие коды стран — только отдельным словом.
const GEO_CODES = new Set(['ci', 'uz', 'pk', 'bd', 'br', 'co', 'cl', 'mx', 'ar', 'pe', 'ec', 'ng', 'ke', 'gh', 'sn', 'cm', 'tz', 'ug', 'za', 'kz', 'kg', 'az', 'tr', 'ph', 'np', 'cz', 'sk', 'pl', 'ru', 'ua', 'by', 'ma', 'eg', 'bj', 'tg', 'bf', 'ml', 'cd', 'cg', 'ga', 'zm', 'mw', 'et']);

// Служебные слова, которые не меняют смысл: «1xbet en côte d'ivoire», «de», «la».
const FILLER = new Set(list(['de', 'du', 'des', 'la', 'le', 'les', 'el', 'los', 'en', 'a', 'au', 'do', 'da', 'na', 'no', 'the', 'of', 'in', 'for', 'para', 'pour', 'v', 'na', 'в', 'на', 'и', 'y', 'et', 'e', '2024', '2025', '2026', '2027']));

function hasPhrase(q: string, words: string[]): boolean {
  const padded = ` ${q} `;
  return words.some((w) => w && padded.includes(` ${w} `));
}

/** Убрать из ключа найденные фразы — что осталось, то и «другие слова». */
function stripPhrases(q: string, words: string[]): string {
  let out = ` ${q} `;
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    if (w) out = out.split(` ${w} `).join(' ');
  }
  return out.trim().replace(/\s+/g, ' ');
}

/** Слова-бренды из адреса страницы: /review/yajuego/ → yajuego. */
function slugWords(page: string): string[] {
  let path = '';
  try {
    path = new URL(page).pathname;
  } catch {
    return [];
  }
  const skip = new Set(list(['review', 'reviews', 'resena', 'casino', 'bonus', 'bono', 'app', 'apk', 'promo', 'code', 'codigo', 'es', 'en', 'fr', 'pt', 'cz', 'html', 'php', 'blog', 'page', 'download', 'telecharger', 'coupon', 'connexion', 'inscription']));
  return foldText(path.replace(/[-_/.]+/g, ' '))
    .split(' ')
    .filter((w) => w.length >= 4 && !skip.has(w) && !/^\d+$/.test(w));
}

/** Бренд из домена страницы: cricket-road.app → «cricket road», 1xbet-mobile.ci → «1xbet». */
function domainBrands(page: string): string[] {
  let host = '';
  try {
    host = new URL(page).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return [];
  }
  const label = host.split('.').slice(0, -1).join('.') || host;
  const parts = label.split(/[-_.]+/).map(foldText).filter((w) => w && !DOMAIN_GENERIC.has(w) && !/^\d+$/.test(w));
  if (!parts.length) return [];
  const phrase = parts.join(' ');
  return phrase.replace(/ /g, '').length >= 3 ? [phrase] : [];
}

function siteCcTld(page: string): string | null {
  try {
    const tld = new URL(page).hostname.split('.').pop() ?? '';
    return tld.length === 2 ? tld : null;
  } catch {
    return null;
  }
}

export function classifyIntent(query: string, page = '', brandTerms: string[] = []): Intent {
  const q = foldText(query);
  if (!q) return null;
  // 1. Инфо и действующие игроки — пусто, что бы ещё ни было в ключе.
  if (hasPhrase(q, EMPTY)) return null;
  // 2. Явное действие к деньгам — зелёный.
  if (hasPhrase(q, CONV)) return 'conv';

  // 3. Бренд: известный, из домена, из адреса страницы, из Brand terms сайта.
  const extra = [...slugWords(page), ...domainBrands(page), ...brandTerms.map(foldText).filter((t) => t.length >= 3)];
  const brandWords = [...KNOWN_BRANDS, ...extra];
  let rest = stripPhrases(q, brandWords);
  // Склеенное написание бренда: «ya juego» → «yajuego», «cricketroad» → «cricket road».
  const glued = q.replace(/ /g, '');
  const gluedBrand = brandWords.some((b) => b.replace(/ /g, '').length >= 4 && glued.includes(b.replace(/ /g, '')));
  const branded = rest !== q || gluedBrand;
  if (gluedBrand && rest === q) rest = '';

  const cc = siteCcTld(page);
  const geoWords = [...GEO, ...GEO_CODES, ...(cc ? [cc] : [])];
  const withoutFiller = (s: string) => s.split(' ').filter((t) => t && !FILLER.has(t)).join(' ');

  if (branded) {
    // Сначала убираем фразы (страны, слова продукта), служебные слова — в конце:
    // иначе «en vivo» распалось бы на «vivo».
    const noGeo = stripPhrases(rest, geoWords);
    // 3a. Чистый «бренд + страна» — зелёный.
    if (!withoutFiller(noGeo) && withoutFiller(rest)) return 'conv';
    // 3b. Чистый бренд или бренд + слова продукта — жёлтый.
    if (!withoutFiller(stripPhrases(noGeo, COMMERCIAL))) return 'brand';
    // 3c. Бренд + другие слова без коммерции — пусто: бренд сам по себе не коммерция.
    return null;
  }
  // 4. Без бренда: только слова продукта/коммерции — жёлтый («casino en ligne», «meilleur bookmaker»).
  if (hasPhrase(q, COMMERCIAL) && !withoutFiller(stripPhrases(q, [...COMMERCIAL, ...geoWords]))) return 'brand';
  return null;
}
