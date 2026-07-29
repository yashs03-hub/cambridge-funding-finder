export function Footer({ isSample }: { isSample: boolean }) {
  return (
    <footer>
      {isSample && (
        <p>
          <strong>Sample data.</strong> Every award, amount and deadline on this site is invented
          for design review. No scraping has been run and no real Cambridge funding data is
          represented here.
        </p>
      )}
      {/* Required by §12 whether or not the data is real: listings are
          aggregated from public pages and can lag the college's own site. */}
      <p>
        Listings are aggregated from publicly available college pages and may be out of date.
        <strong> Always confirm the deadline and eligibility with the college before relying on
        it.</strong> Each entry links to the source page it was read from.
      </p>
      <p>
        Central postgraduate funding — Gates, Cambridge Trust, UKRI, Harding — is indexed at{' '}
        <a href="https://www.student-funding.cam.ac.uk/">student-funding.cam.ac.uk</a>. This site
        deliberately covers only the college awards that no central database lists.
      </p>
    </footer>
  );
}
