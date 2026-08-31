// What reaches speculaone.com, and what must not.
//
// The report harness renders complete audit reports from hand-built payloads,
// including a passing Full Audit showing the Specula Mark for "Hotel Borealis",
// a property that does not exist. On the company's own domain that reads as a
// genuine certification. It was tracked at the repository root with nothing
// excluding it, and a noindex meta tag stops search engines and nobody else.
//
// These tests compute the set of files that would actually be uploaded, by
// applying .vercelignore to the tracked file list, and assert both directions:
// nothing dangerous is in the set, and nothing the live site needs is missing
// from it. The second half matters as much as the first, because the cheapest
// way to pass the first half is to exclude too much and break the report.
//
// The exclusion mechanism itself is not assumed. CLAUDE.md and scripts/ have
// been listed in .vercelignore since before this change, and both return 404
// on the live site today while index.html and report.js serve normally.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Every file a deployment could start from: tracked, plus anything present and
 * not gitignored. The untracked half matters because a `vercel` CLI deploy
 * uploads the working directory, not the commit, so a file that exists but has
 * not been committed can still reach production.
 */
function trackedFiles() {
  return execFileSync(
    'git', ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  ).split('\n').map((s) => s.trim()).filter(Boolean);
}

/** The .vercelignore patterns, comments and blanks stripped. */
function ignorePatterns() {
  return read('.vercelignore')
    .split('\n').map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

/**
 * Does this path fall under one of the patterns?
 * The file uses only exact names and directory prefixes, so this stays literal
 * rather than reimplementing glob semantics it does not use.
 */
function isIgnored(file, patterns) {
  return patterns.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));
}

/** What would actually be served. */
function deploySet() {
  const patterns = ignorePatterns();
  assert.ok(
    patterns.every((p) => !p.includes('*')),
    'a glob appeared in .vercelignore; this matcher only understands names and dir/ prefixes',
  );
  return trackedFiles().filter((f) => !isIgnored(f, patterns));
}

// ── the harness cannot become a route ───────────────────────────────────────

test('the report harness is not in the deployed file set', () => {
  const deployed = deploySet();
  const harness = deployed.filter((f) => f.includes('harness'));
  assert.deepEqual(harness, [], `these would be served: ${harness.join(', ')}`);
});

test('the harness still exists, under dev/, so local verification survives', () => {
  const tracked = trackedFiles();
  assert.ok(tracked.includes('dev/report-harness.html'), 'the harness is kept, just not shipped');
  assert.equal(tracked.includes('report-harness.html'), false, 'and not at the root any more');
});

test('no test file is in the deployed file set', () => {
  const shipped = deploySet().filter((f) => /(^|\/)test(s)?\//.test(f) || f.endsWith('.test.js'));
  assert.deepEqual(shipped, [], `these would be served: ${shipped.join(', ')}`);
});

test('no Node tooling is in the deployed file set', () => {
  const deployed = deploySet();
  for (const f of ['package.json', 'package-lock.json']) {
    assert.equal(deployed.includes(f), false, `${f} must not be uploaded`);
  }
  assert.equal(deployed.some((f) => f.startsWith('node_modules/')), false);
});

test('nothing under dev/ is in the deployed file set', () => {
  const leaked = deploySet().filter((f) => f.startsWith('dev/'));
  assert.deepEqual(leaked, [], `dev/ must be excluded whole: ${leaked.join(', ')}`);
});

test('every deployed HTML page is one of the real pages', () => {
  // A new .html file reaching the deploy set is exactly how the harness got
  // there, so the set is named rather than pattern-matched.
  const PAGES = ['index.html', 'about.html', 'report.html'];
  const html = deploySet().filter((f) => f.endsWith('.html'));
  assert.deepEqual(html.sort(), [...PAGES].sort());
});

test('no fabricated property name reaches any deployed file', () => {
  // The harness names a hotel that does not exist and shows it certified.
  // Nothing shipped should mention it.
  for (const f of deploySet()) {
    if (!/\.(html|js|css|json|txt|xml)$/.test(f)) continue;
    const body = read(f);
    assert.equal(body.includes('Hotel Borealis'), false, `${f} names a property that does not exist`);
    assert.equal(body.includes('AHP-2026-DEMO'), false, `${f} carries a fabricated audit reference`);
  }
});

// ── and the site still has everything it needs ──────────────────────────────

test('every module the deployed report.js imports is itself deployed', () => {
  // The failure this catches is the opposite one: excluding so much that the
  // report stops working. report.js loads these as ES modules in the browser.
  const deployed = new Set(deploySet());
  const source = read('report.js');
  const local = [...source.matchAll(/from\s+'(\.\/[^']+)'/g)].map((m) => m[1].replace(/^\.\//, ''));

  assert.ok(local.length >= 2, 'expected report.js to import its own modules');
  for (const dep of local) {
    assert.ok(deployed.has(dep), `report.js imports ${dep}, which would not be served`);
  }
});

test('the pages, styles and assets the site needs are all deployed', () => {
  const deployed = new Set(deploySet());
  for (const f of [
    'index.html', 'about.html', 'report.html',
    'report.js', 'report-result.js', 'report-render.js', 'report.css',
    'tokens.css', 'base.css', 'components.css', 'style.css',
    'robots.txt', 'sitemap.xml', 'vercel.json',
  ]) {
    assert.ok(deployed.has(f), `${f} must still be served`);
  }
});

test('report.html still loads report.js and nothing from dev/', () => {
  const html = read('report.html');
  assert.ok(html.includes('report.js'), 'the page still loads the report');
  assert.equal(/dev\//.test(html), false, 'and references nothing under dev/');
});

// ── the deployment cannot depend on what we cannot inspect ──────────────────

test('vercel.json pins the build so a detected framework cannot change it', () => {
  // The project settings live in the Vercel dashboard and cannot be read from
  // here. Pinning them in the repository makes the deployment deterministic
  // rather than inferred: no framework, no install, no build, serve the root.
  const cfg = JSON.parse(read('vercel.json'));
  assert.equal(cfg.framework, null, 'no framework preset may be inferred');
  assert.equal(cfg.buildCommand, '', 'no build step');
  assert.equal(cfg.installCommand, '', 'no install step');
  assert.equal(cfg.outputDirectory, '.', 'the repository root is the site');
});

test('vercel.json keeps every security header it had', () => {
  const cfg = JSON.parse(read('vercel.json'));
  const keys = cfg.headers[0].headers.map((h) => h.key).sort();
  assert.deepEqual(keys, [
    'Permissions-Policy', 'Referrer-Policy', 'Strict-Transport-Security',
    'X-Content-Type-Options', 'X-Frame-Options',
  ]);
  assert.equal(cfg.headers[0].source, '/(.*)');
});

test('the deployed set is what it was before Phase 5.5, plus the two split modules', () => {
  // Phase 5.5 splits report.js three ways and adds nothing else to the site.
  // Anything else appearing here is unintended.
  const before = execFileSync('git', ['ls-tree', '-r', '--name-only', '0476898'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const patterns = ignorePatterns();
  const beforeDeployed = new Set(before.filter((f) => !isIgnored(f, patterns)));

  const added = deploySet().filter((f) => !beforeDeployed.has(f));
  assert.deepEqual(added.sort(), ['report-render.js', 'report-result.js']);

  const removed = [...beforeDeployed].filter((f) => !deploySet().includes(f));
  assert.deepEqual(removed, [], 'nothing the site had may disappear');
});

test('the exclusion is doing real work, and this test is not vacuous', () => {
  // Guards the guard: if .vercelignore stopped matching anything, every test
  // above would pass trivially on a set that excludes nothing.
  const tracked = trackedFiles();
  const deployed = deploySet();
  assert.ok(deployed.length > 20, 'the site still has files');
  assert.ok(tracked.length > deployed.length, 'the ignore list removes something');

  const excluded = tracked.filter((f) => !deployed.includes(f));
  for (const f of ['CLAUDE.md', 'dev/report-harness.html', 'package.json', 'dev/test/deploy-safety.test.js']) {
    assert.ok(excluded.includes(f), `${f} must be among the excluded`);
  }
});

// ── the marketing domain must never serve the audit console ─────────────────
//
// Phase 5.8 P0. Visiting speculaone.com in a normal browser could land on the
// AHP console, while a private window reliably showed the marketing site. The
// server side is clean: apex redirects to www, www/sw.js is 404, no page here
// registers a worker, and Vercel maps the two projects to separate hostnames.
// A service worker outlives the deployment that installed it, though, so a
// historical deployment of the console on this hostname would leave one still
// controlling this origin and still serving its cached app shell.
//
// report.html already carried the unregister block. These tests are what stop
// the other entry pages from being left out of it again.

const ENTRY_PAGES = ['index.html', 'about.html', 'report.html'];

test('every marketing entry page clears stale service workers and caches', () => {
  for (const page of ENTRY_PAGES) {
    const html = read(page);
    assert.match(html, /navigator\.serviceWorker\.getRegistrations\(\)/,
      `${page} does not unregister stale service workers`);
    assert.match(html, /r\.unregister\(\)/, `${page} looks up registrations without unregistering them`);
    assert.match(html, /caches\.keys\(\)/, `${page} does not clear stale caches`);
    assert.match(html, /caches\.delete\(/, `${page} lists caches without deleting them`);
  }
});

test('the guard runs from the head, before the page renders', () => {
  // Late in the body it would still unregister, but only after the stale
  // worker had already answered the navigation.
  for (const page of ENTRY_PAGES) {
    const html = read(page);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes('navigator.serviceWorker.getRegistrations()'),
      `${page} has the guard outside its <head>`);
  }
});

test('the marketing site never registers a service worker of its own', () => {
  // The console is a PWA. This site is not, and must not become one by
  // accident: registering here is what created the problem in the first place.
  for (const page of ENTRY_PAGES) {
    const html = read(page);
    assert.equal(/serviceWorker\s*\.\s*register\s*\(/.test(html), false,
      `${page} registers a service worker`);
  }
});

test('no marketing page redirects to the audit console', () => {
  // There is no cross-domain redirect today and there must not be one: a
  // visitor to the marketing domain should always see the marketing site.
  for (const page of ENTRY_PAGES) {
    const html = read(page);
    assert.equal(/location\s*(\.href|\.replace|\.assign)?\s*=?\s*[('"]*https?:\/\/audit\./.test(html), false,
      `${page} sends visitors to the audit console`);
  }
});

test('vercel.json declares no redirects or rewrites at all', () => {
  // The separation is by hostname in Vercel. A redirect rule added here would
  // be the one mechanism that could legitimately cross the domains.
  const cfg = JSON.parse(read('vercel.json'));
  assert.equal('redirects' in cfg, false, 'vercel.json has gained a redirects block');
  assert.equal('rewrites' in cfg, false, 'vercel.json has gained a rewrites block');
});
