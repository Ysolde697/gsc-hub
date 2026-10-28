// Тип ключа для колонки «Тип» в Striking Distance, по словарю, без внешних сервисов.
//   conv   — зелёный: человек готов действовать (бонус, промокод, регистрация, скачать, играть);
//   brand  — жёлтый: бренд или коммерческий запрос (casino, apuestas, название казино);
//   null   — пусто: вход в аккаунт, информационные и прочие.
// Языки ниши: испанский, португальский, английский, чешский, русский и др.

export type Intent = 'conv' | 'brand' | null;

/** Нижний регистр без диакритики: «código» и «codigo» — одно слово. */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const list = (words: string[]) => words.map(foldText);

// Вход и информационные: такие ключи всегда пустые, даже если там есть бренд.
const EMPTY = list([
  'iniciar sesion', 'inicio de sesion', 'login', 'log in', 'sign in', 'entrar', 'acceso', 'acessar', 'prihlaseni', 'prihlasit',
  'вход', 'войти', 'личный кабинет',
  'que es', 'what is', 'como funciona', 'como jugar', 'como apostar', 'how to', 'jak hrat', 'что такое', 'как',
  'opiniones', 'opinion', 'resena', 'resenas', 'review', 'reviews', 'recenze', 'avaliacao', 'отзывы', 'обзор',
  'es seguro', 'e seguro', 'confiavel', 'es confiable', 'is it safe', 'legal', 'es legal', 'licencia', 'scam', 'estafa', 'fraude', 'podvod',
  'requisitos', 'telefono', 'contacto', 'atencion al cliente', 'soporte', 'support', 'kontakt'
]);

// Конверсионные: бонус, код, регистрация, приложение, депозит, игра.
const CONV = list([
  'bono', 'bonos', 'bonus', 'bonusy', 'bonusovy', 'bonusove', 'bonus code', 'bônus', 'бонус', 'бонусы',
  'promo', 'promocion', 'promociones', 'promocional', 'promocao', 'promotion', 'promo code', 'промокод', 'промо',
  'codigo', 'codigos', 'kod', 'kody', 'code', 'cupom', 'cupon', 'voucher',
  'free spins', 'freespins', 'giros gratis', 'tiradas gratis', 'rodadas gratis', 'otoceni', 'zatoceni', 'zdarma', 'фриспины', 'фриспин',
  'bez vkladu', 'no deposit', 'sin deposito', 'sem deposito', 'бездепозитный',
  'registro', 'registrarse', 'registrate', 'register', 'registration', 'registrace', 'cadastro', 'sign up', 'регистрация',
  'descargar', 'descarga', 'download', 'baixar', 'stahnout', 'apk', 'app', 'apps', 'aplicacion', 'aplicativo', 'aplikace', 'скачать', 'приложение',
  'movil', 'mobile', 'celular', 'mobil',
  'deposito', 'deposit', 'vklad', 'retiro', 'retirar', 'withdraw', 'saque', 'депозит', 'вывод',
  'jugar', 'jogar', 'play', 'hrat', 'apostar', 'играть', 'en vivo', 'ao vivo', 'live', 'gratis', 'free', 'бесплатно'
]);

// Коммерческие (жёлтые): игровые слова без явного действия.
const COMMERCIAL = list([
  'casino', 'casinos', 'cassino', 'kasino', 'kasina', 'online casino', 'казино',
  'apuestas', 'apuesta', 'apostas', 'aposta', 'bet', 'bets', 'betting', 'sazky', 'sazkova', 'ставки', 'букмекер',
  'slots', 'slot', 'tragamonedas', 'tragaperras', 'caca niqueis', 'automaty', 'слоты',
  'ruleta', 'roleta', 'roulette', 'ruleta', 'blackjack', 'poker', 'aviator', 'crash', 'plinko', 'bingo', 'loteria',
  'juegos', 'juego', 'jogos', 'jogo', 'games', 'hry', 'игры', 'deportivas', 'esportivas', 'sports'
]);

// Известные бренды ниши (букмекеры, казино, игры) — брендовый запрос сразу жёлтый.
const KNOWN_BRANDS = list([
  '1xbet', '1x bet', 'melbet', 'mostbet', '1win', 'betwinner', 'pin up', 'pinup', 'parimatch', 'betway', 'bet365',
  '22bet', 'linebet', 'megapari', 'paripesa', 'betano', 'betplay', 'yajuego', 'aquijuego', 'codere', 'rushbet', 'wplay',
  'stake', 'roobet', 'bc game', 'bcgame', 'vavada', 'joycasino', 'leon', 'fonbet', 'winline', 'betboom', 'olimpbet',
  'wingaga', 'aviator', 'jetx', 'spribe', 'pragmatic', 'sweet bonanza', 'gates of olympus', 'plinko', 'chicken road',
  'cricket road', 'mines', 'lucky jet', 'dafabet', 'fun88', 'betfair', 'sportybet', 'betika', 'premierbet', 'bangbet'
]);

// Части домена, которые не бренд: 1xbet-mobile.ci → «1xbet».
const DOMAIN_GENERIC = new Set(list([
  'app', 'apps', 'apk', 'mobile', 'mobi', 'casino', 'casinos', 'online', 'game', 'games', 'official', 'site', 'web',
  'login', 'download', 'bonus', 'promo', 'code', 'review', 'reviews', 'bet', 'bets', 'betting', 'sport', 'sports',
  'play', 'win', 'get', 'best', 'top', 'new', 'pro', 'hub', 'info', 'zone', 'club', 'world', 'live', 'apuestas',
  'deportivas', 'aposta', 'apostas', 'kasino', 'cassino', 'uz', 'ci', 'pk', 'bd', 'in', 'br', 'co', 'cl', 'mx', 'ar', 'pe'
]));

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

function hasPhrase(q: string, words: string[]): boolean {
  const padded = ` ${q} `;
  return words.some((w) => w && padded.includes(` ${w} `));
}

/** Слова-бренды из адреса страницы: /review/yajuego/ → yajuego. */
function slugWords(page: string): string[] {
  let path = '';
  try {
    path = new URL(page).pathname;
  } catch {
    return [];
  }
  const skip = new Set(list(['review', 'reviews', 'resena', 'casino', 'bonus', 'bono', 'app', 'apk', 'promo', 'code', 'codigo', 'es', 'en', 'pt', 'cz', 'html', 'php', 'blog', 'page']));
  return foldText(path.replace(/[-_/.]+/g, ' '))
    .split(' ')
    .filter((w) => w.length >= 4 && !skip.has(w) && !/^\d+$/.test(w));
}

export function classifyIntent(query: string, page = '', brandTerms: string[] = []): Intent {
  const q = foldText(query);
  if (!q) return null;
  if (hasPhrase(q, EMPTY)) return null;
  if (hasPhrase(q, CONV)) return 'conv';
  if (hasPhrase(q, COMMERCIAL)) return 'brand';
  if (hasPhrase(q, KNOWN_BRANDS)) return 'brand';
  const tokens = q.split(' ');
  const brands = [...slugWords(page), ...domainBrands(page), ...brandTerms.map(foldText).filter((t) => t.length >= 3)];
  // Бренд целиком, фразой или склеенный («yajuego» и «ya juego», «cricket road» и «cricketroad»).
  const glued = tokens.join('');
  if (
    brands.some((b) => {
      const bg = b.replace(/ /g, '');
      return tokens.includes(b) || hasPhrase(q, [b]) || (bg.length >= 4 && glued.includes(bg));
    })
  )
    return 'brand';
  return null;
}
