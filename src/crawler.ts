import { EventEmitter } from 'node:events';
import { CheerioCrawler, PlaywrightCrawler, EnqueueStrategy, RobotsFile, Configuration } from 'crawlee';
import type { EnqueueLinksOptions } from 'crawlee';
import { load } from 'cheerio';
import { extractResources } from './lib/extract-resources';
import { fetchSitemapUrls } from './lib/parse-sitemap';
import type { ResourceType } from './lib/extract-resources';

export type { ResourceType };

export interface DiscoveredUrl {
  url: string;
  type: ResourceType;
  foundOn: string;
  statusCode?: number;
}

export interface CrawlerOptions {
  baseUrl: string;
  usePlaywright?: boolean;
  maxRequests?: number;
  respectRobots?: boolean;
  concurrency?: number;
}

export class Crawler extends EventEmitter {
  private readonly opts: Required<Omit<CrawlerOptions, 'maxRequests'>> & { maxRequests?: number };
  private _activeCrawler: CheerioCrawler | PlaywrightCrawler | null = null;

  constructor(options: CrawlerOptions) {
    super();
    this.opts = {
      usePlaywright: false,
      respectRobots: true,
      concurrency: options.usePlaywright ? 3 : 5,
      ...options,
    };
  }

  stop(): void {
    void this._activeCrawler?.autoscaledPool?.abort();
  }

  async crawl(): Promise<void> {
    const { baseUrl, usePlaywright, maxRequests, respectRobots, concurrency } = this.opts;
    const seedUrl = baseUrl.replace(/\/$/, '');

    let robots: RobotsFile | null = null;
    if (respectRobots) {
      try {
        robots = await RobotsFile.find(seedUrl + '/');
      } catch {
        // no robots.txt — proceed without
      }
    }

    const sitemapUrls: string[] = robots?.getSitemaps() ?? [];
    const sitemapPageUrls: string[] = [];
    for (const sitemapUrl of sitemapUrls) {
      const pages = await fetchSitemapUrls(sitemapUrl);
      sitemapPageUrls.push(...pages);
      this.emit('url', {
        url: sitemapUrl,
        type: 'sitemap' as const,
        foundOn: `${seedUrl}/robots.txt`,
      } satisfies DiscoveredUrl);
    }

    const allowedSitemapPages = sitemapPageUrls.filter(
      (u) => !robots || robots.isAllowed(u, 'CCGLabsBot')
    );
    const seedList = [seedUrl, ...allowedSitemapPages];

    const crawlerConfig = new Configuration({ persistStorage: false });

    const crawlerOptions = {
      maxRequestsPerCrawl: maxRequests,
      maxConcurrency: concurrency,
      maxRequestRetries: 2,
    };

    const normalizeUrl = (u: string): string => {
      try {
        const parsed = new URL(u);
        // Ensure root paths have a trailing slash
        if (parsed.pathname === '') parsed.pathname = '/';
        return parsed.href;
      } catch {
        return u;
      }
    };

    const handlePage = async (
      rawPageUrl: string,
      $: ReturnType<typeof load>,
      statusCode: number | undefined,
      foundOn: string | null,
      enqueueLinks: (opts?: EnqueueLinksOptions) => Promise<unknown>
    ): Promise<void> => {
      const pageUrl = normalizeUrl(rawPageUrl);
      this.emit('url', {
        url: pageUrl,
        type: 'page' as const,
        foundOn: foundOn ?? seedUrl,
        statusCode,
      } satisfies DiscoveredUrl);

      const resources = extractResources($, pageUrl);
      for (const r of resources) {
        this.emit('url', {
          url: r.url,
          type: r.type,
          foundOn: pageUrl,
        } satisfies DiscoveredUrl);
      }

      await enqueueLinks({
        strategy: EnqueueStrategy.SameHostname,
        transformRequestFunction(req: any) {
          if (robots && !robots.isAllowed(req.url, 'CCGLabsBot')) return false;
          req.userData = { foundOn: pageUrl };
          return req;
        },
      });
    };

    try {
      if (usePlaywright) {
        const crawler = new PlaywrightCrawler(
          {
            ...crawlerOptions,
            async requestHandler({ request, page, enqueueLinks }) {
              const content = await page.content();
              const $ = load(content);
              await handlePage(
                request.url,
                $,
                undefined,
                (request.userData?.foundOn as string | null) ?? null,
                enqueueLinks
              );
            },
            failedRequestHandler() { /* non-fatal */ },
          },
          crawlerConfig
        );
        this._activeCrawler = crawler;
        await crawler.run(seedList);
      } else {
        const crawler = new CheerioCrawler(
          {
            ...crawlerOptions,
            async requestHandler({ request, $, response, enqueueLinks }) {
              await handlePage(
                request.url,
                $ as unknown as ReturnType<typeof load>,
                response?.statusCode,
                (request.userData?.foundOn as string | null) ?? null,
                enqueueLinks
              );
            },
            failedRequestHandler() { /* non-fatal */ },
          },
          crawlerConfig
        );
        this._activeCrawler = crawler;
        await crawler.run(seedList);
      }
    } finally {
      this._activeCrawler = null;
      this.emit('done');
    }
  }
}
