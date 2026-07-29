import { AskForm } from '@/components/AskForm';
import { Footer } from '@/components/Footer';
import { getListing } from '@/lib/data';

export const revalidate = 3600;

export default async function AskPage() {
  const listing = await getListing();

  return (
    <>
      <section className="assistant" id="assistant">
        <div className="inner">
          <div className="section-head">
            <h2>Ask the assistant</h2>
            {/* No login, no stored personal data, no GDPR surface (§2). The
                assistant asks for year/subject/status in the prompt rather
                than remembering it. */}
            <div className="count label">Stateless — nothing is saved</div>
          </div>

          <AskForm />
        </div>
      </section>

      <Footer isSample={listing.isSample} />
    </>
  );
}
