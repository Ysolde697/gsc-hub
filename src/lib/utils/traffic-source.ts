// Откуда пришёл посетитель: адрес предыдущего сайта (document.referrer) →
// понятный источник. Счётчик пишет его в target у события «view»:
//   '(direct)'   — пришёл без адреса: набрал сам, закладка, приложение, мессенджер;
//   '(internal)' — переход внутри сайта, обновление, «Назад» — это не новый вход;
//   'utm:<x>'    — пришёл без адреса, но с меткой ?utm_source=<x> (метка
//                  известного источника, например chatgpt.com, считается им);
//   'google.com' и т.п. — домен сайта, откуда пришёл;
//   ''           — старый код счётчика, источник не передавал.

export type SourceGroup = 'search' | 'ai' | 'social' | 'site' | 'direct' | 'tag';

export interface TrafficSource {
  /** Ключ для сложения: одинаковый у google.de и google.com. */
  key: string;
  label: string;
  group: SourceGroup;
}

export const GROUP_LABEL: Record<SourceGroup, string> = {
  search: 'Поисковики',
  ai: 'ИИ-помощники',
  social: 'Соцсети и мессенджеры',
  site: 'Другие сайты',
  direct: 'Прямой заход',
  tag: 'По метке utm'
};

const on = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);

// Порядок важен: gemini.google.com — ИИ, а не поиск Google.
const KNOWN: { label: string; group: SourceGroup; test: (h: string) => boolean }[] = [
  { label: 'ChatGPT', group: 'ai', test: (h) => on(h, 'chatgpt.com') || on(h, 'chat.openai.com') },
  { label: 'Perplexity', group: 'ai', test: (h) => on(h, 'perplexity.ai') },
  { label: 'Gemini', group: 'ai', test: (h) => on(h, 'gemini.google.com') },
  { label: 'Copilot', group: 'ai', test: (h) => on(h, 'copilot.microsoft.com') },
  { label: 'Claude', group: 'ai', test: (h) => on(h, 'claude.ai') },
  { label: 'Google', group: 'search', test: (h) => /(^|\.)google\.[a-z.]+$/.test(h) || h.includes('googlequicksearchbox') },
  { label: 'Bing', group: 'search', test: (h) => on(h, 'bing.com') },
  { label: 'Яндекс', group: 'search', test: (h) => /(^|\.)yandex\.[a-z.]+$/.test(h) || on(h, 'ya.ru') },
  { label: 'DuckDuckGo', group: 'search', test: (h) => on(h, 'duckduckgo.com') },
  { label: 'Yahoo', group: 'search', test: (h) => /(^|\.)yahoo\.[a-z.]+$/.test(h) },
  { label: 'Ecosia', group: 'search', test: (h) => on(h, 'ecosia.org') },
  { label: 'Brave Search', group: 'search', test: (h) => on(h, 'search.brave.com') },
  { label: 'Qwant', group: 'search', test: (h) => on(h, 'qwant.com') },
  { label: 'Startpage', group: 'search', test: (h) => on(h, 'startpage.com') },
  { label: 'Seznam', group: 'search', test: (h) => on(h, 'seznam.cz') },
  { label: 'Baidu', group: 'search', test: (h) => on(h, 'baidu.com') },
  { label: 'Naver', group: 'search', test: (h) => on(h, 'naver.com') },
  { label: 'Facebook', group: 'social', test: (h) => on(h, 'facebook.com') || on(h, 'fb.com') },
  { label: 'Instagram', group: 'social', test: (h) => on(h, 'instagram.com') },
  { label: 'X (Twitter)', group: 'social', test: (h) => h === 't.co' || on(h, 'x.com') || on(h, 'twitter.com') },
  { label: 'Reddit', group: 'social', test: (h) => on(h, 'reddit.com') },
  { label: 'YouTube', group: 'social', test: (h) => on(h, 'youtube.com') || h === 'youtu.be' },
  { label: 'TikTok', group: 'social', test: (h) => on(h, 'tiktok.com') },
  { label: 'Telegram', group: 'social', test: (h) => h === 't.me' || on(h, 'telegram.org') },
  { label: 'WhatsApp', group: 'social', test: (h) => on(h, 'whatsapp.com') },
  { label: 'Discord', group: 'social', test: (h) => on(h, 'discord.com') },
  { label: 'VK', group: 'social', test: (h) => on(h, 'vk.com') },
  { label: 'LinkedIn', group: 'social', test: (h) => on(h, 'linkedin.com') || h === 'lnkd.in' },
  { label: 'Pinterest', group: 'social', test: (h) => /(^|\.)pinterest\.[a-z.]+$/.test(h) }
];

/** Значение r из страницы → что хранить в target у «view». */
export function storedSource(r: string): string {
  const v = r.trim().toLowerCase();
  if (v === '') return '(direct)';
  if (v === '=') return '(internal)';
  if (v.startsWith('utm:')) {
    const tag = v.slice(4).replace(/[^a-z0-9._-]/g, '').slice(0, 40);
    return tag ? `utm:${tag}` : '(direct)';
  }
  const host = v.replace(/^www\./, '').replace(/\.$/, '').slice(0, 100);
  return /^[a-z0-9.-]+$/.test(host) ? host : '(other)';
}

/**
 * Источник входа по target события «view». null — не вход (переход внутри
 * сайта) или старый код, который источник не передавал.
 */
export function sourceOf(target: string): TrafficSource | null {
  if (!target || target === '(internal)') return null;
  if (target === '(direct)') return { key: '(direct)', label: 'Прямой заход', group: 'direct' };
  if (target.startsWith('utm:')) {
    // ChatGPT, Perplexity и др. сами ставят метку на ссылки в ответах
    // (utm_source=chatgpt.com), а адрес, откуда пришли, часто не передают.
    const tag = target.slice(4);
    const byTag = KNOWN.find((k) => k.test(tag) || k.test(`${tag}.com`) || k.test(`${tag}.ai`));
    if (byTag) return { key: byTag.label, label: byTag.label, group: byTag.group };
    return { key: target, label: `Метка ${tag}`, group: 'tag' };
  }
  if (target === '(other)') return { key: '(other)', label: 'Другие сайты', group: 'site' };
  const known = KNOWN.find((k) => k.test(target));
  if (known) return { key: known.label, label: known.label, group: known.group };
  return { key: target, label: target, group: 'site' };
}
