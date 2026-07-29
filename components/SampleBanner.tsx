/**
 * Driven by ListingView.isSample, which is set by the data SOURCE — not a
 * hardcoded flag. When Supabase is configured and returns real approved
 * records the banner disappears on its own; while the site runs on invented
 * data it cannot be silenced without changing where the data comes from.
 */
export function SampleBanner({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="banner label" role="status">
      Sample data — every award, amount and deadline shown is invented. No scraping has been run.
    </div>
  );
}
