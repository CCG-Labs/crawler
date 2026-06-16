import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { extractResources, DiscoveredResource } from '../src/lib/extract-resources';

function load(html: string) {
  return cheerio.load(html);
}

function urls(resources: DiscoveredResource[], type?: string): string[] {
  return resources
    .filter((r) => !type || r.type === type)
    .map((r) => r.url);
}

describe('extractResources', () => {
  it('extracts img src', () => {
    const $ = load('<img src="/images/hero.jpg">');
    const r = extractResources($, 'https://example.com/');
    expect(urls(r, 'image')).toContain('https://example.com/images/hero.jpg');
  });

  it('extracts img srcset (multiple widths)', () => {
    const $ = load('<img srcset="/img/sm.jpg 400w, /img/lg.jpg 800w">');
    const r = extractResources($, 'https://example.com/');
    const imgUrls = urls(r, 'image');
    expect(imgUrls).toContain('https://example.com/img/sm.jpg');
    expect(imgUrls).toContain('https://example.com/img/lg.jpg');
  });

  it('extracts link[rel=stylesheet]', () => {
    const $ = load('<link rel="stylesheet" href="/css/main.css">');
    const r = extractResources($, 'https://example.com/');
    expect(urls(r, 'stylesheet')).toContain('https://example.com/css/main.css');
  });

  it('extracts script src', () => {
    const $ = load('<script src="/js/app.js"></script>');
    const r = extractResources($, 'https://example.com/');
    expect(urls(r, 'script')).toContain('https://example.com/js/app.js');
  });

  it('extracts link[rel=canonical]', () => {
    const $ = load('<link rel="canonical" href="https://example.com/page">');
    const r = extractResources($, 'https://example.com/page?utm=x');
    expect(urls(r, 'canonical')).toContain('https://example.com/page');
  });

  it('extracts link[rel=alternate][hreflang]', () => {
    const $ = load(`
      <link rel="alternate" hreflang="en" href="https://example.com/en/page">
      <link rel="alternate" hreflang="fr" href="https://example.com/fr/page">
    `);
    const r = extractResources($, 'https://example.com/');
    const hrefs = urls(r, 'hreflang');
    expect(hrefs).toContain('https://example.com/en/page');
    expect(hrefs).toContain('https://example.com/fr/page');
  });

  it('extracts link[rel=sitemap]', () => {
    const $ = load('<link rel="sitemap" type="application/xml" href="/sitemap.xml">');
    const r = extractResources($, 'https://example.com/');
    expect(urls(r, 'sitemap')).toContain('https://example.com/sitemap.xml');
  });

  it('resolves relative URLs against the page base', () => {
    const $ = load('<img src="images/photo.jpg">');
    const r = extractResources($, 'https://example.com/gallery/');
    expect(urls(r, 'image')).toContain('https://example.com/gallery/images/photo.jpg');
  });

  it('skips non-http(s) schemes', () => {
    const $ = load('<img src="data:image/png;base64,abc"><script src="javascript:void(0)"></script>');
    const r = extractResources($, 'https://example.com/');
    expect(r.every((res) => res.url.startsWith('http'))).toBe(true);
  });

  it('skips empty src attributes', () => {
    const $ = load('<img src="">');
    const r = extractResources($, 'https://example.com/');
    expect(urls(r, 'image')).toHaveLength(0);
  });

  it('does not include inline scripts (no src attribute)', () => {
    const $ = load('<script>console.log("hello")</script>');
    const r = extractResources($, 'https://example.com/');
    expect(urls(r, 'script')).toHaveLength(0);
  });

  it('extracts video poster and source src', () => {
    const $ = load(`
      <video poster="/img/thumb.jpg">
        <source src="/video/clip.mp4">
      </video>
    `);
    const r = extractResources($, 'https://example.com/');
    expect(urls(r, 'image')).toContain('https://example.com/img/thumb.jpg');
    expect(urls(r, 'other')).toContain('https://example.com/video/clip.mp4');
  });

  it('returns empty array for a page with no resources', () => {
    const $ = load('<p>Hello world</p>');
    const r = extractResources($, 'https://example.com/');
    expect(r).toHaveLength(0);
  });
});
