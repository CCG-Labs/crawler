import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { run } from '../src/cli';
import type { DiscoveredUrl } from '../src/index';

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><body>
        <img src="/img/hero.jpg">
        <a href="/about">About</a>
      </body></html>`);
    } else if (req.url === '/about') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><body><a href="/">Home</a></body></html>`);
    } else if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\n');
    } else {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end('');
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

describe('CLI run()', () => {
  it('returns a DiscoveredUrl array containing the seed page', async () => {
    const results = await run([base]);
    expect(Array.isArray(results)).toBe(true);
    const pageUrls = results.filter((u: DiscoveredUrl) => u.type === 'page').map((u: DiscoveredUrl) => u.url);
    expect(pageUrls).toContain(base + '/');
  });

  it('returns url objects with required fields', async () => {
    const results = await run([base]);
    expect(results.length).toBeGreaterThan(0);
    for (const u of results) {
      expect(u).toHaveProperty('url');
      expect(u).toHaveProperty('type');
      expect(u).toHaveProperty('foundOn');
    }
  });

  it('respects --max-requests flag', async () => {
    const results = await run([base, '--max-requests', '1']);
    const pages = results.filter((u: DiscoveredUrl) => u.type === 'page');
    expect(pages.length).toBeLessThanOrEqual(1);
  });

  it('exits with an error when no URL is provided', async () => {
    await expect(run([])).rejects.toThrow();
  });

  it('exits with an error when --max-requests is not a positive integer', async () => {
    await expect(run([base, '--max-requests', 'abc'])).rejects.toThrow();
  });
});
