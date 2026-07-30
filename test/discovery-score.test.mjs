import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCandidate,
  isNoisePath,
  extractLinks,
  textOf,
  STUDENT_TERMS,
  DONOR_TERMS,
  NOISE_PATH_TERMS,
  CONTENT_SIGNALS,
} from '../scripts/lib/score.mjs';

/**
 * Discovery scoring, tested against the real URLs that shaped it.
 *
 * These are not hypothetical strings — every path below is one a Cambridge
 * college actually serves, and each of the first three tests corresponds to a
 * wrong answer this stage gave before the rule it now checks existed.
 */

const link = (path, text = '') => ({ url: 'https://x.cam.ac.uk' + path, host: 'x.cam.ac.uk', path, text });

test('a regex that matches nothing fails loudly here', () => {
  // The bug this file exists for: a shell heredoc ate the word-boundary
  // escapes, so the signals became patterns containing literal backspace
  // characters. They compiled, ran, matched nothing, and raised no error.
  for (const [name, terms] of Object.entries({ STUDENT_TERMS, DONOR_TERMS, NOISE_PATH_TERMS, CONTENT_SIGNALS })) {
    for (const [re] of terms) {
      assert.ok(re instanceof RegExp, `${name}: not a RegExp`);
      assert.doesNotMatch(re.source, /[\x00-\x08\x0b\x0c\x0e-\x1f]/, `${name}: ${JSON.stringify(re.source)} contains a control character`);
    }
  }
});

test('donor pages score below student pages', () => {
  // Darwin's homepage offers only these. Returning zero candidates is the
  // correct answer; returning the donate page is the failure mode.
  assert.ok(scoreCandidate(link('/alumni-and-supporters/donate/')) <= 0);
  assert.ok(scoreCandidate(link('/alumni-and-supporters/the-campaign-for-darwin-college/')) <= 0);
  assert.ok(scoreCandidate(link('/study-here/postgraduates/funding-financial-support')) > 0);
});

test('a news story about a grant is excluded, not merely penalised', () => {
  // Wolfson. This page really does list amounts, eligibility and how to
  // apply, so content scoring rescued it every time it was only penalised.
  const article = link('/news/california-cape-town-travel-grants-send-wolfson-students-around-world');
  assert.equal(isNoisePath(article), true);

  const real = link('/support-services/financial/hardship-funds');
  assert.equal(isNoisePath(real), false);
  assert.ok(scoreCandidate(real) > 0);
});

test('a person is not a grant', () => {
  assert.equal(isNoisePath(link('/people/tom-grant')), true);
});

test('research fellowships are not caught by the fellow filter', () => {
  // `\bfellows?\b` must not fire on "fellowships" — those can be real funding.
  assert.equal(isNoisePath(link('/research/research-fellowships')), false);
});

test('the paths actually promoted for each college still score', () => {
  const promoted = [
    '/study/awards/',
    '/financial-support-0',
    '/joining-selwyn/graduates/funding',
    '/applying-here/postgraduate-admissions/postgraduate-funding-and-scholarships/',
    '/apply/financial-support/financial-support-for-undergraduates/undergraduate-scholarships-bursaries-and-prizes',
    '/about/student-support/',
    '/undergraduate/finance/financial-support/',
  ];
  for (const p of promoted) {
    assert.ok(scoreCandidate(link(p)) > 0, `${p} should score above zero`);
    assert.equal(isNoisePath(link(p)), false, `${p} should not be excluded as noise`);
  }
});

test('the path outweighs anchor text', () => {
  const inPath = scoreCandidate(link('/hardship-fund/'));
  const inText = scoreCandidate(link('/x/', 'hardship fund'));
  assert.ok(inPath > inText, 'a URL segment is a deliberate choice; prose may not be');
});

test('extractLinks resolves relative hrefs and drops fragments', () => {
  const links = extractLinks(
    '<a href="/funding#top">Funding</a><a href="mailto:x@y.z">Mail</a><a href="https://other.com/a">Off-site</a>',
    'https://x.cam.ac.uk/page',
  );
  assert.equal(links.length, 2);
  assert.equal(links[0].url, 'https://x.cam.ac.uk/funding');
  assert.equal(links[0].text, 'funding');
  assert.equal(links[1].host, 'other.com', 'off-site links are returned; the caller filters by host');
});

test('textOf removes scripts and styles, not just tags', () => {
  const out = textOf('<style>a{}</style><script>var x=1</script><p>Grants of £500</p>');
  assert.match(out, /Grants of £500/);
  assert.doesNotMatch(out, /var x/);
  assert.doesNotMatch(out, /a\{\}/);
});

test('recipient lists and report pages are excluded', () => {
  // Pembroke publishes past students' elective write-ups under a URL that
  // reads exactly like a grant index. Extraction mined it for 29 "awards"
  // that were student names and destinations — and every quote was verbatim,
  // so the evidence checker passed them. Verifying that a quote exists is not
  // verifying that the record is an award; this has to be caught here.
  assert.equal(
    isNoisePath(link('/current-students/finance-information/travel-grant-reports/medical-and-veterinary-electives')),
    true,
  );
  assert.equal(isNoisePath(link('/funding/past-recipients')), true);

  // But a real funding index containing the word "support" must survive.
  assert.equal(isNoisePath(link('/undergraduates/financial-support/special-bursaries-and-funds')), false);
  assert.equal(isNoisePath(link('/postgraduates/fees-and-funding')), false);
});
