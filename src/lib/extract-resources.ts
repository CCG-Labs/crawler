import type { CheerioAPI } from 'cheerio';

export type ResourceType =
  | 'page'
  | 'image'
  | 'stylesheet'
  | 'script'
  | 'canonical'
  | 'hreflang'
  | 'sitemap'
  | 'other';

export type DiscoveredResource = {
  url: string;
  type: ResourceType;
};

function resolve(href: string | undefined, base: string): string | null {
  if (!href || href.trim() === '') return null;
  try {
    const resolved = new URL(href, base).href;
    if (!resolved.startsWith('http://') && !resolved.startsWith('https://')) return null;
    return resolved;
  } catch {
    return null;
  }
}

function pushIfResolved(
  out: DiscoveredResource[],
  href: string | undefined,
  type: ResourceType,
  base: string
): void {
  const url = resolve(href, base);
  if (url) out.push({ url, type });
}

export function extractResources($: CheerioAPI, pageUrl: string): DiscoveredResource[] {
  const resources: DiscoveredResource[] = [];

  $('img[src]').each((_, el) => {
    pushIfResolved(resources, $(el).attr('src'), 'image', pageUrl);
  });

  $('img[srcset], source[srcset]').each((_, el) => {
    const srcset = $(el).attr('srcset') ?? '';
    srcset.split(',').forEach((entry) => {
      const candidate = entry.trim().split(/\s+/)[0];
      pushIfResolved(resources, candidate, 'image', pageUrl);
    });
  });

  $('video[poster]').each((_, el) => {
    pushIfResolved(resources, $(el).attr('poster'), 'image', pageUrl);
  });

  $('source[src]').each((_, el) => {
    pushIfResolved(resources, $(el).attr('src'), 'other', pageUrl);
  });

  $('link[rel="stylesheet"][href]').each((_, el) => {
    pushIfResolved(resources, $(el).attr('href'), 'stylesheet', pageUrl);
  });

  $('script[src]').each((_, el) => {
    pushIfResolved(resources, $(el).attr('src'), 'script', pageUrl);
  });

  $('link[rel="canonical"][href]').each((_, el) => {
    pushIfResolved(resources, $(el).attr('href'), 'canonical', pageUrl);
  });

  $('link[rel="alternate"][hreflang]').each((_, el) => {
    pushIfResolved(resources, $(el).attr('href'), 'hreflang', pageUrl);
  });

  $('link[rel="sitemap"][href]').each((_, el) => {
    pushIfResolved(resources, $(el).attr('href'), 'sitemap', pageUrl);
  });

  return resources;
}
