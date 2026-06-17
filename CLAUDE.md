# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # compile TypeScript → dist/
npm run typecheck    # type-check without emitting
npm run lint         # eslint src/ and tests/
npm run test         # vitest run + coverage (80% line/function threshold)
npm run test:watch   # vitest in watch mode

# Run a single test file
npx vitest run tests/crawler.test.ts
```

## Architecture

`@ccg-labs/crawler` is a TypeScript library (CommonJS, Node ≥20) that crawls a site and emits every discovered URL as a typed event. It ships both a programmatic API and a `crawl` CLI binary.

### Core data flow

1. `Crawler` (extends `EventEmitter`) is instantiated with `CrawlerOptions`.
2. `crawl()` fetches `robots.txt`, extracts sitemap URLs via `fetchSitemapUrls`, then launches either a `CheerioCrawler` (default, fast) or `PlaywrightCrawler` (`usePlaywright: true`, JS-rendered pages) from the `crawlee` library.
3. For each page, `extractResources()` scrapes the parsed HTML for images, stylesheets, scripts, canonicals, hreflang links, and sitemap refs.
4. Every discovered URL is emitted as a `DiscoveredUrl` event (`url` event name) with `{ url, type, foundOn, statusCode? }`.
5. A `done` event fires when the crawl completes; `error` fires on fatal failures.

### Module map

| Path | Purpose |
|------|---------|
| `src/crawler.ts` | `Crawler` class — orchestrates crawlee, robots, sitemaps, resource extraction |
| `src/cli.ts` | `run()` function — CLI arg parsing, drives `Crawler`, JSON-outputs to stdout |
| `src/index.ts` | Public re-exports for library consumers |
| `src/lib/extract-resources.ts` | Pure function: cheerio → `DiscoveredResource[]` (images, scripts, etc.) |
| `src/lib/parse-sitemap.ts` | `parseSitemapXml` (sync) + `fetchSitemapUrls` (async, recursive, depth ≤10) |

### Key design decisions

- **No persistent storage**: `crawlee` is configured with `persistStorage: false` to avoid leaving state on disk between runs.
- **Bot identity**: HTTP requests use `User-Agent: CCGLabsBot/1.0`; robots.txt checks use the same agent name.
- **CheerioCrawler vs PlaywrightCrawler**: concurrency defaults differ (5 vs 3). Both share the same `handlePage` closure.
- **`stop()`**: calls `autoscaledPool.abort()` on the active crawlee instance; sets a `_stopRequested` guard so `run()` is skipped if called after `stop()`.
- **Coverage**: `src/cli.ts` is excluded from coverage thresholds; the 80% threshold applies to `src/lib/` and `src/crawler.ts`.

### Publishing

Published to npm as `@ccg-labs/crawler` with provenance (`publishConfig.provenance: true`). `npm run prepare` (which runs `tsc`) is triggered automatically on `npm install` from GitHub, enabling direct GitHub installs.
