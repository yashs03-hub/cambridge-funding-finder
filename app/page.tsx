import { Listing } from '@/components/Listing';
import { Footer } from '@/components/Footer';
import { EXPECTED_COLLEGE_COUNT } from '@/lib/colleges';
import { getListing } from '@/lib/data';

// Deadlines are time-relative, so a statically cached page would eventually
// render a passed deadline as open. Revalidate hourly.
export const revalidate = 3600;

export default async function HomePage() {
  const listing = await getListing();

  return (
    <>
      <header className="hero">
        {/* Display type, used exactly once in the product (§8.4). */}
        <h1>every fund. one place.</h1>
        <p>
          The small college awards that no central database indexes — travel grants, hardship
          funds, book grants, conference bursaries and prizes, gathered from all{' '}
          {EXPECTED_COLLEGE_COUNT} Cambridge colleges.
        </p>
        <div className="stat-row label">
          <div>
            <span>Colleges with listed awards</span>
            <strong>
              {listing.providerCount} / {EXPECTED_COLLEGE_COUNT}
            </strong>
          </div>
          <div>
            <span>Awards listed</span>
            <strong>{listing.items.length}</strong>
          </div>
          <div>
            <span>Last verified</span>
            <strong>{listing.lastRefreshed ?? 'Never'}</strong>
          </div>
        </div>
      </header>

      <Listing items={listing.items} />
      <Footer isSample={listing.isSample} />
    </>
  );
}
