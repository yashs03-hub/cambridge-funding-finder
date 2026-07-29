'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Two v1 nav items: COLLEGES and ASK.
 * DEPARTMENTS is added only when it has data — an empty tab reads worse
 * than an absent one (§7).
 */
const LINKS = [
  { href: '/', label: 'Colleges' },
  { href: '/ask', label: 'Ask the assistant' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav>
      <Link href="/" className="wordmark">
        CAM<span className="bar">|</span>FUND
      </Link>
      <ul className="nav-links label">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className={pathname === l.href ? 'active' : undefined}
              aria-current={pathname === l.href ? 'page' : undefined}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="nav-utility label" aria-hidden="true">
        <span>31 colleges</span>
      </div>
    </nav>
  );
}
