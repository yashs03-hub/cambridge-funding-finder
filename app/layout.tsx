import type { Metadata } from 'next';
import { Newsreader } from 'next/font/google';
import { Nav } from '@/components/Nav';
import { SampleBanner } from '@/components/SampleBanner';
import { isSampleMode } from '@/lib/data';
import './globals.css';

/**
 * Newsreader is the PUBLIC fallback face. Feijoa is loaded by `src: local()`
 * only — it is a desktop licence and serving the file would be
 * redistribution — so most visitors never see it. Newsreader measures ~16%
 * narrower than Feijoa on the same string, which is why no layout in this
 * app may depend on a specific wrap point (§8.1).
 */
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-newsreader',
});

export const metadata: Metadata = {
  title: 'CAM|FUND — Cambridge college funding',
  description:
    'The small college awards no central database indexes: travel grants, hardship funds, book grants, conference bursaries and prizes across all 31 Cambridge colleges.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body>
        {/* Above the nav, not below it: if the awards on screen are invented,
            that is the first thing a student should read, not a footnote. */}
        <SampleBanner show={isSampleMode()} />
        <Nav />
        {children}
      </body>
    </html>
  );
}
