/**
 * Design-system verification (spec §8.5).
 *
 * The mockup's contrast audit was a page you looked at. This is the same
 * audit as an assertion, which is what §8.5 asks for once the design system
 * moves into the real frontend.
 *
 * It matters because of the specific trap this palette contains: alpha
 * degrades ASYMMETRICALLY on theme inversion. `white @70%` on void blue is
 * 6.98:1, but `ink @70%` on mint is 4.10:1 — below AA. Every muted token
 * silently failed when the theme flipped, and none of it was visible by eye.
 * So ratios are computed with alpha COMPOSITED AGAINST THE REAL BACKGROUND,
 * never approximated from the token value.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

// ── Token extraction ─────────────────────────────────────────────────
function token(name) {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  assert.ok(m, `token --${name} not found in globals.css`);
  return m[1].trim();
}

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  assert.ok(rgba, `cannot parse colour: ${value}`);
  return {
    r: +rgba[1], g: +rgba[2], b: +rgba[3],
    a: rgba[4] === undefined ? 1 : +rgba[4],
  };
}

/** Composite a possibly-translucent foreground over an opaque background. */
function composite(fg, bg) {
  return {
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
    a: 1,
  };
}

function relativeLuminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgValue, bgValue) {
  const bg = parseColor(bgValue);
  assert.equal(bg.a, 1, 'background must be opaque to measure against');
  const fg = composite(parseColor(fgValue), bg);
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const CANVAS = token('color-canvas');
const INK = token('color-ink');
const SURFACE = token('color-surface');
const WHITE = token('color-paper-white');

// WCAG AA: 4.5:1 for normal text, 3:1 for non-text graphics (1.4.11).
const TEXT_FLOOR = 4.5;
const GRAPHIC_FLOOR = 3.0;

const TEXT_PAIRS = [
  ['ink on canvas',              INK,                     CANVAS],
  ['loud on canvas',             token('color-loud'),     CANVAS],
  ['purple on canvas',           token('color-purple'),   CANVAS],
  ['green on canvas',            token('color-green'),    CANVAS],
  ['muted on canvas',            token('muted'),          CANVAS],
  ['faint on canvas (floor)',    token('faint'),          CANVAS],

  // Cards fill with --color-surface, so every token used INSIDE a card must
  // be measured against the surface, not the canvas. This is the pairing set
  // most easily forgotten, because the tokens were derived against canvas.
  ['ink on surface',             INK,                     SURFACE],
  ['muted on surface',           token('muted'),          SURFACE],
  ['faint on surface',           token('faint'),          SURFACE],
  ['loud on surface (src link)', token('color-loud'),     SURFACE],
  ['purple on surface',          token('color-purple'),   SURFACE],
  ['green on surface',           token('color-green'),    SURFACE],

  // The one dark surface: assistant recommendation cards (§8.3).
  ['white on ink',               WHITE,                   INK],
  ['canvas on ink (banner)',     CANVAS,                  INK],
  ['rec .rec-provider',          'rgba(255,255,255,.7)',  INK],
  ['rec .why',                   'rgba(255,255,255,.85)', INK],
  ['rec .caveat',                'rgba(255,255,255,.8)',  INK],
  ['rec .rec-meta',              'rgba(255,255,255,.6)',  INK],
];

const GRAPHIC_PAIRS = [
  ['rule on canvas',        token('rule'),               CANVAS],
  ['rule on surface',       token('rule'),               SURFACE],
  ['ink hairline on canvas', INK,                        CANVAS],
  ['surface on canvas',     SURFACE,                     CANVAS], // card fill lift — see note
  ['rec meta divider',      'rgba(255,255,255,.4)',      INK],
];

test('every text pairing meets WCAG AA (4.5:1)', () => {
  const failures = [];
  for (const [name, fg, bg] of TEXT_PAIRS) {
    const ratio = contrast(fg, bg);
    if (ratio < TEXT_FLOOR) failures.push(`${name}: ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(failures, [], `text pairings below ${TEXT_FLOOR}:1`);
});

test('boundary graphics meet WCAG 1.4.11 (3:1)', () => {
  // --color-surface is a deliberate exception: at 1.26:1 against the canvas
  // it is a subtle FILL lift, not a boundary. The card's boundary is the
  // 1px --rule border, which is the thing that must pass. Asserting the fill
  // would be asserting the wrong element.
  const failures = [];
  for (const [name, fg, bg] of GRAPHIC_PAIRS) {
    if (name === 'surface on canvas') continue;
    const ratio = contrast(fg, bg);
    if (ratio < GRAPHIC_FLOOR) failures.push(`${name}: ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(failures, [], `graphic pairings below ${GRAPHIC_FLOOR}:1`);
});

test('the retired accents are still retired', () => {
  // Warm Blue #00BDB6 measures 1.64:1 on the canvas — mint on mint. It was
  // removed from the interactive palette and must not creep back as the loud
  // accent, which is the natural instinct when someone sees a teal brand.
  assert.ok(contrast('#00BDB6', CANVAS) < 2, 'sanity: warm blue is unusable on canvas');
  assert.notEqual(token('color-loud').toLowerCase(), '#00bdb6', 'loud accent must not be Warm Blue');

  // The dark-canvas "lifted" accents fail on light. Guard against a revert.
  for (const lifted of ['#E86A96', '#B58CF0', '#5FC79A']) {
    assert.ok(contrast(lifted, CANVAS) < 3, `${lifted} should fail on the light canvas`);
  }
});

test('no white text or hairlines on the canvas', () => {
  // Paper White measures 1.43:1 against the canvas.
  assert.ok(contrast(WHITE, CANVAS) < 2);
  // White is legitimate ONLY inside .rec, the one dark surface.
  const outsideRec = css
    .split('\n')
    .filter((l) => /color:\s*(#fff|#ffffff|white)\b/i.test(l))
    .filter((l) => !/rec/i.test(l));
  assert.deepEqual(outsideRec, [], 'white text outside the one dark surface');
});

test('structural rules from §8.4 hold', () => {
  assert.ok(!/box-shadow/i.test(css), 'flat only — no shadows, glows or elevation');
  assert.ok(!/text-shadow/i.test(css), 'flat only — no text shadows');

  // Ghost pills only — .pill must never take a fill.
  const pillBlock = css.match(/\.pill\s*\{([^}]*)\}/);
  assert.ok(pillBlock, '.pill rule not found');
  assert.match(pillBlock[1], /background:\s*transparent/, 'pills must be ghost, never filled');

  // One typeface. --font-feijoa is the only family declaration.
  const families = [...css.matchAll(/font-family:\s*([^;]+);/g)]
    .map((m) => m[1].trim())
    .filter((v) => v !== 'inherit' && !v.startsWith("'Feijoa'") && !v.startsWith('var(--font-feijoa)'));
  assert.deepEqual(families, [], 'a second typeface has been introduced');
});

test('alpha tokens sit at or above the measured floor, not by eye', () => {
  // The usable range between full ink and the 4.5:1 floor is only ~26% of
  // alpha, which is why hierarchy below secondary comes from size and weight
  // rather than further opacity steps. A fourth, fainter step would fail.
  const faint = contrast(token('faint'), CANVAS);
  assert.ok(faint >= TEXT_FLOOR, `--faint is the floor: ${faint.toFixed(2)}:1`);

  const hypotheticalFourthStep = contrast('rgba(19,56,68,.65)', CANVAS);
  assert.ok(
    hypotheticalFourthStep < TEXT_FLOOR,
    'a fourth opacity step should fail — if it passes, the floor moved',
  );
});
