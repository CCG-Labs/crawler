import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseSitemapXml, fetchSitemapUrls } from '../src/lib/parse-sitemap';

describe('parseSitemapXml', () => {
  it('extracts URLs from a standard urlset sitemap', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.isIndex).toBe(false);
    expect(result.urls).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/contact',
    ]);
  });

  it('extracts child sitemap URLs from a sitemap index', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
</sitemapindex>`;
    const result = parseSitemapXml(xml);
    expect(result.isIndex).toBe(true);
    expect(result.urls).toEqual([
      'https://example.com/sitemap-pages.xml',
      'https://example.com/sitemap-posts.xml',
    ]);
  });

  it('handles a single-URL sitemap (not wrapped in array)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
</urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.urls).toEqual(['https://example.com/']);
  });

  it('returns empty arrays for unrecognised XML', () => {
    const result = parseSitemapXml('<rss><channel></channel></rss>');
    expect(result.urls).toEqual([]);
    expect(result.isIndex).toBe(false);
  });

  it('skips entries missing a <loc> child — no "undefined" strings', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/good</loc></url>
  <url><priority>0.5</priority></url>
</urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.urls).toEqual(['https://example.com/good']);
    expect(result.urls).not.toContain('undefined');
  });

  it('includes lastmod and priority fields without breaking URL extraction', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/services</loc>
    <lastmod>2026-01-01</lastmod>
    <priority>0.8</priority>
  </url>
</urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.urls).toEqual(['https://example.com/services']);
  });
});

describe('fetchSitemapUrls', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns page URLs from a urlset sitemap', async () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => xml,
    } as Response);

    const urls = await fetchSitemapUrls('https://example.com/sitemap.xml');
    expect(urls).toEqual(['https://example.com/', 'https://example.com/about']);
  });

  it('recursively resolves sitemap indexes', async () => {
    const index = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
</sitemapindex>`;
    const child = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page-1</loc></url>
</urlset>`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const body = String(url).includes('pages.xml') ? child : index;
      return { ok: true, text: async () => body } as Response;
    });

    const urls = await fetchSitemapUrls('https://example.com/sitemap.xml');
    expect(urls).toEqual(['https://example.com/page-1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('guards against circular sitemap indexes (no infinite loop)', async () => {
    const circular = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap.xml</loc></sitemap>
</sitemapindex>`;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => circular,
    } as Response);

    const urls = await fetchSitemapUrls('https://example.com/sitemap.xml');
    expect(urls).toEqual([]);
  });

  it('returns empty array when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const urls = await fetchSitemapUrls('https://example.com/sitemap.xml');
    expect(urls).toEqual([]);
  });

  it('returns empty array on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      text: async () => '',
    } as Response);
    const urls = await fetchSitemapUrls('https://example.com/sitemap.xml');
    expect(urls).toEqual([]);
  });
});
