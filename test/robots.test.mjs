import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed } from '../scripts/lib/polite-fetch.mjs';

/**
 * robots.txt handling is the one part of the crawler where a bug is not a
 * bug but a breach of etiquette against a real institution's server — or,
 * in the direction this file was written for, a silent refusal to crawl a
 * college that never said no.
 */

test('wildcard in the middle of a pattern does not match everything', () => {
  // Drupal's default robots.txt. Truncating at the asterisk leaves the
  // literal "/" — which matches every path AND wins the longest-match
  // tie-break, fencing off the whole site. This is what blocked Newnham on
  // the first discovery run.
  const { rules } = parseRobots(['User-agent: *', 'Disallow: /*/media/oembed'].join('\n'));

  assert.equal(isAllowed(rules, '/about/student-funding'), true);
  assert.equal(isAllowed(rules, '/'), true);
  assert.equal(isAllowed(rules, '/node/12/media/oembed'), false);
});

test('the full Drupal boilerplate leaves ordinary pages crawlable', () => {
  const { rules } = parseRobots(
    [
      'User-agent: *',
      'Allow: /core/*.css$',
      'Disallow: /core/',
      'Disallow: /admin/',
      'Disallow: /search/',
      'Disallow: /user/login',
      'Disallow: /*/media/oembed',
      'Disallow: /index.php/*/media/oembed',
    ].join('\n'),
  );

  assert.equal(isAllowed(rules, '/undergraduate/funding'), true);
  assert.equal(isAllowed(rules, '/admin/config'), false);
  assert.equal(isAllowed(rules, '/core/misc/drupal.js'), false);
  assert.equal(isAllowed(rules, '/core/themes/a.css'), true, 'anchored Allow must win');
});

test('a group naming us overrides the wildcard group, in both directions', () => {
  const blocked = parseRobots(
    ['User-agent: *', 'Disallow:', '', 'User-agent: CambridgeFundingFinder', 'Disallow: /'].join(
      '\n',
    ),
  );
  assert.equal(blocked.matchedNamedGroup, true);
  assert.equal(isAllowed(blocked.rules, '/funding'), false, 'a college must be able to opt out');

  const permitted = parseRobots(
    ['User-agent: *', 'Disallow: /', '', 'User-agent: CambridgeFundingFinder', 'Disallow:'].join(
      '\n',
    ),
  );
  assert.equal(isAllowed(permitted.rules, '/funding'), true, 'and to opt in');
});

test('rules aimed at other crawlers do not apply to us', () => {
  // Churchill blocks ClaudeBot outright. We are a different, named agent —
  // but we still inherit the wildcard group's crawl-delay.
  const { rules, delayMs, matchedNamedGroup } = parseRobots(
    [
      'User-agent: GPTBot',
      'Disallow: /',
      '',
      'User-agent: ClaudeBot',
      'Disallow: /',
      '',
      'User-agent: *',
      'Crawl-delay: 5',
      'Disallow: /wp-content/uploads/2026/01/private.pdf',
    ].join('\n'),
  );

  assert.equal(matchedNamedGroup, false);
  assert.equal(isAllowed(rules, '/about/student-support/'), true);
  assert.equal(isAllowed(rules, '/wp-content/uploads/2026/01/private.pdf'), false);
  assert.equal(delayMs, 5000, "the site's crawl-delay must beat our 1.1s floor");
});

test('consecutive User-agent lines share one group', () => {
  const { rules } = parseRobots(
    ['User-agent: BadBot', 'User-agent: CambridgeFundingFinder', 'Disallow: /secret'].join('\n'),
  );
  assert.equal(isAllowed(rules, '/secret/page'), false);
});

test('crawl-delay never drops below our own floor', () => {
  const { delayMs } = parseRobots(['User-agent: *', 'Crawl-delay: 0.1'].join('\n'));
  assert.ok(delayMs >= 1100, `expected >= 1100ms, got ${delayMs}`);
});

test('an empty Disallow value means allow all', () => {
  const { rules } = parseRobots(['User-agent: *', 'Disallow:'].join('\n'));
  assert.equal(isAllowed(rules, '/anything'), true);
});

test('regex metacharacters in a path are treated literally', () => {
  const { rules } = parseRobots(['User-agent: *', 'Disallow: /a+b(c)/'].join('\n'));
  assert.equal(isAllowed(rules, '/a+b(c)/page'), false);
  assert.equal(isAllowed(rules, '/aaab/page'), true);
});
