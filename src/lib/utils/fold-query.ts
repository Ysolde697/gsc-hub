// Общие нормализации для сравнения ключей и сайтов между консолями.

/** Нормальная форма ключа: регистр, диакритика и лишние пробелы не важны. */
export function foldQuery(q: string): string {
  return q.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Домен property: sc-domain:a.com, https://www.a.com/ → a.com. */
export function hostKey(siteUrl: string): string {
  try {
    const raw = siteUrl.startsWith('sc-domain:') ? `https://${siteUrl.slice(10)}/` : siteUrl;
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return siteUrl;
  }
}
