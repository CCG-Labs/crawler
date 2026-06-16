import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { Crawler, DiscoveredUrl } from '../src/index';

let server: http.Server;
let base: string;

function makePages(port: number): Record<string, { status: number; type: string; body: string }> {
  const b = `http://127.0.0.1:${port}`;
  return {
    '/': {
      status: 200,
      type: 'text/html',
      body: `<!DOCTYPE html><html><head>
        <link rel="stylesheet" href="/css/main.css">
        <link rel="canonical" href="${b}/">
      </head><body>
        <img src="/img/hero.jpg">
        <script src="/js/app.js"></script>
        <a href="/page-a">Page A</a>
        <a href="/private/secret">Secret</a>
      </body></html>`,
    },
    '/page-a': {
      status: 200,
      type: 'text/html',
      body: `<!DOCTYPE html><html><body><a href="/">Home</a></body></html>`,
    },
    '/private/secret': {
      status: 200,
      type: 'text/html',
      body: `<!DOCTYPE html><html><body>Secret</body></html>`,
    },
    '/robots.txt': {
      status: 200,
      type: 'text/plain',
      body: `User-agent: *\nDisallow: /private/\n`,
    },
    '/css/main.css': { status: 200, type: 'text/css', body: '' },
    '/js/app.js':    { status: 200, type: 'application/javascript', body: '' },
    '/img/hero.jpg': { status: 200, type: 'image/jpeg', body: '' },
  };
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const addr = server.address() as { port: number };
    const pages = makePages(addr.port);
    const entry = pages[req.url as string];
    if (entry) {
      res.writeHead(entry.status, { 'Content-Type': entry.type });
      res.end(entry.body);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

function collect(crawler: Crawler): DiscoveredUrl[] {
  const urls: DiscoveredUrl[] = [];
  crawler.on('url', (u: DiscoveredUrl) => urls.push(u));
  return urls;
}

describe('Crawler', () => {
  it('emits url events for discovered pages', async () => {
    const crawler = new Crawler({ baseUrl: base });
    const urls = collect(crawler);
    await crawler.crawl();

    const pageUrls = urls.filter((u) => u.type === 'page').map((u) => u.url);
    expect(pageUrls).toContain(base + '/');
    expect(pageUrls).toContain(base + '/page-a');
  });

  it('emits done when crawl completes', async () => {
    const crawler = new Crawler({ baseUrl: base });
    let doneFired = false;
    crawler.on('done', () => { doneFired = true; });
    await crawler.crawl();
    expect(doneFired).toBe(true);
  });

  it('discovers linked resources (image, stylesheet, script)', async () => {
    const crawler = new Crawler({ baseUrl: base });
    const urls = collect(crawler);
    await crawler.crawl();

    expect(urls.some((u) => u.type === 'image' && u.url === base + '/img/hero.jpg')).toBe(true);
    expect(urls.some((u) => u.type === 'stylesheet' && u.url === base + '/css/main.css')).toBe(true);
    expect(urls.some((u) => u.type === 'script' && u.url === base + '/js/app.js')).toBe(true);
  });

  it('sets foundOn for discovered resources', async () => {
    const crawler = new Crawler({ baseUrl: base });
    const urls = collect(crawler);
    await crawler.crawl();

    const hero = urls.find((u) => u.url === base + '/img/hero.jpg');
    expect(hero).toBeDefined();
    expect(hero?.foundOn).toBe(base + '/');
  });

  it('respects robots.txt Disallow rules when respectRobots is true', async () => {
    const crawler = new Crawler({ baseUrl: base, respectRobots: true });
    const urls = collect(crawler);
    await crawler.crawl();

    expect(urls.every((u) => !u.url.includes('/private/'))).toBe(true);
  });

  it('crawls disallowed pages when respectRobots is false', async () => {
    const crawler = new Crawler({ baseUrl: base, respectRobots: false });
    const urls = collect(crawler);
    await crawler.crawl();

    const pageUrls = urls.filter((u) => u.type === 'page').map((u) => u.url);
    expect(pageUrls).toContain(base + '/private/secret');
  });

  it('stops early when maxRequests is set', async () => {
    const crawler = new Crawler({ baseUrl: base, maxRequests: 1 });
    const pages: DiscoveredUrl[] = [];
    crawler.on('url', (u: DiscoveredUrl) => { if (u.type === 'page') pages.push(u); });
    await crawler.crawl();

    expect(pages.length).toBeLessThanOrEqual(1);
  });

  it('stop() halts the crawl before the queue is exhausted', async () => {
    const crawler = new Crawler({ baseUrl: base, respectRobots: false });
    const pages: DiscoveredUrl[] = [];
    crawler.on('url', (u: DiscoveredUrl) => {
      if (u.type === 'page') {
        pages.push(u);
        if (pages.length >= 1) crawler.stop();
      }
    });
    await crawler.crawl();
    expect(pages.length).toBeLessThan(3);
  });
});
