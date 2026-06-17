# @ccg-labs/crawler

Discovers all URLs and linked resources on a target site. Comparable to Screaming Frog SEO Spider for URL collection — pages, images, stylesheets, scripts, canonical tags, hreflang, and sitemaps.

Built on [Crawlee](https://crawlee.dev). Supports both static sites (Cheerio) and JavaScript-rendered SPAs (Playwright).

## Installation

**From npm** (once published):

```bash
npm install @ccg-labs/crawler
```

**Directly from GitHub** (no npm account required):

```bash
npm install CCG-Labs/crawler

# Pin to a specific commit
npm install CCG-Labs/crawler#3989feb
```

npm will clone the repo, install dependencies, and compile the TypeScript automatically via the `prepare` script. Requires Node.js ≥ 20.

**For the CLI** (either method above, then):

```bash
npx playwright install chromium   # only if using --js
```

## CLI

```bash
crawl <url> [options]

Options:
  --js                  Use Playwright for JS-rendered pages
  --max-requests <n>    Cap the number of pages crawled
  --help                Show help
```

**Output:** JSON array of discovered URLs written to stdout. Progress to stderr.

```bash
# Static site
crawl https://example.com > urls.json

# JavaScript-rendered site
crawl https://spa.example.com --js > urls.json

# Limit crawl depth
crawl https://example.com --max-requests 500 > urls.json
```

## Programmatic API

```typescript
import { Crawler, DiscoveredUrl } from '@ccg-labs/crawler';

const crawler = new Crawler({
  baseUrl: 'https://example.com',
  usePlaywright: false,   // default
  maxRequests: 1000,      // optional
  respectRobots: true,    // default
  concurrency: 5,         // default
});

crawler.on('url', (u: DiscoveredUrl) => {
  console.log(u.url, u.type, u.foundOn);
});

crawler.on('done', () => console.log('Crawl complete'));

await crawler.crawl();
```

### `DiscoveredUrl`

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | The discovered URL |
| `type` | `ResourceType` | `'page' \| 'image' \| 'stylesheet' \| 'script' \| 'canonical' \| 'hreflang' \| 'sitemap' \| 'other'` |
| `foundOn` | `string` | Page URL where this was discovered |
| `statusCode` | `number \| undefined` | HTTP status (present for pages only) |

### `CrawlerOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Seed URL (required) |
| `usePlaywright` | `boolean` | `false` | Use Playwright instead of Cheerio |
| `maxRequests` | `number` | unlimited | Max pages to crawl |
| `respectRobots` | `boolean` | `true` | Honor robots.txt rules |
| `concurrency` | `number` | 5 (Cheerio) / 3 (Playwright) | Concurrent requests |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `url` | `DiscoveredUrl` | Fired per discovered URL |
| `done` | — | Fired when the crawl finishes (even on error) |
| `error` | `Error` | Fatal crawl error |

`crawl()` both emits `error` **and** rejects its Promise, so you can consume errors either way. If using the EventEmitter pattern without `await`, suppress the unhandled rejection with `.catch(() => {})`:

```typescript
crawler.on('error', (err) => console.error(err));
crawler.on('done', () => console.log('done'));
crawler.crawl().catch(() => {}); // suppress unhandled rejection
```

## What it discovers

- HTML pages (via link following + sitemap seeding)
- `<img src>`, `<img srcset>`, `<source srcset>`, `<video poster>` — images
- `<link rel="stylesheet">` — stylesheets
- `<script src>` — scripts
- `<link rel="canonical">` — canonical URLs
- `<link rel="alternate" hreflang>` — hreflang alternates
- `<link rel="sitemap">` — sitemap references
- Sitemaps declared in robots.txt (recursively resolved)

Stays within the target domain (`SameHostname` strategy). Respects `robots.txt` by default.

## License

MIT
