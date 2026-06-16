import { parseArgs } from 'node:util';
import { Crawler } from './crawler';
import type { DiscoveredUrl } from './crawler';

export async function run(args: string[]): Promise<DiscoveredUrl[]> {
  const { values: argv, positionals } = parseArgs({
    args,
    options: {
      js:             { type: 'boolean', default: false },
      'max-requests': { type: 'string' },
      help:           { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (argv.help) {
    process.stdout.write([
      'Usage: crawl <url> [options]',
      '',
      'Options:',
      '  --js                  Use Playwright for JS-rendered pages',
      '  --max-requests <n>    Cap the number of pages crawled',
      '  --help                Show this help message',
      '',
    ].join('\n'));
    return [];
  }

  const baseUrl = positionals[0];
  if (!baseUrl) throw new Error('Missing required argument: <url>');

  let maxRequests: number | undefined;
  if (argv['max-requests'] !== undefined) {
    maxRequests = parseInt(argv['max-requests'], 10);
    if (isNaN(maxRequests) || maxRequests < 1) {
      throw new Error('--max-requests must be a positive integer');
    }
  }

  const crawler = new Crawler({
    baseUrl,
    usePlaywright: argv.js,
    maxRequests,
  });

  const urls: DiscoveredUrl[] = [];
  let count = 0;
  crawler.on('url', (u: DiscoveredUrl) => {
    urls.push(u);
    if (u.type === 'page') {
      count++;
      process.stderr.write(`Crawling… ${count} pages found\r`);
    }
  });

  await crawler.crawl();
  process.stderr.write(`\nDone. ${urls.length} URLs discovered.\n`);

  return urls;
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((urls) => {
      if (urls.length > 0) {
        process.stdout.write(JSON.stringify(urls, null, 2) + '\n');
      }
    })
    .catch((err: Error) => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    });
}
