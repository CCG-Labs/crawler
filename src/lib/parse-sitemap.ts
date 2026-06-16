import { XMLParser } from 'fast-xml-parser';

export type SitemapParseResult = {
  isIndex: boolean;
  urls: string[];
};

const parser = new XMLParser({ ignoreAttributes: false });

export function parseSitemapXml(xml: string): SitemapParseResult {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return { isIndex: false, urls: [] };
  }

  if (doc.sitemapindex?.sitemap) {
    const items: any[] = [doc.sitemapindex.sitemap].flat();
    return {
      isIndex: true,
      urls: items.filter((s) => s?.loc != null).map((s) => String(s.loc)),
    };
  }

  if (doc.urlset?.url) {
    const items: any[] = [doc.urlset.url].flat();
    return {
      isIndex: false,
      urls: items.filter((u) => u?.loc != null).map((u) => String(u.loc)),
    };
  }

  return { isIndex: false, urls: [] };
}

export async function fetchSitemapUrls(
  sitemapUrl: string,
  visited: Set<string> = new Set()
): Promise<string[]> {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  let text: string;
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'CCGLabsBot/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  const { isIndex, urls } = parseSitemapXml(text);

  if (isIndex) {
    const deduped = [...new Set(urls)].filter((u) => !visited.has(u));
    const nested = await Promise.all(deduped.map((u) => fetchSitemapUrls(u, visited)));
    return nested.flat();
  }

  return urls;
}
